/**
 * Solana network parameters, mainnet-beta by default.
 *
 * Env-overridable so pointing the game at devnet is configuration rather than a
 * code change. Keep VITE_SOLANA_CLUSTER matching the backend's SOLANA_CLUSTER:
 * the wallet-link message states it.
 */

function envStr(key: string, fallback: string) {
  const raw = import.meta.env[key] as string | undefined;
  return raw && raw.trim() !== "" ? raw.trim() : fallback;
}

/** "mainnet-beta" or "devnet". */
export const SOLANA_CLUSTER = envStr("VITE_SOLANA_CLUSTER", "mainnet-beta");

/**
 * Used to fetch a recent blockhash when building a payment. The public endpoint
 * rate-limits browsers hard; set a dedicated RPC for production.
 */
export const SOLANA_RPC = envStr(
  "VITE_SOLANA_RPC",
  SOLANA_CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com",
);

export const SOLANA_EXPLORER = envStr("VITE_SOLANA_EXPLORER", "https://solscan.io");

export const CHAIN_NAME = SOLANA_CLUSTER === "devnet" ? "Solana Devnet" : "Solana";
