import { isSolanaAddress, isSolanaSignature } from "./base58";
import { SOLANA_CLUSTER, solanaRpc } from "./chain";

/**
 * Moon is the $MOON token itself: an SPL token on Solana.
 *
 * Players pay for things by burning $MOON from their own wallet - the tokens
 * are destroyed, not sent to anyone - and the server only reads the chain to
 * confirm the burn landed. The server holds no key and there is no store wallet.
 *
 * On mainnet the mint defaults to the official $MOON address. MOON_TOKEN_MINT
 * overrides it, so another SPL token can stand in on devnet; with no mint at
 * all, holdings read as zero, everyone starts in Trenches, and purchases fall
 * back to the off-chain dev balance.
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

/** The official $MOON mint on Solana mainnet. Keep in step with the frontend's lib/token.ts. */
export const OFFICIAL_MOON_MINT = "i6Z98UoNrVmqNSdKDhPdZaMmNZVcr8dAgaRrAMgpump";

/** The SPL mint. */
export const TOKEN_MINT =
  envSolanaAddress("MOON_TOKEN_MINT") ?? (SOLANA_CLUSTER === "mainnet-beta" ? OFFICIAL_MOON_MINT : null);

const TOKEN_SYMBOL = (process.env.MOON_TOKEN_SYMBOL ?? "").trim() || "MOON";

export function tokenConfigured() {
  return TOKEN_MINT !== null;
}

/** Purchases are burns of the mint, so a mint is all they need. */
export function paymentsConfigured() {
  return TOKEN_MINT !== null;
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

/** A jsonParsed instruction. Only SPL Token burns are looked at. */
type ParsedInstruction = {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      mint?: string;
      authority?: string;
      multisigAuthority?: string;
      amount?: string;
      tokenAmount?: { amount: string };
    };
  };
};

type ParsedTransaction = {
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: { instructions: ParsedInstruction[] }[];
  } | null;
  transaction: {
    message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: ParsedInstruction[] };
  };
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
 * Base units of our mint that `owner` burned in a transaction, from Burn and
 * BurnChecked instructions under either token program, top level or inner.
 */
function burnedBy(tx: ParsedTransaction, owner: string): bigint {
  const all = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((group) => group.instructions),
  ];
  let total = 0n;
  for (const ix of all) {
    if (ix.program !== "spl-token" && ix.program !== "spl-token-2022") continue;
    const type = ix.parsed?.type;
    if (type !== "burn" && type !== "burnChecked") continue;
    const info = ix.parsed?.info;
    if (!info || info.mint !== TOKEN_MINT) continue;
    if ((info.authority ?? info.multisigAuthority) !== owner) continue;
    total += BigInt(info.tokenAmount?.amount ?? info.amount ?? "0");
  }
  return total;
}

/**
 * Confirms that a transaction really paid for something by burning $MOON.
 *
 * Every fact is read from the chain rather than trusted from the client: a
 * signature is public, so without these a player could replay someone else's
 * burn, point at a transfer to their own second wallet, or burn a penny for a car.
 *
 *  - the transaction exists, is confirmed and did not fail
 *  - the paying wallet signed it
 *  - it burned at least the price the SERVER set of OUR mint, with the payer
 *    as the burn authority
 *  - the payer's balance fell by at least as much, so the burn was the payer's
 *    own tokens and not ones handed to them in the same transaction
 *
 * Replay across purchases is stopped separately, by storing the signature.
 */
export async function verifyPayment(signature: string, from: string, minAmount: bigint): Promise<PaymentCheck> {
  if (!TOKEN_MINT) return { ok: false, reason: "No token is configured." };
  if (!isSolanaSignature(signature)) return { ok: false, reason: "That is not a transaction signature." };
  if (!isSolanaAddress(from)) return { ok: false, reason: "Bad wallet address." };

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

  const burned = burnedBy(tx, from);
  const spent = -deltaFor(tx, from);
  if (burned < minAmount || spent < minAmount) {
    return { ok: false, reason: "That transaction did not burn the right amount of $MOON." };
  }
  return { ok: true, amount: burned, from };
}
