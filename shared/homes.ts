import { CITIES, CITY_BOUNDS, CITY_GRID, CITY_ORDER, CITY_SIZE, HOME_PRICE, type CityId } from "./cities";

/**
 * Which grid lots carry a landmark rather than a house. Lives here rather than
 * in the renderer so the server can derive the same home set the client builds.
 */
export type LandmarkKind = "townhouse" | "hospital" | "police" | "store" | "dealer" | "fashion" | "park";

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
  // Next door to the store, which puts the two retail fronts on one row.
  // Deliberately not (4, 2) or (3, 2): those lots are homes players own, and a
  // landmark there would delete a house somebody paid for.
  { gx: 2, gz: 1, kind: "fashion" },
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

/**
 * How many floors the home on a lot has - the thing that makes one building
 * visibly bigger than its neighbour.
 *
 * Derived here rather than read off the geometry so the server can price a home
 * without knowing anything about rendering. The leading draw mirrors the density
 * roll the world builder makes first, so this returns the building actually
 * drawn; the builder calls this too, so the two cannot drift apart.
 */
export function homeFloors(city: CityId, gx: number, gz: number): number {
  const theme = CITIES[city];
  const roll = mulberry(lotSeed(city, gx, gz));
  roll(); // density roll, consumed by the builder before it picks floors
  return theme.minFloors + Math.floor(roll() * (theme.maxFloors - theme.minFloors + 1));
}

/**
 * What an unowned home costs, in Bucks: the district's base price scaled by
 * how big the building is.
 *
 * Normalised across the district's own floor range, so the largest home in a
 * district always costs twice the smallest whatever that range happens to be.
 * Uptown spans 4-10 floors and Bagtown only 1-2, and a flat premium per floor
 * would make a Uptown penthouse absurd while barely touching Bagtown.
 */
export function homePrice(city: CityId, gx: number, gz: number): number {
  const theme = CITIES[city];
  const base = HOME_PRICE[city] ?? HOME_PRICE.trenches;
  const span = theme.maxFloors - theme.minFloors;
  const size = span > 0 ? (homeFloors(city, gx, gz) - theme.minFloors) / span : 0;
  // Rounded to the nearest 500 so prices read as prices, not as hashes.
  return Math.round((base * (1 + size)) / 500) * 500;
}

/** Price from a home id, for callers holding an id rather than a lot. */
export function homePriceById(id: string): number | null {
  const lot = parseHomeId(id);
  return lot ? homePrice(lot.city, lot.gx, lot.gz) : null;
}

/**
 * How grand a home is, 0 to 3, from what it costs.
 *
 * Price already folds in both district and building size, so this is one number
 * the interior can be built from - a cheap Trenches flat and a Uptown penthouse
 * should not be the same room with a different view.
 */
export function homeGrade(city: CityId, gx: number, gz: number): number {
  return Math.min(3, Math.floor(homeLuxury(city, gx, gz) * 4));
}

/**
 * 0-1 across the price range, for sizing a room smoothly.
 *
 * Logarithmic, because prices span twenty-fold and each district is roughly a
 * doubling of the one below. On a linear scale everything under six figures
 * collapses into the bottom band, and a 100,000 Bagtown home comes out the same as
 * a 25,000 Trenches flat.
 */
export function homeLuxury(city: CityId, gx: number, gz: number): number {
  const price = homePrice(city, gx, gz);
  const lo = HOME_PRICE.trenches;
  const hi = HOME_PRICE.uptown * 2;
  const t = Math.log(price / lo) / Math.log(hi / lo);
  return Math.max(0, Math.min(1, t));
}

export function homeGradeById(id: string): { grade: number; luxury: number } {
  const lot = parseHomeId(id);
  if (!lot) return { grade: 0, luxury: 0 };
  return { grade: homeGrade(lot.city, lot.gx, lot.gz), luxury: homeLuxury(lot.city, lot.gx, lot.gz) };
}

/**
 * Floor on an owner's asking price, in Bucks: enough that a listing means
 * something, not enough to price anyone out.
 *
 * Shared so the sell panel and the server cannot disagree about what is valid.
 */
export const MIN_ASKING_PRICE = 1_000;
