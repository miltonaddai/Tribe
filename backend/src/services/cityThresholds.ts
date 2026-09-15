import {
  CITY_ORDER,
  DEFAULT_ETH_CITY_THRESHOLDS,
  type CityId,
  type CityThreshold,
  type WalletChainId,
} from "@the-block/shared";
import { envNumber } from "./liveEnv";

const FALLBACK = Object.fromEntries(DEFAULT_ETH_CITY_THRESHOLDS.map((row) => [row.city, row.min])) as Record<
  CityId,
  number
>;

export function thresholdsForChain(_chain: WalletChainId): CityThreshold[] {
  return CITY_ORDER.map((city) => ({
    city,
    min: envNumber(`CITY_MIN_ETH_${city.toUpperCase()}`, FALLBACK[city]),
  }));
}
