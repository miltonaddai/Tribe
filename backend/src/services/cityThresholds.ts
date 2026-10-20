import {
  CITY_ORDER,
  DEFAULT_MOON_CITY_THRESHOLDS,
  type CityId,
  type CityThreshold,
} from "@moonville/shared";
import { envNumber } from "./liveEnv";

const FALLBACK = Object.fromEntries(
  DEFAULT_MOON_CITY_THRESHOLDS.map((row) => [row.city, row.min]),
) as Record<CityId, number>;

/** District access by $MOON held, in whole tokens. The only gate there is. */
export function moonThresholds(): CityThreshold[] {
  return CITY_ORDER.map((city) => ({
    city,
    min: envNumber(`CITY_MIN_MOON_${city.toUpperCase()}`, FALLBACK[city]),
  }));
}
