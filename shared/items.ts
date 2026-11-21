import type { AccessoryId, OutfitId } from "./types";

export type ItemKind = "accessory" | "gun" | "pet" | "outfit";

export type GunId = "pipe" | "pistol" | "rifle";
export type PetId = "mutt" | "cat";
export type ItemId = AccessoryId | GunId | PetId | OutfitId;

export type InventoryStack = {
  id: ItemId;
  qty: number;
};

export type CatalogItem = {
  id: ItemId;
  kind: ItemKind;
  name: string;
  blurb: string;
  price: number;
  tier: 1 | 2 | 3 | 4;
  unique: boolean;
  /**
   * Absent means on sale. `false` retires an item from the store without
   * removing it from the game.
   *
   * The distinction matters: item ids are validated against this catalog, so
   * deleting a row would make every copy already in a player's inventory an
   * unknown id, and `parseInventory` would quietly drop it. People who paid for
   * the thing would simply lose it. Retiring instead keeps it valid, equippable
   * and tradeable for whoever owns one, and merely stops new sales.
   */
  listed?: boolean;
};

/**
 * Weapon handling. Shared because the server re-checks range, damage and rate
 * of fire rather than trusting whatever the client reports hitting.
 */
export type GunSpec = {
  id: GunId;
  label: string;
  /** Melee weapons swing; ranged ones fire down a narrow cone. */
  ranged: boolean;
  range: number;
  damage: number;
  cooldownMs: number;
  /** Melee only: minimum forward alignment for the swing arc. */
  aim: number;
  /**
   * Ranged only: how far off the aim line a body can be and still be hit, in
   * world units. A fixed width is far more predictable than an angle, which
   * gets punishingly narrow up close and absurdly wide at distance.
   */
  spread: number;
};

/**
 * Ranges are bounded by interest management, not by taste: the server only
 * replicates another player once they are within AOI_IN (70 units), so a weapon
 * that outranged that would be aiming at people the client has never been told
 * about. The rifle sits below it with margin; nothing should be raised past ~65
 * without raising AOI_IN to match.
 */
export const GUNS: GunSpec[] = [
  { id: "pipe", label: "Lead Pipe", ranged: false, range: 2.8, damage: 26, cooldownMs: 520, aim: 0.12, spread: 0 },
  { id: "pistol", label: "Sidearm", ranged: true, range: 45, damage: 22, cooldownMs: 420, aim: 0, spread: 1.5 },
  { id: "rifle", label: "Street Rifle", ranged: true, range: 65, damage: 34, cooldownMs: 700, aim: 0, spread: 1.2 },
];

/**
 * Weapons with a quick-arm slot, in slot order.
 *
 * Retired weapons are left out. The Lead Pipe is still a real weapon - anyone
 * who bought one before it was withdrawn keeps it, and it still swings - but it
 * is no longer sold, so handing it the first slot would give almost every
 * player a number key that does nothing. Owners can still equip it from the
 * inventory.
 *
 * Derived rather than listed so the slots cannot drift from the catalogue.
 */
export function armSlots(): GunSpec[] {
  return GUNS.filter((g) => catalogItem(g.id)?.listed !== false);
}

export function gunSpec(id: string | null | undefined): GunSpec | null {
  return GUNS.find((g) => g.id === id) ?? null;
}

/** Bare fists. */
export const UNARMED = { range: 2.8, damage: 18, cooldownMs: 520, aim: 0.12, spread: 0, ranged: false };

export const PETS: { id: PetId; label: string }[] = [
  { id: "mutt", label: "Block Mutt" },
  { id: "cat", label: "Alley Cat" },
];

/**
 * Prices are in Bucks, the in-game currency.
 * Pitched so the whole catalog costs about the price of one Trenches home:
 * cosmetics and gear are impulse buys, property is the goal.
 */
export const CATALOG: CatalogItem[] = [
  { id: "glasses", kind: "accessory", name: "Glasses", blurb: "See the city. Look like you read.", price: 500, tier: 1, unique: true },
  { id: "backpack", kind: "accessory", name: "Backpack", blurb: "Room for everything and a grudge.", price: 750, tier: 1, unique: true },
  { id: "earbuds", kind: "accessory", name: "Earbuds", blurb: "Ignore the plaza. On purpose.", price: 1000, tier: 2, unique: true },
  { id: "visor", kind: "accessory", name: "Visor", blurb: "Night market energy. Zero UV.", price: 1500, tier: 2, unique: true },
  { id: "watch", kind: "accessory", name: "Watch", blurb: "You have places to be. Maybe.", price: 2000, tier: 3, unique: true },
  { id: "chain", kind: "accessory", name: "Gold Chain", blurb: "The smallest Uptown flex that still counts.", price: 3000, tier: 3, unique: true },
  // Retired from the store. Still valid for anyone who already bought one.
  { id: "pipe", kind: "gun", name: "Lead Pipe", blurb: "Not licensed. Very Trenches.", price: 1500, tier: 1, unique: true, listed: false },
  { id: "pistol", kind: "gun", name: "Sidearm", blurb: "Holds in the right hand. Hits harder.", price: 3000, tier: 1, unique: true },
  { id: "rifle", kind: "gun", name: "Street Rifle", blurb: "Long, loud, and a little extra.", price: 5000, tier: 4, unique: true },
  { id: "mutt", kind: "pet", name: "Block Mutt", blurb: "Follows you. Judges nobody.", price: 2500, tier: 1, unique: true },
  { id: "cat", kind: "pet", name: "Alley Cat", blurb: "Follows you when it feels like it.", price: 3000, tier: 2, unique: true },

  // Outfits sold at the fashion house. Only the paid ones are catalog items:
  // Every one is tier 1, because clothes are priced rather than gated - a
  // Trenches player who saves up can wear Uptown Gold. See isTierGated().
  // the free outfits need no ownership record, because everybody has them.
  // Kept here rather than in a parallel shop so buying one goes through the
  // same on-chain payment, the same uniqueness check and the same inventory
  // that every other purchase already uses.
  { id: "puffer", kind: "outfit", name: "Puffer Jacket", blurb: "Bulk, in a good way.", price: 1500, tier: 1, unique: true },
  { id: "suit", kind: "outfit", name: "Suit & Tie", blurb: "For when the deal is large.", price: 2000, tier: 1, unique: true },
  { id: "trench-coat", kind: "outfit", name: "Trench Coat", blurb: "Built for the Trenches, worn everywhere.", price: 2500, tier: 1, unique: true },
  { id: "neon", kind: "outfit", name: "Neon Runner", blurb: "Visible from the next block.", price: 3000, tier: 1, unique: true },
  { id: "gold", kind: "outfit", name: "Uptown Gold", blurb: "Subtlety is not the point.", price: 5000, tier: 1, unique: true },
];

