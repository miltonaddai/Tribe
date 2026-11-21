export type CityId = "trenches" | "bagtown" | "midtown" | "uptown";

export type CityTheme = {
  id: CityId;
  name: string;
  shortName: string;
  tier: 1 | 2 | 3 | 4;
  accent: string;
  building: string[];
  window: string;
  emissive: string;
  road: string;
  sidewalk: string;
  sky: [number, number, number];
  fog: [number, number, number];
  fogDensity: number;
  ambient: [number, number, number];
  sun: [number, number, number];
  night: boolean;
  density: number;
  minFloors: number;
  maxFloors: number;
  tagline: string;
  description: string;
};

export const CITIES: Record<CityId, CityTheme> = {
  trenches: {
    id: "trenches",
    name: "Trenches",
    shortName: "TRENCHES",
    tier: 1,
    accent: "#9B59D0",
    building: ["#7A3FBF", "#8B4FD4", "#6A32A8", "#9A62E0"],
    window: "#F4E8FF",
    emissive: "#C9A0FF",
    road: "#4A4A4A",
    sidewalk: "#C5C5C5",
    sky: [0.55, 0.78, 0.95],
    fog: [0.7, 0.82, 0.92],
    fogDensity: 0.012,
    ambient: [0.55, 0.5, 0.6],
    sun: [1, 0.95, 0.85],
    night: false,
    density: 0.85,
    minFloors: 1,
    maxFloors: 3,
    tagline: "Tier 1 — Poorest",
    description:
      "Rough architecture and high randomness. Everyone starts here, and it is the most fun place to be.",
  },
  bagtown: {
    id: "bagtown",
    name: "Bagtown",
    shortName: "BAGTOWN",
    tier: 2,
    accent: "#4A90D9",
    building: ["#3D6EAE", "#4A7FBF", "#5B8FCF", "#2F5F9A"],
    window: "#D6E9FF",
    emissive: "#7EC8FF",
    road: "#5A5A5A",
    sidewalk: "#B0B8C0",
    sky: [0.72, 0.82, 0.9],
    fog: [0.75, 0.84, 0.92],
    fogDensity: 0.028,
    ambient: [0.5, 0.55, 0.62],
    sun: [0.85, 0.9, 1],
    night: false,
    density: 0.4,
    minFloors: 1,
    maxFloors: 2,
    tagline: "Tier 2",
    description:
      "Desolate, quiet, and calm. Few buildings, eager hardworking citizens. Wealth second only to Uptown.",
  },
  midtown: {
    id: "midtown",
    name: "Midtown",
    shortName: "MIDTOWN",
    tier: 3,
    accent: "#2ECC71",
    building: ["#14352C", "#1C4A3C", "#0E2A24", "#1A3F34"],
    window: "#39FF14",
    emissive: "#3DFF8A",
    road: "#2A2A2A",
    sidewalk: "#3A3A3A",
    sky: [0.04, 0.08, 0.14],
    fog: [0.05, 0.12, 0.1],
    fogDensity: 0.02,
    ambient: [0.08, 0.18, 0.12],
    sun: [0.15, 0.35, 0.22],
    night: true,
    density: 0.75,
    minFloors: 1,
    maxFloors: 3,
    tagline: "Tier 3",
    description:
      "Flashy modern buildings and neon design. Orderly citizens, moderate wealth, and a booming economy.",
  },
  uptown: {
    id: "uptown",
    name: "Uptown",
    shortName: "UPTOWN",
    tier: 4,
    accent: "#FFD700",
    building: ["#E8C547", "#D4AF37", "#F0D060", "#C9A227"],
    window: "#FFF6D0",
    emissive: "#FFE28A",
    road: "#3A3A3A",
    sidewalk: "#D8D4CC",
    sky: [0.48, 0.72, 0.95],
    fog: [0.7, 0.82, 0.95],
    fogDensity: 0.008,
    ambient: [0.6, 0.55, 0.45],
    sun: [1, 0.95, 0.8],
    night: false,
    density: 0.7,
    minFloors: 4,
    maxFloors: 10,
    tagline: "Tier 4 — Wealthiest",
    description:
      "Modern architecture, fancy cars, and an old established population. It takes a lot to make it in here.",
  },
};

export const CITY_ORDER: CityId[] = ["trenches", "bagtown", "midtown", "uptown"];

export type CityThreshold = { min: number; city: CityId };

/**
 * What an unowned home costs, in Bucks, by district. Homes are bought outright
 * at this price - there is no auction, so nothing discovers the price for us.
 *
 * Each rung costs more than the last, and a home is also the key to the next
 * district up (see homeAccessTier), so the price of a district's homes is the
 * price of climbing out of it.
 */
export const HOME_PRICE: Record<CityId, number> = {
  trenches: 25_000,
  bagtown: 50_000,
  midtown: 100_000,
  uptown: 250_000,
};

/**
 * Balance thresholds by district. They no longer gate real players - homes
 * do - and survive only for the dev launcher's demo:<n> players, whose made-up
 * balance stands in for climbing the ladder so every district can be tested.
 */
export const DEFAULT_BUCKS_CITY_THRESHOLDS: CityThreshold[] = [
  { min: 500_000, city: "uptown" },
  { min: 300_000, city: "midtown" },
  { min: 100_000, city: "bagtown" },
  { min: 0, city: "trenches" },
];

export function cityFromBalance(amount: number, thresholds: CityThreshold[]): CityId {
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  for (const row of sorted) {
    if (amount >= row.min) return row.city;
  }
  return "trenches";
}

export function canEnterCity(playerTier: number, targetCity: CityId): boolean {
  return playerTier >= CITIES[targetCity].tier;
}

