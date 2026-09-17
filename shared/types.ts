import type { CityId } from "./cities";
import type { GunId, InventoryStack, PetId } from "./items";

export type BodyType = "slim" | "regular" | "broad";

export type OutfitId =
  | "hi-vis"
  | "hoodie"
  | "suit"
  | "neon"
  | "gold"
  | "puffer"
  | "jersey"
  | "trench-coat"
  | "overalls";

export type HeadwearId = "hardhat" | "beanie" | "cap" | "none" | "crown";

export type AccessoryId = "glasses" | "chain" | "backpack" | "earbuds" | "watch" | "visor";

export type ShoeId = "sneakers" | "boots" | "slides" | "loafers" | "none";

export type PreviewMotion = "idle" | "walk" | "wave" | "dance";

/**
 * Robinhood Chain mainnet, and nothing else. The wallet_chain enum in Postgres
 * still carries the dead solana-testnet value so old rows stay readable, but
 * nothing writes it. Network parameters live in chain.ts on each side; this is
 * only the stored discriminator.
 */
export type WalletChainId = "robinhood";

export const DEFAULT_CHAIN: WalletChainId = "robinhood";

export const WALLET_CHAINS: {
  id: WalletChainId;
  label: string;
  network: string;
  symbol: "ETH";
  hint: string;
}[] = [
  {
    id: "robinhood",
    label: "Robinhood Chain",
    network: "MetaMask / Phantom EVM",
    symbol: "ETH",
    hint: "Sign in with an EVM wallet on Robinhood Chain",
  },
];

export type CharacterAppearance = {
  displayName: string;
  bodyType: BodyType;
  skinTone: string;
  outfit: OutfitId;
  pantsColor: string;
  shoe: ShoeId;
  shoeColor: string;
  headwear: HeadwearId;
  accessories: AccessoryId[];
};

export type CharacterRecord = CharacterAppearance & {
  id: string;
  wallet: string;
  homeCity: CityId;
  accessTier: number;
  brokemeter: number;
  tribute: number;
  inventory: InventoryStack[];
  equippedGun: GunId | null;
  equippedPet: PetId | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  from: string;
  name: string;
  text: string;
  city: CityId | "global";
  at: number;
};

export type TradeOffer = {
  id: string;
  fromSession: string;
  toSession: string;
  fromName: string;
  item: string;
  status: "pending" | "accepted" | "declined";
};

export const SKIN_TONES = [
  "#F6D7B0",
  "#E8B878",
  "#D4A017",
  "#C68642",
  "#8D5524",
  "#5C3317",
];

export const PANT_COLORS = [
  "#3A3A3A",
  "#1E3A8A",
  "#78350F",
  "#14532D",
  "#7F1D1D",
  "#F5F5F4",
  "#111827",
  "#CA8A04",
];

export const SHOE_COLORS = [
  "#111111",
  "#F8FAFC",
  "#78350F",
  "#B91C1C",
  "#1D4ED8",
  "#D4AF37",
];

export const OUTFITS: { id: OutfitId; label: string }[] = [
  { id: "hi-vis", label: "Hi-Vis Work Jacket" },
  { id: "hoodie", label: "Street Hoodie" },
  { id: "suit", label: "Suit & Tie" },
  { id: "neon", label: "Neon Runner" },
  { id: "gold", label: "Valhalla Gold" },
  { id: "puffer", label: "Puffer Jacket" },
  { id: "jersey", label: "Block Jersey" },
  { id: "trench-coat", label: "Trench Coat" },
  { id: "overalls", label: "Work Overalls" },
];

export const HEADWEAR: { id: HeadwearId; label: string }[] = [
  { id: "hardhat", label: "Hard Hat" },
  { id: "beanie", label: "Beanie" },
  { id: "cap", label: "Cap" },
  { id: "crown", label: "Crown" },
  // "None" goes last: it is the opt-out, not a choice among the hats.
  { id: "none", label: "None" },
];

export const ACCESSORIES: { id: AccessoryId; label: string }[] = [
  { id: "glasses", label: "Glasses" },
  { id: "chain", label: "Gold Chain" },
  { id: "backpack", label: "Backpack" },
  { id: "earbuds", label: "Earbuds" },
  { id: "watch", label: "Watch" },
  { id: "visor", label: "Visor" },
];

export const SHOES: { id: ShoeId; label: string }[] = [
  { id: "sneakers", label: "Sneakers" },
  { id: "boots", label: "Boots" },
  { id: "slides", label: "Slides" },
  { id: "loafers", label: "Loafers" },
  { id: "none", label: "None" },
];

const ACCESSORY_SET = new Set<string>(ACCESSORIES.map((a) => a.id));
const SHOE_SET = new Set<string>(SHOES.map((s) => s.id));

export function parseAccessories(raw: unknown): AccessoryId[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\s]+/);
  const seen = new Set<AccessoryId>();
  for (const item of list) {
    const id = String(item).trim() as AccessoryId;
    if (ACCESSORY_SET.has(id)) seen.add(id);
  }
  return [...seen];
}

export function parseHexColor(raw: unknown, fallback: string) {
  const value = String(raw ?? "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

export function parseShoe(raw: unknown): ShoeId {
  const id = String(raw ?? "").trim();
  return SHOE_SET.has(id) ? (id as ShoeId) : "sneakers";
}

export const PREVIEW_MOTIONS: { id: PreviewMotion; label: string }[] = [
  { id: "idle", label: "Idle" },
  { id: "walk", label: "Walk" },
  { id: "wave", label: "Wave" },
  { id: "dance", label: "Dance" },
];

export const DEFAULT_SETTINGS = {
  masterVolume: 70,
  music: 45,
  sfx: 80,
  voiceChat: "Push to Talk",
  cameraSensitivity: 55,
  invertY: false,
  healthWarnings: true,
  chatFilter: "Standard",
  qualityPreset: "High",
  renderDistance: 60,
  timeOfDay: "Local Time" as "Local Time" | "Always Day" | "Always Night",
  showFps: false,
  motionBlur: false,
  showWalletPublicly: false,
  tradeRequests: "Friends Only",
  emailNotifications: true,
};

export type GameSettings = typeof DEFAULT_SETTINGS;
