/**
 * Robinhood Chain network parameters, mainnet by default.
 *
 * Kept in one place and env-overridable: the chain id here is also what the
 * sign-in message states, so a value that drifts from the frontend's is a
 * signature the wallet will produce against the wrong network.
 */

function envStr(key: string, fallback: string) {
  const raw = process.env[key];
  return raw && raw.trim() !== "" ? raw.trim() : fallback;
}

function envInt(key: string, fallback: number) {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Robinhood Chain mainnet. Testnet is 46630. */
export const CHAIN_ID = envInt("CHAIN_ID", 4663);
export const CHAIN_NAME = envStr("CHAIN_NAME", "Robinhood Chain");
export const CHAIN_RPC = envStr(
  "CHAIN_RPC",
  process.env.ROBINHOOD_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com",
);
export const CHAIN_EXPLORER = envStr("CHAIN_EXPLORER", "https://robinhoodchain.blockscout.com");
