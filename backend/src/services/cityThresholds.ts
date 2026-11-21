import {
  CITY_ORDER,
  DEFAULT_BUCKS_CITY_THRESHOLDS,
  type CityId,
  type CityThreshold,
} from "@tribe/shared";
import { envNumber } from "./liveEnv";

const FALLBACK = Object.fromEntries(
  DEFAULT_BUCKS_CITY_THRESHOLDS.map((row) => [row.city, row.min]),
) as Record<CityId, number>;

/** District access by Bucks held. Only used for dev launcher demo players. */
export function bucksThresholds(): CityThreshold[] {
  return CITY_ORDER.map((city) => ({
    city,
    min: envNumber(`CITY_MIN_BUCKS_${city.toUpperCase()}`, FALLBACK[city]),
  }));
}
