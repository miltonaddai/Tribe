import { envNumber } from "./liveEnv";

/**
 * Auction tuning. Re-read from .env on every call so the duration can be cut
 * down to a few seconds while testing without restarting the server.
 */
export function auctionSeconds() {
  return Math.max(5, envNumber("HOME_AUCTION_SECONDS", 24 * 60 * 60));
}

/** Floor for never-owned city homes only; owners name their own price. */
export function openingBid() {
  return Math.max(1, envNumber("HOME_OPENING_BID", 250));
}

/**
 * Floor on a home listing, in Moon. 1,000 Moon is $1 at a $1M cap, so this
 * is a $1 floor: high enough that a listing costs something to make, low enough
 * not to price anyone out of selling.
 */
export const MIN_ASKING_PRICE = 1_000;

/**
 * Sellers name any price they like — there is deliberately no ceiling. The
 * only limit is MOON_CAP, which is what a wallet can physically hold.
 */
export function clampAskingPrice(value: unknown) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_ASKING_PRICE) return null;
  return n;
}

/**
 * Bounds on a seller-chosen auction length. The floor is env-tunable so short
 * auctions can be exercised while testing without rebuilding.
 */
export function minAuctionSeconds() {
  return Math.max(1, envNumber("HOME_MIN_AUCTION_SECONDS", 60));
}

export const MAX_AUCTION_SECONDS = 30 * 24 * 60 * 60;

export function clampDuration(value: unknown) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < minAuctionSeconds() || n > MAX_AUCTION_SECONDS) return null;
  return n;
}

/**
 * How long a seller has to accept or reject the winning bid before it is
 * accepted for them. Without this the winner's escrow could be held forever.
 */
export function acceptWindowSeconds() {
  return Math.max(30, envNumber("HOME_ACCEPT_WINDOW_SECONDS", 24 * 60 * 60));
}

export function bidIncrement() {
  return Math.max(1, envNumber("HOME_BID_INCREMENT", 50));
}

/**
 * What the next bid has to be. Once bidding is live it steps up by the
 * increment; the first bid must meet the seller's asking price, falling back
 * to the configured floor only for homes the city still owns.
 */
export function nextBidFor(highBid: number, live: boolean, askingPrice = 0) {
  if (live) return highBid + bidIncrement();
  return askingPrice > 0 ? askingPrice : openingBid();
}

/**
 * Re-exported so callers keep importing auction rules from one place. This is
 * a real membership test now — the server derives the same lot set the client
 * builds, so a junk id can no longer open an auction row.
 */
export { isHomeId } from "@moonville/shared";
