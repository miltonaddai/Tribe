import { CITIES, CITY_BOUNDS, CITY_GRID, CITY_ORDER, CITY_SIZE, type CityId } from "./cities";

/**
 * Which grid lots carry a landmark rather than a house. Lives here rather than
 * in the renderer so the server can derive the same home set the client builds.
 */
export type LandmarkKind = "townhouse" | "hospital" | "police" | "store" | "dealer" | "park";

/**
 * Landmark facades are hand-built facing +Z, so landmarks sit on the rows where
 * +Z points at the central east-west avenue (gz below the middle of the grid).
 * That keeps them fronting the main street like everything else, and off the
 * outer row where they would face the wall.
 */
export const LANDMARKS: { gx: number; gz: number; kind: LandmarkKind }[] = [
  { gx: 2, gz: 2, kind: "townhouse" },
  { gx: 4, gz: 0, kind: "hospital" },
  { gx: 0, gz: 1, kind: "police" },
  { gx: 3, gz: 1, kind: "store" },
  { gx: 1, gz: 2, kind: "dealer" },
  // The park has no facade, so it is free to sit on any row.
  { gx: 4, gz: 3, kind: "park" },
];

/** World-space centre of a grid lot. Shared so the server can place spawns. */
export function lotCentre(city: CityId, gx: number, gz: number): { x: number; z: number } {
  const b = CITY_BOUNDS[city];
  const cell = CITY_SIZE / CITY_GRID;
  return { x: b.minX + cell * (gx + 0.5), z: b.minZ + cell * (gz + 0.5) };
}

export function landmarkLot(kind: LandmarkKind) {
  return LANDMARKS.find((l) => l.kind === kind) ?? null;
}

export function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable seed for one lot, derived only from the city and grid coordinate.
 * A lot's generated shape never depends on how many lots came before it.
 */
export function lotSeed(cityId: string, gx: number, gz: number) {
  const key = `${cityId}:${gx}:${gz}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Ownership is sold against this id, so it must stay derivable from position alone. */
export function homeId(city: CityId, gx: number, gz: number) {
  return `${city}-home-${gx}-${gz}`;
}

export function parseHomeId(id: string): { city: CityId; gx: number; gz: number } | null {
  const match = /^([a-z]+)-home-(\d{1,3})-(\d{1,3})$/.exec(id);
  if (!match) return null;
  const city = match[1] as CityId;
  if (!CITY_ORDER.includes(city)) return null;
  return { city, gx: Number(match[2]), gz: Number(match[3]) };
}

/**
 * Whether world generation puts a house on this lot. Mirrors the first draw of
 * the lot's stream in buildCity — keep the two in step.
 */
export function lotHasHome(city: CityId, gx: number, gz: number) {
  if (!Number.isInteger(gx) || !Number.isInteger(gz)) return false;
  if (gx < 0 || gz < 0 || gx >= CITY_GRID || gz >= CITY_GRID) return false;
  if (LANDMARKS.some((l) => l.gx === gx && l.gz === gz)) return false;
  return mulberry(lotSeed(city, gx, gz))() <= CITIES[city].density;
}

/** Every home the world currently contains. Used to spot auctions that have drifted. */
export function allHomeIds(): string[] {
  const ids: string[] = [];
  for (const city of CITY_ORDER) {
    for (let gx = 0; gx < CITY_GRID; gx++) {
      for (let gz = 0; gz < CITY_GRID; gz++) {
        if (lotHasHome(city, gx, gz)) ids.push(homeId(city, gx, gz));
      }
    }
  }
  return ids;
}

/** A real, currently-existing home — not just a plausibly-shaped string. */
export function isHomeId(id: string) {
  const parsed = parseHomeId(id);
  return parsed ? lotHasHome(parsed.city, parsed.gx, parsed.gz) : false;
}
