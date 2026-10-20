import { isSolanaAddress, isSolanaSignature } from "./base58";
import { solanaRpc } from "./chain";

/**
 * Moon is the $MOON token itself: an SPL token on Solana.
 *
 * Players pay for things by signing a token transfer in their own wallet, and
 * the server only reads the chain to confirm it landed. The server holds no key.
 *
 * The mint is configuration, so any SPL token can stand in until $MOON ships on
 * Solana. Blank means holdings read as zero, everyone starts in Trenches, and
 * purchases fall back to the off-chain dev balance.
 */

/**
 * Decimals are read from the mint at boot, not configured, so swapping the token
 * is a one-line change to MOON_TOKEN_MINT. MOON_TOKEN_DECIMALS stays as an
 * escape hatch; leave it blank and the chain decides.
 */
const DECIMALS_OVERRIDE = envIntOrNull("MOON_TOKEN_DECIMALS");
let resolvedDecimals: number | null = null;

export function tokenDecimals(): number {
  return DECIMALS_OVERRIDE ?? resolvedDecimals ?? 9;
}

function envIntOrNull(name: string): number | null {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 36 ? n : null;
}

function envSolanaAddress(name: string): string | null {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  if (!isSolanaAddress(raw)) {
    console.warn(`[moonville] ${name} is not a valid Solana address, ignoring: ${raw}`);
    return null;
  }
  return raw;
}

/** The SPL mint. */
export const TOKEN_MINT = envSolanaAddress("MOON_TOKEN_MINT");

/**
 * Where purchases are paid to: the owner wallet, not a token account. The
 * client derives the associated token account from it.
 *
 * An address, never a key. Nothing here can be drained by compromising the
 * game server.
 */
export const PAYMENT_ADDRESS = envSolanaAddress("MOON_PAYMENT_ADDRESS");

const TOKEN_SYMBOL = (process.env.MOON_TOKEN_SYMBOL ?? "").trim() || "MOON";

export function tokenConfigured() {
  return TOKEN_MINT !== null;
}

export function paymentsConfigured() {
  return PAYMENT_ADDRESS !== null;
}

/**
 * Whole tokens to base units, without floating point. Decimal input is
 * truncated, never rounded up, so we cannot credit more than was sent.
 */
export function toBaseUnits(amount: string | number, decimals = tokenDecimals()): bigint {
  const text = typeof amount === "number" ? amount.toFixed(decimals) : amount.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`not a positive decimal amount: ${amount}`);
  const [whole, fraction = ""] = text.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Base units to whole tokens, for display only. Never feed this back into maths. */
export function toDisplayUnits(base: bigint, decimals = tokenDecimals()): number {
  const scale = 10n ** BigInt(decimals);
  const whole = base / scale;
  const cents = ((base % scale) * 100n) / scale;
  return Number(whole) + Number(cents) / 100;
}

let meta: { symbol: string; decimals: number } | null = null;

export function tokenMeta() {
  return meta;
}

/**
 * Reads the mint's decimals once at boot. Call before serving: every balance
 * conversion depends on the answer.
 *
 * Failure is loud but not fatal - holdings read as zero and everyone lands in
 * the lowest district. That is the safe direction to fail.
 */
export async function initToken() {
  if (!TOKEN_MINT) {
    console.log("[moonville] MOON_TOKEN_MINT is not set - holdings read as zero, everyone starts in Trenches.");
    return null;
  }
  try {
    const supply = await solanaRpc<{ value: { decimals: number } }>("getTokenSupply", [TOKEN_MINT]);
    resolvedDecimals = Number(supply.value.decimals);
    meta = { symbol: TOKEN_SYMBOL, decimals: resolvedDecimals };
    if (DECIMALS_OVERRIDE !== null && DECIMALS_OVERRIDE !== resolvedDecimals) {
      console.warn(
        `[moonville] MOON_TOKEN_DECIMALS overrides the mint: env ${DECIMALS_OVERRIDE}, chain ${resolvedDecimals}. ` +
          "Unset it unless the mint is non-standard.",
      );
    }
    console.log(`[moonville] Moon is ${meta.symbol} at mint ${TOKEN_MINT}, ${tokenDecimals()} decimals`);
    return meta;
  } catch (error) {
    console.error(`[moonville] could not read the mint ${TOKEN_MINT}. Holdings will read as zero.`, error);
    return null;
  }
}

