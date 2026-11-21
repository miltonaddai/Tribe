import {
  DEFAULT_CHAIN,
  isGunId,
  isPetId,
  parseAccessories,
  parseHexColor,
  parseShoe,
  seedInventory,
  type InventoryStack,
  type CharacterRecord,
  type CityId,
  type GameSettings,
  type WalletChainId,
} from "@block/shared";
import { getDb } from "./localDb";
import { STARTING_BUCKS } from "./liveEnv";
import { nameKey } from "@block/shared";

type WalletRow = {
  address: string;
  chain: WalletChainId;
  /** Internal currency id for the stored balance (displayed as Block Bucks). */
  symbol: "BUCKS";
  last_balance: number;
  last_city: CityId;
};

/**
 * Player ids (`acct:<uuid>`) and Solana addresses are both case-sensitive, so
 * nothing is folded. Kept as a seam: every lookup already goes through it.
 */
function normalizeAddress(address: string, _chain: WalletChainId) {
  return address;
}

function logError(action: string, error: { message: string } | null) {
  if (error) console.warn(`[db] ${action} failed: ${error.message}`);
}

export async function upsertWallet(row: WalletRow) {
  const db = getDb();
  const address = normalizeAddress(row.address, row.chain);
  const { data, error } = await db
    .from("wallets")
    .upsert(
      {
        address,
        chain: row.chain,
        symbol: row.symbol,
        last_balance: row.last_balance,
        last_city: row.last_city,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "address,chain" },
    )
    .select("id")
    .single();
  logError("upsert wallet", error);
  return data?.id as string | undefined;
}

/**
 * Is this name free for this wallet to take?
 *
 * Checked against the normalized key, and scoped so a player keeps their own
 * name when they edit anything else about their character.
 */
export async function nameAvailable(displayName: string, address: string, chain: WalletChainId) {
  const db = getDb();
  const { data, error } = await db
    .from("characters")
    .select("wallet_address")
    .eq("display_name_key", nameKey(displayName))
    .maybeSingle();
  if (error) {
    logError("check name", error);
    // Fail closed: better to ask someone to try again than to hand out a
    // duplicate name, which the index would reject on write anyway.
    return false;
  }
  if (!data) return true;
  return normalizeAddress(data.wallet_address, chain) === normalizeAddress(address, chain);
}

export async function upsertCharacter(record: CharacterRecord, chain: WalletChainId) {
  const db = getDb();
  const address = normalizeAddress(record.wallet, chain);
  const { data: wallet } = await db
    .from("wallets")
    .select("id")
    .eq("address", address)
    .eq("chain", chain)
    .maybeSingle();
  let walletId = wallet?.id as string | undefined;
  if (!walletId) {
    const { data: created, error: walletError } = await db
      .from("wallets")
      .insert({
        address,
        chain,
        symbol: "BUCKS",
        last_city: record.homeCity,
      })
      .select("id")
      .single();
    logError("insert wallet for character", walletError);
    walletId = created?.id;
  }
  const { data: existing } = await db
    .from("characters")
    .select("id, created_at, bucks")
    .eq("wallet_address", address)
    .eq("chain", chain)
    .maybeSingle();
  const id = existing?.id ?? record.id;
  const { error } = await db.from("characters").upsert(
    {
      id,
      wallet_id: walletId ?? null,
      wallet_address: address,
      chain,
      display_name: record.displayName.slice(0, 16),
      // The unique index lives on this, not on display_name: it folds case
      // and lookalikes so "milt0n" cannot sit beside "milton".
      display_name_key: nameKey(record.displayName.slice(0, 16)),
      body_type: record.bodyType,
      skin_tone: record.skinTone,
      outfit: record.outfit,
      pants_color: record.pantsColor,
      shoe: record.shoe,
      shoe_color: record.shoeColor,
      headwear: record.headwear,
      accessories: record.accessories,
      home_city: record.homeCity,
      access_tier: record.accessTier,
      brokemeter: record.brokemeter,
      // The balance is the server's, never the client's: an existing character
      // keeps what it has, and a new one gets the sandbox starting grant.
      bucks: existing ? Number(existing.bucks ?? 0) : STARTING_BUCKS,
      inventory: record.inventory ?? [],
      equipped_gun: record.equippedGun ?? null,
      equipped_pet: record.equippedPet ?? null,
      created_at: existing?.created_at ?? record.createdAt,
    },
    { onConflict: "wallet_address,chain" },
  );
  logError("upsert character", error);
  return { persisted: !error, id };
}

