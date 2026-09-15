import { CITY_ORDER, DEFAULT_ETH_CITY_THRESHOLDS, type CityId, type CityThreshold } from "@the-block/shared";

function envNum(key: string, fallback: number) {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const FALLBACK = Object.fromEntries(DEFAULT_ETH_CITY_THRESHOLDS.map((row) => [row.city, row.min])) as Record<
  CityId,
  number
>;

export function ethThresholds(): CityThreshold[] {
  return CITY_ORDER.map((city) => ({
    city,
    min: envNum(`VITE_CITY_MIN_ETH_${city.toUpperCase()}`, FALLBACK[city]),
  }));
}
