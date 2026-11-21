import { CITIES, cityFromBalance, DEFAULT_CHAIN, MAX_OPEN_TIER, type CityId, type WalletChainId } from "@tribe/shared";
import { bucksThresholds } from "./cityThresholds";
import { fetchBucks } from "./db";
import { STARTING_BUCKS } from "./liveEnv";

/**
 * How many Bucks a player holds.
 *
 * Bucks are a balance on the character row in the local database. A player with no character yet reads as the starting
 * grant, which is what their character will be created with.
 *
 * `demo:<n>` ids report n, so the dev launcher can exercise every tier.
 */
export async function bucksHoldings(playerId: string, chain: WalletChainId): Promise<number> {
  if (playerId.startsWith("demo:")) {
    const n = Number(playerId.split(":")[1]);
    return Number.isFinite(n) ? n : 0;
  }
  const stored = await fetchBucks(playerId, chain);
  return stored ?? STARTING_BUCKS;
}

/**
 * A player's holdings, and the district a fresh session starts from.
 *
 * Districts are opened by owning homes (see homeAccessTier), so the starting
 * district is the Trenches. `demo:<n>` ids keep the balance ladder so the dev
 * launcher can reach every district.
 */
export async function startingCityForWallet(
  playerId: string,
  chain: WalletChainId = DEFAULT_CHAIN,
): Promise<{ balance: number; city: CityId; chain: WalletChainId; symbol: "BUCKS" }> {
  const held = await bucksHoldings(playerId, chain);
  const ladder: CityId = playerId.startsWith("demo:") ? cityFromBalance(held, bucksThresholds()) : "trenches";
  // A district that is closed right now is never a starting point.
  const city: CityId = CITIES[ladder].tier <= MAX_OPEN_TIER ? ladder : "trenches";
  return { balance: held, city, chain, symbol: "BUCKS" };
}