export async function fetchCharacter(address: string, chain: WalletChainId): Promise<CharacterRecord | null> {
  const db = getDb();
  const { data, error } = await db
    .from("characters")
    .select("*")
    .eq("wallet_address", normalizeAddress(address, chain))
    .eq("chain", chain)
    .maybeSingle();
  logError("fetch character", error);
  if (!data) return null;
  return {
    id: data.id,
    wallet: data.wallet_address,
    displayName: data.display_name,
    bodyType: data.body_type,
    skinTone: data.skin_tone,
    outfit: data.outfit,
    pantsColor: parseHexColor(data.pants_color, "#3A3A3A"),
    shoe: parseShoe(data.shoe),
    shoeColor: parseHexColor(data.shoe_color, "#111111"),
    headwear: data.headwear,
    accessories: parseAccessories(data.accessories),
    homeCity: data.home_city,
    accessTier: data.access_tier,
    brokemeter: Number.isFinite(Number(data.brokemeter)) ? Number(data.brokemeter) : 100,
    bucks: Number(data.bucks ?? 0),
    inventory: seedInventory(parseAccessories(data.accessories), data.inventory),
    equippedGun: isGunId(String(data.equipped_gun ?? "")) ? data.equipped_gun : null,
    equippedPet: isPetId(String(data.equipped_pet ?? "")) ? data.equipped_pet : null,
    createdAt: data.created_at,
  };
}

export async function upsertSettings(address: string, chain: WalletChainId, settings: GameSettings) {
  const db = getDb();
  const { error } = await db.from("player_settings").upsert(
    {
      wallet_address: normalizeAddress(address, chain),
      chain,
      settings,
    },
    { onConflict: "wallet_address,chain" },
  );
  logError("upsert settings", error);
}

export type HomeAuctionRow = {
  homeId: string;
  city: CityId;
  ownerWallet: string;
  ownerChain: WalletChainId | null;
  ownerName: string;
  name: string;
  forSale: boolean;
  lastPrice: number;
  askingPrice: number;
  durationSeconds: number;
  locked: boolean;
  awaitingSeller: boolean;
  decideBy: number;
  lotGx: number | null;
  lotGz: number | null;
  highBid: number;
  highBidderWallet: string;
  highBidderChain: WalletChainId | null;
  highBidderName: string;
  endsAt: number;
};

function toAuctionRow(data: Record<string, unknown>): HomeAuctionRow {
  const ends = data.ends_at ? Date.parse(String(data.ends_at)) : 0;
  return {
    homeId: String(data.home_id),
    city: (data.city ?? "trenches") as CityId,
    ownerWallet: String(data.owner_wallet ?? ""),
    ownerChain: (data.owner_chain ?? null) as WalletChainId | null,
    ownerName: String(data.owner_name ?? ""),
    name: String(data.name ?? ""),
    forSale: Boolean(data.for_sale ?? false),
    lastPrice: Number(data.last_price ?? 0),
    askingPrice: Number(data.asking_price ?? 0),
    durationSeconds: Number(data.duration_seconds ?? 0),
    locked: data.locked == null ? true : Boolean(data.locked),
    awaitingSeller: Boolean(data.awaiting_seller ?? false),
    decideBy: data.decide_by ? Date.parse(String(data.decide_by)) || 0 : 0,
    lotGx: data.lot_gx == null ? null : Number(data.lot_gx),
    lotGz: data.lot_gz == null ? null : Number(data.lot_gz),
    highBid: Number(data.high_bid ?? 0),
    highBidderWallet: String(data.high_bidder_wallet ?? ""),
    highBidderChain: (data.high_bidder_chain ?? null) as WalletChainId | null,
    highBidderName: String(data.high_bidder_name ?? ""),
    endsAt: Number.isFinite(ends) ? ends : 0,
  };
}

