import { MapSchema, Schema, defineTypes, view } from "@colyseus/schema";

export class PlayerState extends Schema {
  sessionId = "";
  name = "citizen";
  wallet = "";
  city = "trenches";
  accessTier = 1;
  x = 0;
  y = 0;
  z = 0;
  rotY = 0;
  bodyType = "regular";
  skinTone = "#F6D7B0";
  outfit = "hi-vis";
  pantsColor = "#3A3A3A";
  shoe = "sneakers";
  shoeColor = "#111111";
  headwear = "hardhat";
  accessories = "";
  health = 100;
  inVehicle = false;
  vehicleId = "";
  inBuilding = false;
  buildingId = "";
  sitting = false;
  /** Lying down rather than sitting, so onlookers see a sleeper not a stander. */
  lying = false;
  /** The player's Block Bucks balance, pushed by the server. Never seeded here. */
  bucks = 0;
  inventory = "[]";
  gun = "";
  pet = "";
}
defineTypes(PlayerState, {
  sessionId: "string",
  name: "string",
  wallet: "string",
  city: "string",
  accessTier: "number",
  x: "number",
  y: "number",
  z: "number",
  rotY: "number",
  bodyType: "string",
  skinTone: "string",
  outfit: "string",
  pantsColor: "string",
  shoe: "string",
  shoeColor: "string",
  headwear: "string",
  accessories: "string",
  health: "number",
  inVehicle: "boolean",
  vehicleId: "string",
  inBuilding: "boolean",
  buildingId: "string",
  sitting: "boolean",
  lying: "boolean",
  bucks: "number",
  inventory: "string",
  gun: "string",
  pet: "string",
});

export class VehicleState extends Schema {
  id = "";
  city = "trenches";
  x = 0;
  y = 0.6;
  z = 0;
  rotY = 0;
  color = "#FF8A3D";
  kind = "sedan";
  driver = "";
  /** Wallet that bought this car. Empty for the cars that seed the world. */
  owner = "";
  /** Owner-controlled. Unlocking lets anyone drive it; it stays theirs. */
  locked = false;
  /** Owner has put it up for sale at askingPrice. */
  forSale = false;
  /** What the owner is asking. 0 when it is not for sale. */
  askingPrice = 0;
}
defineTypes(VehicleState, {
  id: "string",
  city: "string",
  x: "number",
  y: "number",
  z: "number",
  rotY: "number",
  color: "string",
  kind: "string",
  driver: "string",
  owner: "string",
  locked: "boolean",
  forSale: "boolean",
  askingPrice: "number",
});

export class ChatLine extends Schema {
  id = "";
  from = "";
  name = "";
  text = "";
  city = "global";
  at = 0;
}
defineTypes(ChatLine, {
  id: "string",
  from: "string",
  name: "string",
  text: "string",
  city: "string",
  at: "number",
});

export class HomeState extends Schema {
  id = "";
  city = "trenches";
  /** Wallet of the winner once settled; empty while the home is still for sale. */
  owner = "";
  ownerChain = "";
  ownerName = "";
  /** Owner has put their home back on the market. Ignored while owner is empty. */
  forSale = false;
  /** Owner's name for the place. Decoration, not identity; empty means unnamed. */
  name = "";
  /** What the home last changed hands for, kept for the SOLD tag. */
  lastPrice = 0;
  /** Seller's asking price for the current listing. 0 = never-owned city home. */
  askingPrice = 0;
  /** Seller's chosen auction length in seconds. 0 = use the configured default. */
  durationSeconds = 0;
  /** Owner-controlled. Unlocking lets anyone walk in; it stays theirs. */
  locked = true;
  /** Auction has closed and the seller must accept or reject the winning bid. */
  awaitingSeller = false;
  /** Epoch ms the offer is auto-accepted if the seller has not answered. */
  decideBy = 0;
  highBid = 0;
  highBidderWallet = "";
  highBidderChain = "";
  highBidderName = "";
  /** Epoch ms the auction closes. 0 means nobody has opened the bidding yet. */
  endsAt = 0;
}
defineTypes(HomeState, {
  id: "string",
  city: "string",
  owner: "string",
  ownerChain: "string",
  ownerName: "string",
  name: "string",
  forSale: "boolean",
  lastPrice: "number",
  askingPrice: "number",
  durationSeconds: "number",
  locked: "boolean",
  awaitingSeller: "boolean",
  decideBy: "number",
  highBid: "number",
  highBidderWallet: "string",
  highBidderChain: "string",
  highBidderName: "string",
  endsAt: "number",
});

export class WorldState extends Schema {
  players = new MapSchema<PlayerState>();
  vehicles = new MapSchema<VehicleState>();
  chat = new MapSchema<ChatLine>();
  homes = new MapSchema<HomeState>();
  /** Mirrored from .env so clients can show what the next bid has to be. */
  homeOpeningBid = 250;
  homeBidIncrement = 50;
}
defineTypes(WorldState, {
  players: { map: PlayerState },
  vehicles: { map: VehicleState },
  chat: { map: ChatLine },
  homes: { map: HomeState },
  homeOpeningBid: "number",
  homeBidIncrement: "number",
});

/**
 * Area-of-interest filtering: a client only receives players it can actually
 * see. Without it the server sends every player to every player, which is
 * O(n^2) and caps the world around 80.
 *
 * On by default. Measured at 500 players on Colyseus 0.18:
 *   - bandwidth per client drops ~12x at realistic density (124 KB/s -> ~10)
 *   - each client tracks ~40 neighbours instead of 500
 *   - costs server CPU: event-loop p99 rises from ~25ms to ~50ms, because
 *     every client now gets its own encode instead of one shared broadcast
 * Set INTEREST_MANAGEMENT=false to fall back to a full broadcast.
 *
 * On Colyseus 0.16 this logged `"refId" not found` whenever a client joined
 * while others were moving; the 0.18 upgrade resolved it.
 *
 * This must use the view() decorator directly: defineTypes() silently drops a
 * `view` key in the field descriptor, so `view: true` above would do nothing.
 */
export const INTEREST_MANAGEMENT = process.env.INTEREST_MANAGEMENT !== "false";

if (INTEREST_MANAGEMENT) {
  view()(WorldState.prototype, "players");
}
