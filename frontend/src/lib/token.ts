/**
 * The published $MOON mint on Solana, and where to buy it.
 *
 * Set at build time with VITE_MOON_MINT. Blank until the token launches on
 * Solana, and every place that shows it - footer, docs, the buy button - says
 * "coming soon" instead of linking anywhere. Buy links are derived from the
 * mint rather than configured, so a link can never point at a different token
 * than the one the site publishes.
 */

/** Base58, 32-44 characters. Anything else is treated as unset. */
function solanaAddress(key: string): string | null {
  const raw = String(import.meta.env[key] ?? "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) ? raw : null;
}

export const MOON_MINT = solanaAddress("VITE_MOON_MINT");
/** Published on the docs Token page so players can check them; "coming soon" until set. */
export const DEV_WALLET = solanaAddress("VITE_MOON_DEV_WALLET");
export const STORE_WALLET = solanaAddress("VITE_MOON_STORE_WALLET");

export const DEXSCREENER_URL = MOON_MINT ? `https://dexscreener.com/solana/${MOON_MINT}` : null;
export const JUPITER_URL = MOON_MINT ? `https://jup.ag/swap/SOL-${MOON_MINT}` : null;

/**
 * Shown wherever the CA is displayed until the real mint is set.
 *
 * Deliberately not a valid Solana address - "O" is not in base58 - so a visitor
 * who copies it and pastes it into a wallet gets an error rather than sending
 * funds to an address nobody controls.
 */
export const PLACEHOLDER_CA = "MOON11111111111111111111111111111111111pump";

/** The address to display: the real mint once published, the placeholder until then. */
export const DISPLAY_CA = MOON_MINT ?? PLACEHOLDER_CA;
export const CA_IS_PLACEHOLDER = MOON_MINT === null;