/**
 * District access is earned with homes, one rung at a time: a home in the
 * Trenches opens Bagtown, a home in Bagtown opens Midtown, a home in Midtown
 * opens Uptown. Bucks held do not open anything; it only pays for things.
 *
 * Expressed as a tier: no homes is tier 1 (the Trenches), and each home lifts
 * you to one tier above its district. So owning in a district always lets you
 * back into it, and every district below stays open - the higher you have
 * climbed, the more of the map is yours to walk.
 */
export function homeAccessTier(ownedCities: Iterable<CityId>): number {
  let tier = 1;
  for (const city of ownedCities) {
    const home = CITIES[city]?.tier;
    if (home) tier = Math.max(tier, Math.min(4, home + 1));
  }
  return capTier(tier);
}

/**
 * Whether homes and cars can be bought and sold.
 *
 * Off for now. While it is off nobody can buy a home or a car - from the city,
 * a dealership or another player - or put one up for sale, and since homes are
 * the keys to the districts above, only the Trenches is open: every other
 * district is locked for everyone, home owners included. Flip this to true to
 * bring the property market and the district ladder back.
 */
export const PROPERTY_MARKET_OPEN = false;

/** The highest district tier anyone may enter right now. */
export const MAX_OPEN_TIER = PROPERTY_MARKET_OPEN ? 4 : 1;

/** Clamps an access tier to what is currently open. */
export function capTier(tier: number): number {
  return Math.min(MAX_OPEN_TIER, tier);
}

/** Said whenever someone tries to buy or sell property while the market is closed. */
export const PROPERTY_CLOSED_TEXT = "Homes and cars aren't for sale yet.";

/** The district whose homes open this one, or null for the Trenches, which is open to all. */
export function unlockingCity(city: CityId): CityId | null {
  const tier = CITIES[city].tier;
  if (tier <= 1) return null;
  return CITY_ORDER.find((id) => CITIES[id].tier === tier - 1) ?? null;
}

/** World layout: 2×2 districts around origin. Each city is CITY_SIZE² with a GATE_HALF belt. */
export const CITY_SIZE = 192;
export const CITY_GRID = 6;
export const GATE_HALF = 20;
/**
 * Half-extent of the playable square. The margin has to clear the city wall,
 * which now stands outside each district's perimeter road.
 */
export const WORLD_HALF = GATE_HALF + CITY_SIZE + 14;

function district(signX: 1 | -1, signZ: 1 | -1): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  spawn: [number, number, number];
} {
  const inner = GATE_HALF;
  const outer = GATE_HALF + CITY_SIZE;
  const minX = signX < 0 ? -outer : inner;
  const maxX = signX < 0 ? -inner : outer;
  const minZ = signZ < 0 ? -outer : inner;
  const maxZ = signZ < 0 ? -inner : outer;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    spawn: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
  };
}

export const CITY_BOUNDS: Record<
  CityId,
  { minX: number; maxX: number; minZ: number; maxZ: number; spawn: [number, number, number] }
> = {
  trenches: district(-1, 1),
  bagtown: district(1, 1),
  midtown: district(-1, -1),
  uptown: district(1, -1),
};

/**
 * How far the city wall stands OUTSIDE the district bounds (ROAD_W / 2 + 0.8).
 *
 * It used to sit inside, which put it between the interior streets and the
 * perimeter ring road - so every interior street ran into a wall instead of
 * closing the loop. Outside the ring road, the whole grid connects.
 */
export const CITY_WALL_OUTSET = 5.8;

/**
 * The city you are inside the walls of, or null for the ring road, the central
 * belt and everywhere else. Tier gating keys off this rather than the raw
 * district bounds, so a player is turned back at the gate they can see instead
 * of at an invisible line out in the road.
 */
export function insideCityWalls(x: number, z: number): CityId | null {
  for (const id of CITY_ORDER) {
    const b = CITY_BOUNDS[id];
    if (
      x >= b.minX - CITY_WALL_OUTSET &&
      x <= b.maxX + CITY_WALL_OUTSET &&
      z >= b.minZ - CITY_WALL_OUTSET &&
      z <= b.maxZ + CITY_WALL_OUTSET
    ) {
      return id;
    }
  }
  return null;
}

/**
 * The city a move would carry you *into*, or null when it would not cross a
 * wall inward - including any move that stays within the city you are already
 * standing in.
 *
 * Gating has to be a test on the crossing rather than on the destination. When
 * it tested the destination, a player whose balance fell while they were inside
 * a district had every move refused, in every direction, because every point
 * around them was still inside the walls. They were imprisoned by the gate
 * meant to keep them out, with no way back to the road and no way to recover
 * short of reloading the page.
 *
 * Testing the crossing instead makes the rule mean what it says: you may not
 * come *in*. Walking out, and walking around while you are in there, are both
 * fine - and once you are out, the same rule quietly keeps you out.
 */
export function cityEntered(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): CityId | null {
  const to = insideCityWalls(toX, toZ);
  if (!to) return null;
  return insideCityWalls(fromX, fromZ) === to ? null : to;
}

/**
 * Which edges of a district have a gate through the wall. Both face the middle
 * of the map. Shared so the map draws the openings the world actually builds.
 */
export function cityGates(city: CityId) {
  return {
    south: city === "trenches" || city === "bagtown",
    north: city === "midtown" || city === "uptown",
    east: city === "trenches" || city === "midtown",
    west: city === "bagtown" || city === "uptown",
  };
}

export function cityAtPosition(x: number, z: number): CityId | "gate" | "void" {
  for (const id of CITY_ORDER) {
    const b = CITY_BOUNDS[id];
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return id;
  }
  const outer = WORLD_HALF;
  if (Math.abs(x) <= outer && Math.abs(z) <= outer) return "gate";
  return "void";
}
