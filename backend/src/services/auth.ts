import { randomBytes } from "node:crypto";
import { verifyMessage, type Hex } from "viem";
import type { WalletChainId } from "@tribe/shared";
import { CHAIN_ID } from "./chain";

type NonceRecord = { nonce: string; expires: number };
const nonces = new Map<string, NonceRecord>();
const TTL_MS = 5 * 60 * 1000;

function key(address: string, chain: WalletChainId) {
  return `${chain}:${address.toLowerCase()}`;
}

export function issueNonce(address: string, chain: WalletChainId) {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(key(address, chain), { nonce, expires: Date.now() + TTL_MS });
  return nonce;
}

export function buildSignMessage(opts: {
  address: string;
  chain: WalletChainId;
  nonce: string;
  origin: string;
}) {
  // What the user signs against. Must match the network the wallet is switched to.
  const chainLine = String(CHAIN_ID);
  return [
    `${opts.origin} wants you to sign in to Tribe`,
    "",
    `URI: ${opts.origin}`,
    "Version: 1",
    `Chain ID: ${chainLine}`,
    `Nonce: ${opts.nonce}`,
    `Address: ${opts.address}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

function consumeNonce(address: string, chain: WalletChainId, nonce: string) {
  const rec = nonces.get(key(address, chain));
  if (!rec || rec.nonce !== nonce || rec.expires < Date.now()) return false;
  nonces.delete(key(address, chain));
  return true;
}

export async function verifySignedMessage(opts: {
  address: string;
  chain: WalletChainId;
  message: string;
  signature: string;
}): Promise<boolean> {
  const nonceMatch = opts.message.match(/^Nonce: ([a-f0-9]+)$/m);
  const addressMatch = opts.message.match(/^Address: (.+)$/m);
  if (!nonceMatch || !addressMatch) return false;
  if (addressMatch[1].toLowerCase() !== opts.address.toLowerCase()) return false;
  if (!consumeNonce(opts.address, opts.chain, nonceMatch[1])) return false;

  return verifyEvm(opts.address, opts.message, opts.signature);
}

async function verifyEvm(address: string, message: string, signature: string) {
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as Hex,
    });
  } catch {
    return false;
  }
}
