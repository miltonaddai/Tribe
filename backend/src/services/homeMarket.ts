import { HOME_PRICE, type CityId } from "@tribe/shared";

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
  return HOME_PRICE[city] ?? HOME_PRICE.trench;
}

/**
 * Floor on an owner's resale listing, in Tribute. 1,000 Tribute is $1 at a $1M
 * cap, so this is a $1 floor: high enough that a listing means something, low
 * enough not to price anyone out of selling.
 */
export const MIN_ASKING_PRICE = 1_000;

/**
 * Sellers name any price they like - there is deliberately no ceiling. The only
 * limit is TRIBUTE_CAP, which is what a wallet can physically hold.
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
export { isHomeId } from "@tribe/shared";
