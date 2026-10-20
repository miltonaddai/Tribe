/**
 * Solana network parameters, mainnet-beta by default.
 *
 * Kept in one place and env-overridable, so pointing the game at devnet is
 * configuration rather than a code change. The cluster name is also stated in
 * the message a wallet signs to link itself, so it must match the frontend's
 * VITE_SOLANA_CLUSTER.
 */

function envStr(key: string, fallback: string) {
  const raw = process.env[key];
  return raw && raw.trim() !== "" ? raw.trim() : fallback;
}

/** "mainnet-beta" or "devnet". */
export const SOLANA_CLUSTER = envStr("SOLANA_CLUSTER", "mainnet-beta");

/**
 * The public endpoint is heavily rate limited. Fine for local work; set a
 * dedicated RPC (Helius, Alchemy, QuickNode, ...) anywhere real players are.
 */
export const SOLANA_RPC = envStr(
  "SOLANA_RPC",
  SOLANA_CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com",
);

export const SOLANA_EXPLORER = envStr("SOLANA_EXPLORER", "https://solscan.io");

/**
 * A single JSON-RPC call. Plain fetch rather than @solana/web3.js: the server
 * only reads - balances, a mint's decimals, a confirmed transaction - and each
 * of those is one documented method.
 */
export async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC ${method} failed: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`Solana RPC ${method} failed: ${body.error.message ?? "unknown error"}`);
  return body.result as T;
}
