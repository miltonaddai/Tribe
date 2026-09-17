import { createPublicClient, decodeEventLog, erc20Abi, http, getAddress, type Address } from "viem";
import { CHAIN_RPC } from "./chain";

/**
 * Tribute is the $TRIBE token itself, held as a deposited float.
 *
 * Players move real tokens to the treasury, the server credits an in-game
 * balance one-for-one, and spending draws down that balance without a wallet
 * popup. Withdrawing sends tokens back. The signing moments are the boundary,
 * not every purchase.
 *
 * The address is configuration, so any ERC-20 can stand in until $TRIBE ships.
 */

/**
 * Decimals are read from the contract at boot, not configured, so swapping the
 * token is a one-line change to TRIBE_TOKEN_ADDRESS. A second env var holding a
 * copy of something the chain already knows is just a chance to get it wrong -
 * and getting it wrong scales every balance in the game by a power of ten.
 *
 * TRIBE_TOKEN_DECIMALS stays as an escape hatch for a non-standard contract that
 * does not expose decimals(); leave it blank and the chain decides.
 */
const DECIMALS_OVERRIDE = envIntOrNull("TRIBE_TOKEN_DECIMALS");
let resolvedDecimals: number | null = null;

export function tokenDecimals(): number {
  return DECIMALS_OVERRIDE ?? resolvedDecimals ?? 18;
}

function envIntOrNull(name: string): number | null {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 36 ? n : null;
}

function envAddress(name: string): Address | null {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  try {
    // Checksums and validates in one step; throws on anything malformed.
    return getAddress(raw);
  } catch {
    console.warn(`[tribe] ${name} is not a valid address, ignoring: ${raw}`);
    return null;
  }
}

export const TOKEN_ADDRESS = envAddress("TRIBE_TOKEN_ADDRESS");
/**
 * Where purchases are paid to.
 *
 * An address, never a key. Players sign their own transfers, so the server has
 * no ability to move anyone's tokens - it only reads the chain to confirm a
 * payment landed. Nothing here can be drained by compromising the game server.
 */
export const PAYMENT_ADDRESS = envAddress("TRIBE_PAYMENT_ADDRESS") ?? envAddress("TRIBE_TREASURY_ADDRESS");

/** Without a token address the game runs on an off-chain balance, as before. */
export function tokenConfigured() {
  return TOKEN_ADDRESS !== null;
}

export function paymentsConfigured() {
  return PAYMENT_ADDRESS !== null;
}

const client = createPublicClient({ transport: http(CHAIN_RPC) });

/**
 * Whole tokens to base units, without floating point.
 *
 * Never do this with Number: 18 decimals overflows the safe integer range, and
 * a ledger that drifts by rounding is an accounting hole rather than a display
 * bug. Decimal input is truncated, never rounded up, so we cannot credit more
 * than was actually sent.
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
  // Two decimal places is all the HUD shows; done in integers to avoid drift.
  const cents = ((base % scale) * 100n) / scale;
  return Number(whole) + Number(cents) / 100;
}

let meta: { symbol: string; name: string; decimals: number } | null = null;

export function tokenMeta() {
  return meta;
}

/**
 * Reads the token's identity from the chain once at boot and adopts its decimals.
 * Call before serving: every balance conversion depends on the answer.
 *
 * Failure is loud but not fatal - the server still runs, holdings read as zero,
 * and everyone lands in the lowest district. That is the safe direction to fail.
 */
export async function initToken() {
  if (!TOKEN_ADDRESS) {
    console.log("[tribe] TRIBE_TOKEN_ADDRESS is not set - holdings read as zero, everyone starts in Trench.");
    return null;
  }
  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
    ]);
    resolvedDecimals = Number(decimals);
    meta = { symbol: String(symbol), name: String(name), decimals: resolvedDecimals };
    if (DECIMALS_OVERRIDE !== null && DECIMALS_OVERRIDE !== resolvedDecimals) {
      console.warn(
        `[tribe] TRIBE_TOKEN_DECIMALS overrides the contract: env ${DECIMALS_OVERRIDE}, chain ${resolvedDecimals}. ` +
          "Unset it unless the contract is non-standard.",
      );
    }
    console.log(
      `[tribe] Tribute is ${meta.symbol} (${meta.name}) at ${TOKEN_ADDRESS}, ${tokenDecimals()} decimals`,
    );
    return meta;
  } catch (error) {
    console.error(
      `[tribe] could not read the token at ${TOKEN_ADDRESS}. Holdings will read as zero.`,
      error,
    );
    return null;
  }
}

/** A wallet's on-chain token balance, in base units. Null if it cannot be read. */
export async function readTokenBalance(address: string): Promise<bigint | null> {
  if (!TOKEN_ADDRESS) return null;
  let owner: Address;
  try {
    owner = getAddress(address.trim());
  } catch {
    return null;
  }
  try {
    return await client.readContract({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
  } catch (error) {
    console.warn("[tribe] token balance lookup failed", error);
    return null;
  }
}

export type PaymentCheck =
  | { ok: true; amount: bigint; from: Address }
  | { ok: false; reason: string };

/**
 * Confirms that a transaction really paid for something.
 *
 * Every field is checked against the chain rather than trusted from the client:
 * a hash is public, so without these a player could replay someone else's
 * transfer, point at a payment to a different address, or pay a penny for a car.
 *
 *  - the receipt exists and succeeded
 *  - a Transfer log came from OUR token contract, not a worthless lookalike
 *  - the sender is the wallet asking for the goods
 *  - the recipient is our payment address
 *  - the amount covers the price the SERVER set, not one the client supplied
 *
 * Replay across purchases is stopped separately, by storing the hash.
 */
export async function verifyPayment(txHash: string, from: string, minAmount: bigint): Promise<PaymentCheck> {
  if (!TOKEN_ADDRESS) return { ok: false, reason: "No token is configured." };
  if (!PAYMENT_ADDRESS) return { ok: false, reason: "No payment address is configured." };
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: "That is not a transaction hash." };

  let payer: Address;
  try {
    payer = getAddress(from.trim());
  } catch {
    return { ok: false, reason: "Bad wallet address." };
  }

  let receipt;
  try {
    // Waits for inclusion rather than failing on a hash the node has not seen
    // yet - the client reports it the moment the wallet returns.
    receipt = await client.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 30_000 });
  } catch {
    return { ok: false, reason: "That transaction has not confirmed." };
  }
  if (receipt.status !== "success") return { ok: false, reason: "That transaction failed on-chain." };

  for (const log of receipt.logs) {
    // Only our token counts. Anyone can deploy a contract that emits Transfer.
    if (getAddress(log.address) !== TOKEN_ADDRESS) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== "Transfer") continue;
    const { from: sender, to, value } = decoded.args as { from: Address; to: Address; value: bigint };
    if (getAddress(sender) !== payer) continue;
    if (getAddress(to) !== PAYMENT_ADDRESS) continue;
    if (value < minAmount) continue;
    return { ok: true, amount: value, from: payer };
  }
  return { ok: false, reason: "That transaction did not pay the right amount to the right address." };
}