type ParsedTokenAccount = {
  account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } };
};

/**
 * A wallet's $MOON balance in base units, summed over every token account it
 * owns for the mint (usually just the associated one). Null if unreadable.
 */
export async function readTokenBalance(owner: string): Promise<bigint | null> {
  if (!TOKEN_MINT || !isSolanaAddress(owner)) return null;
  try {
    const result = await solanaRpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
      owner,
      { mint: TOKEN_MINT },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    return result.value.reduce(
      (sum, acc) => sum + BigInt(acc.account.data.parsed.info.tokenAmount.amount || "0"),
      0n,
    );
  } catch (error) {
    console.warn("[moonville] token balance lookup failed", error);
    return null;
  }
}

export type PaymentCheck = { ok: true; amount: bigint; from: string } | { ok: false; reason: string };

type TokenBalance = { mint: string; owner?: string; uiTokenAmount: { amount: string } };

type ParsedTransaction = {
  meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
  transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[] } };
};

/** Net change in `owner`'s balance of our mint across a transaction. */
function deltaFor(tx: ParsedTransaction, owner: string): bigint {
  const sum = (rows: TokenBalance[] | undefined) =>
    (rows ?? [])
      .filter((b) => b.mint === TOKEN_MINT && b.owner === owner)
      .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount || "0"), 0n);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

/**
 * Confirms that a transaction really paid for something.
 *
 * Every fact is read from the chain rather than trusted from the client: a
 * signature is public, so without these a player could replay someone else's
 * transfer, point at a payment to a different address, or pay a penny for a car.
 *
 *  - the transaction exists, is confirmed and did not fail
 *  - the paying wallet signed it
 *  - our payment wallet's balance of OUR mint rose by at least the price the
 *    SERVER set, and the payer's fell by at least as much
 *
 * Balance deltas rather than instruction parsing, so Token and Token-2022
 * transfers, transferChecked or not, are all read the same way.
 *
 * Replay across purchases is stopped separately, by storing the signature.
 */
export async function verifyPayment(signature: string, from: string, minAmount: bigint): Promise<PaymentCheck> {
  if (!TOKEN_MINT) return { ok: false, reason: "No token is configured." };
  if (!PAYMENT_ADDRESS) return { ok: false, reason: "No payment address is configured." };
  if (!isSolanaSignature(signature)) return { ok: false, reason: "That is not a transaction signature." };
  if (!isSolanaAddress(from)) return { ok: false, reason: "Bad wallet address." };
  if (from === PAYMENT_ADDRESS) return { ok: false, reason: "That wallet cannot pay itself." };

  // The client reports the signature the moment the wallet returns, which can
  // be before the cluster has confirmed it. Poll briefly rather than failing.
  let tx: ParsedTransaction | null = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      tx = await solanaRpc<ParsedTransaction | null>("getTransaction", [
        signature,
        { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ]);
    } catch (error) {
      console.warn("[moonville] transaction lookup failed", error);
    }
    if (tx) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!tx || !tx.meta) return { ok: false, reason: "That transaction has not confirmed." };
  if (tx.meta.err) return { ok: false, reason: "That transaction failed on-chain." };

  const signed = tx.transaction.message.accountKeys.some((k) => k.pubkey === from && k.signer);
  if (!signed) return { ok: false, reason: "That transaction was not signed by your linked wallet." };

  const received = deltaFor(tx, PAYMENT_ADDRESS);
  const sent = -deltaFor(tx, from);
  if (received < minAmount || sent < minAmount) {
    return { ok: false, reason: "That transaction did not pay the right amount to the right address." };
  }
  return { ok: true, amount: received, from };
}
