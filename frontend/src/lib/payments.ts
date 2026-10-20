/**
 * Paying for things on Solana.
 *
 * The player signs every purchase in their own linked wallet: an SPL burn of
 * $MOON from their own token account. The tokens are destroyed rather than
 * sent anywhere, so there is no store wallet. The server only reads the chain
 * to confirm the burn landed. Nothing here asks for a delegate and the server
 * holds no key, so nothing can touch a player's tokens without them approving
 * that exact burn.
 */

import { apiUrl } from "./api";
import { SOLANA_RPC } from "./chain";
import { loadSession } from "./session";
import { walletFor } from "./solanaWallets";

export type TokenConfig = {
  mint: string | null;
  decimals: number;
  symbol: string | null;
  cluster: string;
};

let cached: TokenConfig | null = null;

/** Fetched from the server so the mint being burned has one source of truth. */
export async function tokenConfig(): Promise<TokenConfig | null> {
  if (cached) return cached;
  try {
    const res = await fetch(apiUrl("/api/token"));
    if (!res.ok) return null;
    cached = (await res.json()) as TokenConfig;
    return cached;
  } catch {
    return null;
  }
}

/** True when purchases must be paid on-chain. Without it the game runs on the dev balance. */
export async function paymentsRequired() {
  const cfg = await tokenConfig();
  return Boolean(cfg?.mint);
}

export type PayResult = { ok: true; txHash: string } | { ok: false; reason: string };

/**
 * Whole tokens to base units. BigInt throughout: 9+ decimals puts modest
 * amounts past what a double represents exactly.
 */
function baseUnits(whole: number, decimals: number): bigint {
  return BigInt(Math.round(whole)) * 10n ** BigInt(decimals);
}

/**
 * Burns `price` whole $MOON from the linked wallet and returns the transaction
 * signature.
 *
 * Reads the mint's owning program so Token-2022 mints work the same as classic
 * ones. BurnChecked rather than Burn, so the wallet shows the amount with the
 * mint's decimals and the chain rejects it if they ever disagree.
 */
export async function payForPurchase(price: number): Promise<PayResult> {
  const cfg = await tokenConfig();
  if (!cfg?.mint) return { ok: false, reason: "Payments are not configured." };
  const from = loadSession()?.solanaAddress;
  if (!from) return { ok: false, reason: "Link a Solana wallet in Settings to buy anything." };
  const provider = await walletFor(from);
  if (!provider) return { ok: false, reason: "Open your linked wallet and approve this site, then try again." };

  try {
    // Loaded on first purchase only: these are large, and most visits never pay.
    const [{ Buffer }, web3, spl] = await Promise.all([
      import("buffer"),
      import("@solana/web3.js"),
      import("@solana/spl-token"),
    ]);
    globalThis.Buffer ??= Buffer;

    const connection = new web3.Connection(SOLANA_RPC, "confirmed");
    const mint = new web3.PublicKey(cfg.mint);
    const owner = new web3.PublicKey(from);

    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo) return { ok: false, reason: "The token mint could not be read." };
    const programId = mintInfo.owner;

    const source = spl.getAssociatedTokenAddressSync(mint, owner, false, programId);

    const tx = new web3.Transaction().add(
      spl.createBurnCheckedInstruction(
        source,
        mint,
        owner,
        baseUnits(price, cfg.decimals),
        cfg.decimals,
        [],
        programId,
      ),
    );
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    const { signature } = await provider.signAndSendTransaction(tx);
    if (typeof signature !== "string" || !signature) {
      return { ok: false, reason: "The wallet did not return a transaction." };
    }
    return { ok: true, txHash: signature };
  } catch (error) {
    const code = (error as { code?: number }).code;
    // 4001 is the standard "user rejected", and is not worth an error message.
    if (code === 4001) return { ok: false, reason: "" };
    const message = (error as { message?: string }).message ?? "";
    if (/reject|cancel|denied/i.test(message)) return { ok: false, reason: "" };
    return { ok: false, reason: message || "The payment failed." };
  }
}
