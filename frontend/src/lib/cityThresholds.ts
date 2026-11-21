import { CITY_ORDER, DEFAULT_BUCKS_CITY_THRESHOLDS, type CityId, type CityThreshold } from "@tribe/shared";

/*
 * Every setting is read by its literal name (import.meta.env.VITE_X), never as
 * import.meta.env[key]. Vite can only inline a variable it can see named; a
 * dynamic lookup makes it ship the whole env object instead - every VITE_ value
 * in the deploy, used or not - into the public bundle.
 */
function envNum(raw: string | undefined, fallback: number) {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const FALLBACK = Object.fromEntries(
  DEFAULT_BUCKS_CITY_THRESHOLDS.map((row) => [row.city, row.min]),
) as Record<CityId, number>;

/**
 * District access by Bucks held. Only used for the demo wallet in the dev
 * launcher - a real sign-in takes the district from the server, which is the
 * authority and re-checks it on join.
 */
const CONFIGURED: Record<CityId, string | undefined> = {
  trenches: import.meta.env.VITE_CITY_MIN_BUCKS_TRENCHES,
  bagtown: import.meta.env.VITE_CITY_MIN_BUCKS_BAGTOWN,
  midtown: import.meta.env.VITE_CITY_MIN_BUCKS_MIDTOWN,
  uptown: import.meta.env.VITE_CITY_MIN_BUCKS_UPTOWN,
};

export function bucksThresholds(): CityThreshold[] {
  return CITY_ORDER.map((city) => ({ city, min: envNum(CONFIGURED[city], FALLBACK[city]) }));
}
