import {
  CITY_ORDER,
  DEFAULT_TRIBE_CITY_THRESHOLDS,
  type CityId,
  type CityThreshold,
} from "@tribe/shared";
import { envNumber } from "./liveEnv";

const FALLBACK = Object.fromEntries(
  DEFAULT_TRIBE_CITY_THRESHOLDS.map((row) => [row.city, row.min]),
) as Record<CityId, number>;

/** District access by $TRIBE held, in whole tokens. The only gate there is. */
export function tributeThresholds(): CityThreshold[] {
  return CITY_ORDER.map((city) => ({
    city,
    min: envNumber(`CITY_MIN_TRIBE_${city.toUpperCase()}`, FALLBACK[city]),
  }));
}
