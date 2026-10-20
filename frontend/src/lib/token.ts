/**
 * The published $MOON mint on Solana, and where to buy it.
 *
 * On mainnet this is the official $MOON address; VITE_MOON_MINT overrides it,
 * so another token can stand in on devnet. With no mint, every place that shows
 * it - footer, docs, the buy button - says "coming soon" instead of linking
 * anywhere. Buy links are derived from the mint rather than configured, so a
 * link can never point at a different token than the one the site publishes.
 */

import { SOLANA_CLUSTER } from "./chain";

/*
 * Every setting is read by its literal name (import.meta.env.VITE_X), never as
 * import.meta.env[key]. Vite can only inline a variable it can see named; a
 * dynamic lookup makes it ship the whole env object instead - every VITE_ value
 * in the deploy, used or not - into the public bundle.
 */
/** Base58, 32-44 characters. Anything else is treated as unset. */
function solanaAddress(value: string | undefined): string | null {
  const raw = String(value ?? "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) ? raw : null;
}

/** The official $MOON mint on Solana mainnet. Keep in step with the backend's services/token.ts. */
export const OFFICIAL_MOON_MINT = "i6Z98UoNrVmqNSdKDhPdZaMmNZVcr8dAgaRrAMgpump";

export const MOON_MINT =
  solanaAddress(import.meta.env.VITE_MOON_MINT) ?? (SOLANA_CLUSTER === "mainnet-beta" ? OFFICIAL_MOON_MINT : null);
/** Published on the docs Token page so players can check it; "coming soon" until set. */
export const DEV_WALLET = solanaAddress(import.meta.env.VITE_MOON_DEV_WALLET);

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