/** Every home that has ever been bid on. Small table; loaded once per room. */
export async function loadHomeAuctions(): Promise<HomeAuctionRow[]> {
  const db = getDb();
  const { data, error } = await db.from("home_auctions").select("*");
  logError("load home auctions", error);
  return (data ?? []).map(toAuctionRow);
}

export async function saveHomeAuction(row: HomeAuctionRow) {
  const db = getDb();
  const { error } = await db.from("home_auctions").upsert(
    {
      home_id: row.homeId,
      city: row.city,
      owner_wallet: row.ownerWallet || null,
      owner_chain: row.ownerWallet ? row.ownerChain : null,
      owner_name: row.ownerName || null,
      name: row.name || "",
      for_sale: row.forSale,
      last_price: row.lastPrice,
      asking_price: row.askingPrice,
      duration_seconds: row.durationSeconds,
      locked: row.locked,
      awaiting_seller: row.awaitingSeller,
      decide_by: row.decideBy ? new Date(row.decideBy).toISOString() : null,
      lot_gx: row.lotGx,
      lot_gz: row.lotGz,
      sold_at: row.ownerWallet ? new Date().toISOString() : null,
      high_bid: row.highBid,
      high_bidder_wallet: row.highBidderWallet || null,
      high_bidder_chain: row.highBidderWallet ? row.highBidderChain : null,
      high_bidder_name: row.highBidderName || null,
      ends_at: row.endsAt ? new Date(row.endsAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "home_id" },
  );
  logError("save home auction", error);
}

export async function fetchBucks(address: string, chain: WalletChainId): Promise<number | null> {
  const db = getDb();
  const { data, error } = await db
    .from("characters")
    .select("bucks")
    .eq("wallet_address", normalizeAddress(address, chain))
    .eq("chain", chain)
    .maybeSingle();
  logError("fetch bucks", error);
  if (!data) return null;
  const bucks = Number(data.bucks);
  return Number.isFinite(bucks) ? bucks : null;
}

/**
 * Block Bucks movements that the server owns (auction escrow and payouts) are
 * written straight to the character row so they outlive the session.
 */
export async function writeBucks(address: string, chain: WalletChainId, bucks: number) {
  const db = getDb();
  const { error } = await db
    .from("characters")
    .update({ bucks: Math.max(0, Math.round(bucks)), updated_at: new Date().toISOString() })
    .eq("wallet_address", normalizeAddress(address, chain))
    .eq("chain", chain);
  logError("write bucks", error);
}

export type PlayerVehicleRow = {
  id: string;
  ownerWallet: string;
  ownerChain: WalletChainId;
  city: CityId;
  kind: string;
  color: string;
  x: number;
  z: number;
  rotY: number;
  locked: boolean;
  forSale: boolean;
  askingPrice: number;
};

export async function loadPlayerVehicles(): Promise<PlayerVehicleRow[]> {
  const db = getDb();
  const { data, error } = await db.from("player_vehicles").select("*");
  logError("load player vehicles", error);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    ownerWallet: String(row.owner_wallet ?? ""),
    ownerChain: (row.owner_chain ?? DEFAULT_CHAIN) as WalletChainId,
    city: (row.city ?? "trenches") as CityId,
    kind: String(row.kind ?? "sedan"),
    color: String(row.color ?? "#FFFFFF"),
    x: Number(row.x ?? 0),
    z: Number(row.z ?? 0),
    rotY: Number(row.rot_y ?? 0),
    locked: row.locked == null ? true : Boolean(row.locked),
    forSale: Boolean(row.for_sale),
    askingPrice: Number(row.asking_price ?? 0),
  }));
}

