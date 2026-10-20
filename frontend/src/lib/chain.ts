/**
 * Solana network parameters, mainnet-beta by default.
 *
 * Env-overridable so pointing the game at devnet is configuration rather than a
 * code change. Keep VITE_SOLANA_CLUSTER matching the backend's SOLANA_CLUSTER:
 * the wallet-link message states it.
 */

/*
 * Every setting is read by its literal name (import.meta.env.VITE_X), never as
 * import.meta.env[key]. Vite can only inline a variable it can see named; a
 * dynamic lookup makes it ship the whole env object instead - every VITE_ value
 * in the deploy, used or not - into the public bundle.
 */
function envStr(raw: string | undefined, fallback: string) {
  return raw && raw.trim() !== "" ? raw.trim() : fallback;
}

/** "mainnet-beta" or "devnet". */
export const SOLANA_CLUSTER = envStr(import.meta.env.VITE_SOLANA_CLUSTER, "mainnet-beta");

/**
 * Used to fetch a recent blockhash when building a payment. The public endpoint
 * rate-limits browsers hard; set a dedicated RPC for production.
 */
export const SOLANA_RPC = envStr(
  import.meta.env.VITE_SOLANA_RPC,
  SOLANA_CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com",
);

export const SOLANA_EXPLORER = envStr(import.meta.env.VITE_SOLANA_EXPLORER, "https://solscan.io");

export const CHAIN_NAME = SOLANA_CLUSTER === "devnet" ? "Solana Devnet" : "Solana";
