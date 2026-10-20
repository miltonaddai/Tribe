/**
 * Base58 (Bitcoin alphabet), which Solana uses for addresses and signatures.
 *
 * Twenty lines here rather than a dependency for one function.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map([...ALPHABET].map((ch, i) => [ch, i]));

/** Null on any character outside the alphabet. */
export function decodeBase58(text: string): Uint8Array | null {
  let value = 0n;
  for (const ch of text) {
    const digit = INDEX.get(ch);
    if (digit === undefined) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  // Each leading '1' is a leading zero byte.
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** A Solana public key: base58 that decodes to exactly 32 bytes. */
export function isSolanaAddress(text: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  return decodeBase58(text)?.length === 32;
}

/** A transaction signature: base58 that decodes to exactly 64 bytes. */
export function isSolanaSignature(text: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(text)) return false;
  return decodeBase58(text)?.length === 64;
}
