export type CityId = "trench" | "gas" | "realworld" | "valhalla";

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
  trench: {
    id: "trench",
    name: "Trench City",
    shortName: "TRENCH CITY",
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
      "Rough architecture and high randomness. Most players start here. The most fun city to be in.",
  },
  gas: {
    id: "gas",
    name: "Gas City",
    shortName: "GAS CITY",
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
      "Desolate, quiet, and calm. Few buildings, eager hardworking citizens. Wealth second only to Valhalla.",
  },
  realworld: {
    id: "realworld",
    name: "The Real World",
    shortName: "THE REAL WORLD",
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
  valhalla: {
    id: "valhalla",
    name: "Valhalla",
    shortName: "VALHALLA",
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

export const CITY_ORDER: CityId[] = ["trench", "gas", "realworld", "valhalla"];

export type CityThreshold = { min: number; city: CityId };

/** Wallet native balance → starting city. In-game work is the only way to climb after spawn. */
/**
 * District access by $TRIBE held. Under 100,000 tokens is Trench; 1,000,000+ is
 * Valhalla. The middle step is the geometric midpoint of those two, so each tier
 * is about a 3.2x jump rather than one cheap step and one huge one.
 *
 * At a $1M market cap (1B supply, so $0.001/token) that ladder is roughly
 * $100 / $300 / $1,000. Those dollar figures move with the token price.
 */
/**
 * What an unowned home costs, in Tribute, by district. Homes are bought outright
 * at this price - there is no auction, so nothing discovers the price for us.
 *
 * The ladder mirrors the access ladder: a district that takes more $TRIBE to
 * enter takes more to live in. At 1,000 Tribute = $1 that is roughly
 * $25 / $50 / $100 / $250.
 */
export const HOME_PRICE: Record<CityId, number> = {
  trench: 25_000,
  gas: 50_000,
  realworld: 100_000,
  valhalla: 250_000,
};

export const DEFAULT_TRIBE_CITY_THRESHOLDS: CityThreshold[] = [
  { min: 1_000_000, city: "valhalla" },
  { min: 300_000, city: "realworld" },
  { min: 100_000, city: "gas" },
  { min: 0, city: "trench" },
];

export function cityFromBalance(amount: number, thresholds: CityThreshold[]): CityId {
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  for (const row of sorted) {
    if (amount >= row.min) return row.city;
  }
  return "trench";
}

export function canEnterCity(playerTier: number, targetCity: CityId): boolean {
  return playerTier >= CITIES[targetCity].tier;
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
  trench: district(-1, 1),
  gas: district(1, 1),
  realworld: district(-1, -1),
  valhalla: district(1, -1),
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
 * Which edges of a district have a gate through the wall. Both face the middle
 * of the map. Shared so the map draws the openings the world actually builds.
 */
export function cityGates(city: CityId) {
  return {
    south: city === "trench" || city === "gas",
    north: city === "realworld" || city === "valhalla",
    east: city === "trench" || city === "realworld",
    west: city === "gas" || city === "valhalla",
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