export async function savePlayerVehicle(row: PlayerVehicleRow) {
  const db = getDb();
  if (!row.ownerWallet) return;
  const { error } = await db.from("player_vehicles").upsert(
    {
      id: row.id,
      owner_wallet: row.ownerWallet,
      owner_chain: row.ownerChain,
      city: row.city,
      kind: row.kind,
      color: row.color,
      x: row.x,
      z: row.z,
      rot_y: row.rotY,
      locked: row.locked,
      for_sale: row.forSale,
      asking_price: Math.max(0, Math.round(row.askingPrice)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  logError("save player vehicle", error);
}

export type LastSpot = { city: CityId; x: number; z: number };

/**
 * Where this wallet was last standing.
 *
 * Null when it has never been saved, which is what gives a new player the
 * district spawn rather than dropping them at the world origin.
 */
export async function fetchLastSpot(address: string, chain: WalletChainId): Promise<LastSpot | null> {
  const db = getDb();
  const { data, error } = await db
    .from("wallets")
    .select("last_city,last_x,last_z")
    .eq("address", normalizeAddress(address, chain))
    .eq("chain", chain)
    .maybeSingle();
  logError("fetch last spot", error);
  if (!data || data.last_x == null || data.last_z == null) return null;
  const x = Number(data.last_x);
  const z = Number(data.last_z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { city: (data.last_city ?? "trenches") as CityId, x, z };
}

/** True when the spot actually reached the database, so an explicit save can say so. */
export async function saveLastSpot(
  address: string,
  chain: WalletChainId,
  spot: LastSpot,
): Promise<boolean> {
  const db = getDb();
  if (!address) return false;
  // Upsert, not update. The wallet row may not exist yet for a player who has
  // never saved a position, and an update would have nothing to match.
  const { error } = await db.from("wallets").upsert(
    {
      address: normalizeAddress(address, chain),
      chain,
      symbol: "BUCKS",
      last_city: spot.city,
      last_x: Math.round(spot.x * 100) / 100,
      last_z: Math.round(spot.z * 100) / 100,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "address,chain" },
  );
  logError("save last spot", error);
  return !error;
}

/**
 * Writes the parts of a character that change during play.
 *
 * Deliberately narrow: upsertCharacter rewrites the whole row and is owned by
 * the create page, which knows about names and uniqueness. This touches only
 * what the game itself changes, so a purchase cannot accidentally rename anyone
 * or trip the display-name index.
 *
 * Silent when there is no row yet - a wallet that never finished character
 * creation has nothing to update, and the create page will write it in full.
 */
export async function saveCharacterState(
  address: string,
  chain: WalletChainId,
  patch: {
    inventory?: InventoryStack[];
    outfit?: string;
    equippedGun?: string | null;
    equippedPet?: string | null;
    accessories?: string[];
    /** Stored in the brokemeter column, which is what health used to be called. */
    health?: number;
  },
) {
  const db = getDb();
  if (!address) return;
  const row: Record<string, unknown> = {};
  if (patch.inventory) row.inventory = patch.inventory;
  if (patch.outfit) row.outfit = patch.outfit;
  if (patch.equippedGun !== undefined) row.equipped_gun = patch.equippedGun || null;
  if (patch.equippedPet !== undefined) row.equipped_pet = patch.equippedPet || null;
  if (patch.accessories) row.accessories = patch.accessories;
  if (patch.health !== undefined) row.brokemeter = Math.max(0, Math.min(100, Math.round(patch.health)));
  if (Object.keys(row).length === 0) return;

  const { error } = await db
    .from("characters")
    .update(row)
    .eq("wallet_address", normalizeAddress(address, chain))
    .eq("chain", chain);
  logError("save character state", error);
}
