/**
 * The published $TRIBE contract.
 *
 * Written here rather than fetched, and used by both the footer and the docs
 * Token page so the two cannot disagree. The footer used to read it from the
 * server, which was the right instinct - the backend decides what the game
 * actually gates on - but it made a published fact depend on three things
 * being right at once: a build flag, a reachable API URL, and a backend
 * already restarted onto the new token. Any one of them wrong and the site
 * says "coming soon" about a token that is live and trading.
 *
 * An address people copy in order to spend money is the wrong place for that
 * many moving parts. It is public, it does not change, and if it ever does it
 * is a code change worth reviewing rather than a setting worth flipping.
 *
 * Verified on Robinhood Chain (4663) before publishing: Tribe / TRIBE, 18
 * decimals, 1,000,000,000 supply, and the checksum is correct as written.
 */
export const TRIBE_CONTRACT = "0xA68bd63519ed181ad169843bd63f04BB6Fd4aB5a";

/**
 * Where to go to buy or check on it.
 *
 * Built from the address above rather than written out, so a link can never
 * point at a different token than the one the site publishes, and pasted into
 * the source rather than read from env for the same reason the address is:
 * these are links people follow in order to spend money, and a missing deploy
 * setting should not be able to quietly remove them.
 */
export const DEXSCREENER_URL = `https://dexscreener.com/robinhood/${TRIBE_CONTRACT}`;
export const PONS_URL = `https://www.ponsfamily.com/launchpad/${TRIBE_CONTRACT}`;
