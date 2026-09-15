import type { AccessoryId } from "./types";

export type ItemKind = "accessory" | "gun" | "pet" | "crate";

export type GunId = "pipe" | "pistol" | "rifle";
export type PetId = "mutt" | "cat";
export type CrateId = "mystery-crate";
export type ItemId = AccessoryId | GunId | PetId | CrateId;

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

export const GUNS: GunSpec[] = [
  { id: "pipe", label: "Lead Pipe", ranged: false, range: 2.8, damage: 26, cooldownMs: 520, aim: 0.12, spread: 0 },
  { id: "pistol", label: "Sidearm", ranged: true, range: 30, damage: 22, cooldownMs: 420, aim: 0, spread: 1.5 },
  { id: "rifle", label: "Street Rifle", ranged: true, range: 55, damage: 34, cooldownMs: 700, aim: 0, spread: 1.2 },
];

export function gunSpec(id: string | null | undefined): GunSpec | null {
  return GUNS.find((g) => g.id === id) ?? null;
}

/** Bare fists. */
export const UNARMED = { range: 2.8, damage: 18, cooldownMs: 520, aim: 0.12, spread: 0, ranged: false };

export const PETS: { id: PetId; label: string }[] = [
  { id: "mutt", label: "Block Mutt" },
  { id: "cat", label: "Alley Cat" },
];

export const CATALOG: CatalogItem[] = [
  { id: "glasses", kind: "accessory", name: "Glasses", blurb: "See the city. Look like you read.", price: 40, tier: 1, unique: true },
  { id: "backpack", kind: "accessory", name: "Backpack", blurb: "Room for a crate and a grudge.", price: 55, tier: 1, unique: true },
  { id: "earbuds", kind: "accessory", name: "Earbuds", blurb: "Ignore the plaza. On purpose.", price: 70, tier: 2, unique: true },
  { id: "visor", kind: "accessory", name: "Visor", blurb: "Night market energy. Zero UV.", price: 85, tier: 2, unique: true },
  { id: "watch", kind: "accessory", name: "Watch", blurb: "You have places to be. Maybe.", price: 110, tier: 3, unique: true },
  { id: "chain", kind: "accessory", name: "Gold Chain", blurb: "The smallest Valhalla flex that still counts.", price: 160, tier: 3, unique: true },
  { id: "pipe", kind: "gun", name: "Lead Pipe", blurb: "Not licensed. Very Trench.", price: 140, tier: 1, unique: true },
  { id: "pistol", kind: "gun", name: "Sidearm", blurb: "Holds in the right hand. Hits harder.", price: 280, tier: 1, unique: true },
  { id: "rifle", kind: "gun", name: "Street Rifle", blurb: "Long, loud, and a little extra.", price: 420, tier: 4, unique: true },
  { id: "mutt", kind: "pet", name: "Block Mutt", blurb: "Follows you. Judges nobody.", price: 180, tier: 1, unique: true },
  { id: "cat", kind: "pet", name: "Alley Cat", blurb: "Follows you when it feels like it.", price: 220, tier: 2, unique: true },
  { id: "mystery-crate", kind: "crate", name: "Mystery Crate", blurb: "The original trade bait. Stacks.", price: 75, tier: 1, unique: false },
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

export function storeStock(tier: number) {
  return CATALOG.filter((item) => item.tier <= tier);
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
  if (!hasItem(inv, "mystery-crate")) inv = addItem(inv, "mystery-crate");
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
