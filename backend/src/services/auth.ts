import { createPublicKey, randomBytes, verify } from "node:crypto";
import { decodeBase58, isSolanaAddress } from "./base58";
import { SOLANA_CLUSTER } from "./chain";

/**
 * Proving a Solana wallet belongs to whoever is using it.
 *
 * A wallet signs a one-time message for one of two purposes:
 *
 *  - "link": attach the wallet to the account that is already signed in, so
 *    nobody can link a wallet they do not control and borrow its $MOON.
 *  - "sign-in": prove ownership with no account in hand, to sign in to the
 *    account the wallet is linked to (or to create or claim one).
 *  - "recover": prove ownership of the wallet linked to an account, to set that
 *    account a new password.
 *
 * The purpose is in the message and the nonces are scoped separately, so a
 * signature made for one can never be replayed as the other.
 */

export type SignPurpose = "link" | "sign-in" | "recover";

type NonceRecord = { nonce: string; expires: number };
const nonces = new Map<string, NonceRecord>();
const TTL_MS = 5 * 60 * 1000;

/** Link nonces are scoped to the account; sign-in nonces have no account yet. */
function key(purpose: SignPurpose, address: string, playerId = "") {
  return `${purpose}|${playerId}|${address}`;
}

export function issueNonce(purpose: SignPurpose, address: string, playerId?: string) {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(key(purpose, address, playerId), { nonce, expires: Date.now() + TTL_MS });
  // Expired entries are cleared lazily here, so the map cannot grow without bound.
  if (nonces.size > 5000) {
    const now = Date.now();
    for (const [k, rec] of nonces) if (rec.expires < now) nonces.delete(k);
  }
  return nonce;
}

function consumeNonce(purpose: SignPurpose, address: string, nonce: string, playerId?: string) {
  const k = key(purpose, address, playerId);
  const rec = nonces.get(k);
  if (!rec || rec.nonce !== nonce || rec.expires < Date.now()) return false;
  nonces.delete(k);
  return true;
}

/**
 * What the wallet shows the player.
 *
 * `origin` must come from the request's own headers, never from the page: it is
 * what tells a player signing on a lookalike site that the site is not ours.
 */
export function buildSignMessage(opts: {
  purpose: SignPurpose;
  address: string;
  nonce: string;
  origin: string;
  username?: string;
}) {
  const host = safeHost(opts.origin);
  const lines =
    opts.purpose === "link"
      ? [`${host} wants you to link this wallet to your Moonville account.`, "", `Account: ${opts.username ?? ""}`]
      : opts.purpose === "recover"
        ? [`${host} wants you to recover your Moonville account and set a new password.`, ""]
        : [`${host} wants you to sign in to Moonville with your Solana wallet.`, ""];
  return [
    ...lines,
    `Wallet: ${opts.address}`,
    `Purpose: ${opts.purpose}`,
    `URI: ${opts.origin}`,
    `Cluster: ${SOLANA_CLUSTER}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

function safeHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/**
 * Checks a signed message: the right purpose, wallet, account and a live,
 * single-use nonce, then the ed25519 signature itself.
 *
 * `signature` is base64, as the wallet's signMessage bytes encode.
 */
export function verifySignedMessage(opts: {
  purpose: SignPurpose;
  address: string;
  message: string;
  signature: string;
  /** For "link": the account the message must name. */
  playerId?: string;
  username?: string;
}): boolean {
  if (!isSolanaAddress(opts.address)) return false;
  const field = (name: string) => opts.message.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1];
  if (field("Purpose") !== opts.purpose) return false;
  if (field("Wallet") !== opts.address) return false;
  if (opts.purpose === "link" && field("Account") !== opts.username) return false;
  const nonce = field("Nonce");
  if (!nonce || !/^[a-f0-9]+$/.test(nonce)) return false;
  if (!consumeNonce(opts.purpose, opts.address, nonce, opts.playerId)) return false;

  const publicKey = decodeBase58(opts.address);
  const signature = Buffer.from(opts.signature, "base64");
  if (!publicKey || publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const keyObject = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKey).toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(opts.message, "utf8"), keyObject, signature);
  } catch {
    return false;
  }
}
