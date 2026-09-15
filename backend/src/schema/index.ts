import { MapSchema, Schema, defineTypes } from "@colyseus/schema";

export class PlayerState extends Schema {
  sessionId = "";
  name = "citizen";
  wallet = "";
  city = "trench";
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
  credits = 500;
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
  credits: "number",
  inventory: "string",
  gun: "string",
  pet: "string",
});

export class VehicleState extends Schema {
  id = "";
  city = "trench";
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
  city = "trench";
  /** Wallet of the winner once settled; empty while the home is still for sale. */
  owner = "";
  ownerChain = "";
  ownerName = "";
  /** Owner has put their home back on the market. Ignored while owner is empty. */
  forSale = false;
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
