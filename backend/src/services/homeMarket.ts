import { HOME_PRICE, MIN_ASKING_PRICE, type CityId } from "@tribe/shared";

/**
 * Homes are bought outright: one price, one payment, instant transfer.
 *
 * There is deliberately no auction here. Bidding needed escrow, and escrow needs
 * something to hold player funds during the auction - the one part of the
 * economy that could not be done with a plain allowance. Removing bidding
 * removes the custody problem with it.
 */

/** Price of a home the city still owns. */
export function cityHomePrice(city: CityId) {
  return HOME_PRICE[city] ?? HOME_PRICE.trenches;
}

/**
 * Sellers name any price they like - there is deliberately no ceiling. The only
 * limit is BUCKS_CAP, which is what a wallet can physically hold.
 */
export function clampAskingPrice(value: unknown) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_ASKING_PRICE) return null;
  return n;
}

/**
 * Re-exported so callers keep importing market rules from one place. A real
 * membership test: the server derives the same lot set the client builds, so a
 * junk id cannot name a home that does not exist.
 */
// Re-exported so callers keep importing market rules from one place.
export { isHomeId, MIN_ASKING_PRICE } from "@tribe/shared";