const CATALOG_MAP = new Map(CATALOG.map((item) => [item.id, item]));
const ITEM_IDS = new Set<string>(CATALOG.map((item) => item.id));

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG_MAP.get(id as ItemId);
}

export function itemName(id: string) {
  return catalogItem(id)?.name ?? id;
}

export function isItemId(id: string): id is ItemId {
  return ITEM_IDS.has(id);
}

export function isGunId(id: string): id is GunId {
  return GUNS.some((g) => g.id === id);
}

export function isPetId(id: string): id is PetId {
  return PETS.some((p) => p.id === id);
}

/**
 * What the general store will sell you. Retired items never appear, and neither
 * do outfits: those are sold at the fashion house, where there is a mirror and
 * somewhere to put them on.
 */
export function storeStock(tier: number) {
  return CATALOG.filter(
    (item) => item.listed !== false && item.kind !== "outfit" && item.tier <= tier,
  );
}

/**
 * What the fashion house sells. No tier argument: clothes are not gated by
 * district, only by price, so every visitor sees the same rail.
 */
export function outfitStock() {
  return CATALOG.filter((item) => item.kind === "outfit" && item.listed !== false);
}

/**
 * Whether access tier restricts buying this at all.
 *
 * Only outfits are exempt. Guns, pets and accessories still belong to the
 * district that sells them; clothes are self-expression, and locking those
 * behind holdings makes the poorest players the most identifiable.
 */
export function isTierGated(item: CatalogItem): boolean {
  return item.kind !== "outfit";
}

/** Whether the store may still sell this. Re-checked server-side on purchase. */
export function isForSale(id: string): boolean {
  return catalogItem(id)?.listed !== false;
}

export function parseInventory(raw: unknown): InventoryStack[] {
  const list = Array.isArray(raw) ? raw : [];
  const stacks = new Map<ItemId, number>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const id = String((entry as InventoryStack).id ?? "");
    const qty = Math.max(0, Math.floor(Number((entry as InventoryStack).qty) || 0));
    if (!isItemId(id) || qty <= 0) continue;
    stacks.set(id, (stacks.get(id) ?? 0) + qty);
  }
  return [...stacks.entries()].map(([id, qty]) => ({ id, qty }));
}

export function stackCount(inv: InventoryStack[], id: ItemId) {
  return inv.find((s) => s.id === id)?.qty ?? 0;
}

export function hasItem(inv: InventoryStack[], id: ItemId) {
  return stackCount(inv, id) > 0;
}

export function addItem(inv: InventoryStack[], id: ItemId, qty = 1): InventoryStack[] {
  const next = inv.map((s) => ({ ...s }));
  const found = next.find((s) => s.id === id);
  if (found) found.qty += qty;
  else next.push({ id, qty });
  return next;
}

export function takeItem(inv: InventoryStack[], id: ItemId, qty = 1): InventoryStack[] | null {
  const have = stackCount(inv, id);
  if (have < qty) return null;
  return inv
    .map((s) => (s.id === id ? { ...s, qty: s.qty - qty } : s))
    .filter((s) => s.qty > 0);
}

export function seedInventory(accessories: AccessoryId[], existing?: unknown): InventoryStack[] {
  let inv = parseInventory(existing);
  for (const id of accessories) {
    if (!hasItem(inv, id)) inv = addItem(inv, id);
  }
  return inv;
}

export function encodeInventory(inv: InventoryStack[]) {
  return JSON.stringify(inv);
}

export function decodeInventory(raw: string | undefined | null): InventoryStack[] {
  if (!raw) return [];
  try {
    return parseInventory(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * What an outfit costs, and therefore whether it needs buying at all.
 *
 * Derived from the catalog rather than listed separately: an outfit with a
 * catalog entry is sold, and one without is free to everyone. Keeping it a
 * derivation means the two can never disagree about which is which.
 */
export function outfitPrice(id: string): number {
  const item = catalogItem(id);
  return item?.kind === "outfit" ? item.price : 0;
}

/** Free outfits need no ownership record; paid ones must be in the inventory. */
export function ownsOutfit(inventory: InventoryStack[], id: string): boolean {
  if (outfitPrice(id) === 0) return true;
  return hasItem(inventory, id as ItemId);
}
