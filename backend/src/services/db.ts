import {
  DEFAULT_CHAIN,
  isGunId,
  isPetId,
  parseAccessories,
  parseHexColor,
  parseShoe,
  seedInventory,
  type CharacterRecord,
  type CityId,
  type GameSettings,
  type WalletChainId,
} from "@tribe/shared";
import { getSupabase } from "./supabase";
import { nameKey } from "@tribe/shared";

type WalletRow = {
  address: string;
  chain: WalletChainId;
  /** Access is tied to $TRIBE alone, so the stored balance is always in it. */
  symbol: "TRIBE";
  last_balance: number;
  last_city: CityId;
};

function normalizeAddress(address: string, chain: WalletChainId) {
  return chain === "robinhood" ? address.toLowerCase() : address;
}

function logError(action: string, error: { message: string } | null) {
  if (error) console.warn(`[supabase] ${action} failed: ${error.message}`);
}

export async function upsertWallet(row: WalletRow) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const address = normalizeAddress(row.address, row.chain);
  const { data, error } = await supabase
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
  const supabase = getSupabase();
  if (!supabase) return true;
  const { data, error } = await supabase
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
  const supabase = getSupabase();
  if (!supabase) return { persisted: false as const };
  const address = normalizeAddress(record.wallet, chain);
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("address", address)
    .eq("chain", chain)
    .maybeSingle();
  let walletId = wallet?.id as string | undefined;
  if (!walletId) {
    const { data: created, error: walletError } = await supabase
      .from("wallets")
      .insert({
        address,
        chain,
        symbol: "TRIBE",
        last_city: record.homeCity,
      })
      .select("id")
      .single();
    logError("insert wallet for character", walletError);
    walletId = created?.id;
  }
  const { data: existing } = await supabase
    .from("characters")
    .select("id, created_at")
    .eq("wallet_address", address)
    .eq("chain", chain)
    .maybeSingle();
  const id = existing?.id ?? record.id;
  const { error } = await supabase.from("characters").upsert(
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
      tribute: record.tribute ?? 0,
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
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
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
    tribute: Number(data.tribute ?? 0),
    inventory: seedInventory(parseAccessories(data.accessories), data.inventory),
    equippedGun: isGunId(String(data.equipped_gun ?? "")) ? data.equipped_gun : null,
    equippedPet: isPetId(String(data.equipped_pet ?? "")) ? data.equipped_pet : null,
    createdAt: data.created_at,
  };
}

export async function upsertSettings(address: string, chain: WalletChainId, settings: GameSettings) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("player_settings").upsert(
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
    city: (data.city ?? "trench") as CityId,
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
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("home_auctions").select("*");
  logError("load home auctions", error);
  return (data ?? []).map(toAuctionRow);
}

export async function saveHomeAuction(row: HomeAuctionRow) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("home_auctions").upsert(
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

export async function fetchTribute(address: string, chain: WalletChainId): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("characters")
    .select("tribute")
    .eq("wallet_address", normalizeAddress(address, chain))
    .eq("chain", chain)
    .maybeSingle();
  logError("fetch tribute", error);
  if (!data) return null;
  const tribute = Number(data.tribute);
  return Number.isFinite(tribute) ? tribute : null;
}

/**
 * Tribute movements that the server owns (auction escrow and payouts) are
 * written straight to the character row so they outlive the session.
 */
export async function writeTribute(address: string, chain: WalletChainId, tribute: number) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("characters")
    .update({ tribute: Math.max(0, Math.round(tribute)), updated_at: new Date().toISOString() })
    .eq("wallet_address", normalizeAddress(address, chain))
    .eq("chain", chain);
  logError("write tribute", error);
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
};

export async function loadPlayerVehicles(): Promise<PlayerVehicleRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("player_vehicles").select("*");
  logError("load player vehicles", error);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    ownerWallet: String(row.owner_wallet ?? ""),
    ownerChain: (row.owner_chain ?? DEFAULT_CHAIN) as WalletChainId,
    city: (row.city ?? "trench") as CityId,
    kind: String(row.kind ?? "sedan"),
    color: String(row.color ?? "#FFFFFF"),
    x: Number(row.x ?? 0),
    z: Number(row.z ?? 0),
    rotY: Number(row.rot_y ?? 0),
    locked: row.locked == null ? true : Boolean(row.locked),
  }));
}

export async function savePlayerVehicle(row: PlayerVehicleRow) {
  const supabase = getSupabase();
  if (!supabase || !row.ownerWallet) return;
  const { error } = await supabase.from("player_vehicles").upsert(
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
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  logError("save player vehicle", error);
}

/**
 * Claims a verified payment, returning false if it was already used.
 *
 * The insert IS the claim. Checking for an existing row first would leave a gap
 * between the check and the write that two simultaneous requests could both
 * pass through, and a duplicate here means an item bought twice for one payment.
 * The primary key settles it atomically instead.
 */
export async function claimPayment(payment: {
  txHash: string;
  address: string;
  chain: WalletChainId;
  amount: bigint;
  purpose: string;
  itemId?: string;
}): Promise<boolean> {
  const supabase = getSupabase();
  // No database means no replay protection, so refuse rather than hand out goods.
  if (!supabase) return false;
  const { error } = await supabase.from("token_payments").insert({
    tx_hash: payment.txHash.toLowerCase(),
    wallet_address: normalizeAddress(payment.address, payment.chain),
    chain: payment.chain,
    amount: payment.amount.toString(),
    purpose: payment.purpose,
    item_id: payment.itemId ?? null,
  });
  if (!error) return true;
  // 23505 is unique_violation: this payment has already bought something.
  if (error.code !== "23505") logError("claim payment", error);
  return false;
}
