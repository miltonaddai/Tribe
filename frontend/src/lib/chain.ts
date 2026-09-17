/**
 * Robinhood Chain network parameters.
 *
 * Mainnet by default. Every value is env-overridable so pointing the game at a
 * different network is configuration rather than a code change - these used to
 * be hardcoded in five places, which is how a build ends up half on one network
 * and half on another.
 */

function envStr(key: string, fallback: string) {
  const raw = import.meta.env[key] as string | undefined;
  return raw && raw.trim() !== "" ? raw.trim() : fallback;
}

function envInt(key: string, fallback: number) {
  const n = Number(import.meta.env[key]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Robinhood Chain mainnet. Testnet is 46630. */
export const CHAIN_ID = envInt("VITE_CHAIN_ID", 4663);

/**
 * Derived, never configured separately. Holding the decimal and the hex as two
 * independent values invites them to disagree, and a wallet asked to switch to
 * the wrong chain id simply fails with nothing useful to say.
 */
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

export const CHAIN_NAME = envStr("VITE_CHAIN_NAME", "Robinhood Chain");
export const CHAIN_RPC = envStr("VITE_CHAIN_RPC", "https://rpc.mainnet.chain.robinhood.com");
export const CHAIN_EXPLORER = envStr("VITE_CHAIN_EXPLORER", "https://robinhoodchain.blockscout.com");
