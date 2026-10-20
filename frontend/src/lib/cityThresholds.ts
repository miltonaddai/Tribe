import { CITY_ORDER, DEFAULT_MOON_CITY_THRESHOLDS, type CityId, type CityThreshold } from "@moonville/shared";

function envNum(key: string, fallback: number) {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const FALLBACK = Object.fromEntries(
  DEFAULT_MOON_CITY_THRESHOLDS.map((row) => [row.city, row.min]),
) as Record<CityId, number>;

/**
 * District access by $MOON held. Only used for the demo wallet in the dev
 * launcher - a real sign-in takes the district from the server, which is the
 * authority and re-checks it on join.
 */
export function moonThresholds(): CityThreshold[] {
  return CITY_ORDER.map((city) => ({
    city,
    min: envNum(`VITE_CITY_MIN_MOON_${city.toUpperCase()}`, FALLBACK[city]),
  }));
}
