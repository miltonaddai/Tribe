/**
 * Paying for things on-chain.
 *
 * The player signs every purchase themselves: their wallet sends the tokens, and
 * the server only reads the chain to confirm it landed. Nothing here asks for an
 * allowance and the server holds no key, so there is nothing that could move a
 * player's tokens without them approving that exact transfer.
 */

import { apiUrl } from "./api";

export type TokenConfig = {
  address: string | null;
  payTo: string | null;
  decimals: number;
  symbol: string | null;
  chainId: number;
};

let cached: TokenConfig | null = null;

/** Fetched from the server so the payment address has one source of truth. */
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

/** True when purchases must be paid on-chain. Without it the game runs offline. */
export async function paymentsRequired() {
  const cfg = await tokenConfig();
  return Boolean(cfg?.address && cfg.payTo);
}

/**
 * Whole tokens to base units as a 32-byte hex word.
 *
 * BigInt throughout: 18 decimals puts even modest amounts past the range a
 * double can represent exactly, and a rounded amount is a failed purchase at
 * best and an overpayment at worst.
 */
function amountWord(whole: number, decimals: number): string {
  const units = BigInt(Math.round(whole)) * 10n ** BigInt(decimals);
  return units.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  return address.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

export type PayResult = { ok: true; txHash: string } | { ok: false; reason: string };

/**
 * Sends `price` whole tokens to the game's payment address and returns the hash.
 *
 * Calldata is hand-built rather than pulling in a web3 library for one function:
 * ERC-20 transfer is a four-byte selector and two 32-byte words.
 */
export async function payForPurchase(from: string, price: number): Promise<PayResult> {
  const cfg = await tokenConfig();
  if (!cfg?.address || !cfg.payTo) return { ok: false, reason: "Payments are not configured." };
  const ethereum = window.ethereum;
  if (!ethereum) return { ok: false, reason: "No wallet is connected." };

  // transfer(address,uint256)
  const data = `0xa9059cbb${addressWord(cfg.payTo)}${amountWord(price, cfg.decimals)}`;
  try {
    const txHash = (await ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from, to: cfg.address, data }],
    })) as string;
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return { ok: false, reason: "The wallet did not return a transaction." };
    }
    return { ok: true, txHash };
  } catch (error) {
    const code = (error as { code?: number }).code;
    // 4001 is the standard "user rejected", and is not worth an error message.
    if (code === 4001) return { ok: false, reason: "" };
    const message = (error as { message?: string }).message;
    return { ok: false, reason: message ?? "The payment failed." };
  }
}
