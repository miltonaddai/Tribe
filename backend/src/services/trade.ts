/**
 * Two-sided trading.
 *
 * What came before was a gift with extra steps: one player named an item, the
 * other said yes, and the item moved. Nothing came back, and nothing could.
 *
 * A trade is a session between two players, each staking items from their own
 * inventory. Either side may change their stake at any time, and doing so
 * clears *both* locks - which is the whole defence against the oldest trick in
 * trading, where one party waits for the other to commit and then quietly swaps
 * their own offer for something worthless. You can only ever be holding a lock
 * on the offer you actually looked at.
 *
 * When both sides are locked the trade settles in one step. Settlement is kept
 * pure and total here: it either produces both new inventories or it produces a
 * reason and changes nothing, so there is no path where items leave one player
 * without arriving at the other.
 *
 * Currency is deliberately not tradeable: trades swap items only. Bucks
 * move through purchases and sales, which the server prices itself.
 */

import {
  addItem,
  decodeInventory,
  isItemId,
  stackCount,
  takeItem,
  type InventoryStack,
  type ItemId,
} from "@tribe/shared";

/** Per side, so a full stake still fits the trade panel without scrolling. */
export const TRADE_MAX_ITEMS = 8;

/** How far apart two traders may drift before the session closes. */
export const TRADE_RANGE = 16;

/** A session with nobody touching it is abandoned, not live. */
export const TRADE_IDLE_MS = 3 * 60 * 1000;

export type TradeSide = {
  sessionId: string;
  /** Staked items, one entry per unit, so two of a thing is two entries. */
  items: ItemId[];
  locked: boolean;
};

export type TradeSession = {
  id: string;
  a: TradeSide;
  b: TradeSide;
  touchedAt: number;
};

export function otherSide(session: TradeSession, sessionId: string): TradeSide | null {
  if (session.a.sessionId === sessionId) return session.b;
  if (session.b.sessionId === sessionId) return session.a;
  return null;
}

export function ownSide(session: TradeSession, sessionId: string): TradeSide | null {
  if (session.a.sessionId === sessionId) return session.a;
  if (session.b.sessionId === sessionId) return session.b;
  return null;
}

/**
 * Cleans a proposed stake against what the player actually holds.
 *
 * Counts rather than checks membership: offering the same item three times when
 * you own one of it has to collapse to one, or settlement would be asked to
 * take three and fail after the UI had already shown the offer as valid.
 */
export function sanitizeStake(raw: unknown, inventoryRaw: string): ItemId[] {
  if (!Array.isArray(raw)) return [];
  const inventory = decodeInventory(inventoryRaw);
  const staked = new Map<ItemId, number>();
  const out: ItemId[] = [];
  for (const entry of raw) {
    if (out.length >= TRADE_MAX_ITEMS) break;
    const id = String(entry ?? "");
    if (!isItemId(id)) continue;
    const already = staked.get(id) ?? 0;
    if (already >= stackCount(inventory, id)) continue;
    staked.set(id, already + 1);
    out.push(id);
  }
  return out;
}

export type Settlement =
  | { ok: true; aInventory: InventoryStack[]; bInventory: InventoryStack[] }
  | { ok: false; reason: string };

/**
 * Both new inventories, or a reason and no change at all.
 *
 * Every take happens against a working copy before anything is credited, so a
 * player who has spent or dropped a staked item since locking fails the whole
 * trade rather than half of it.
 */
export function settleTrade(
  aInventoryRaw: string,
  aItems: ItemId[],
  bInventoryRaw: string,
  bItems: ItemId[],
): Settlement {
  if (aItems.length === 0 && bItems.length === 0) {
    return { ok: false, reason: "Neither side offered anything." };
  }

  let aInventory = decodeInventory(aInventoryRaw);
  let bInventory = decodeInventory(bInventoryRaw);

  for (const id of aItems) {
    const next = takeItem(aInventory, id);
    if (!next) return { ok: false, reason: "They no longer have everything they offered." };
    aInventory = next;
  }
  for (const id of bItems) {
    const next = takeItem(bInventory, id);
    if (!next) return { ok: false, reason: "They no longer have everything they offered." };
    bInventory = next;
  }

  for (const id of bItems) aInventory = addItem(aInventory, id);
  for (const id of aItems) bInventory = addItem(bInventory, id);

  return { ok: true, aInventory, bInventory };
}
