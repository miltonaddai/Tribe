import { cityFromBalance, DEFAULT_CHAIN, type CityId, type WalletChainId } from "@moonville/shared";
import { moonThresholds } from "./cityThresholds";
import { readTokenBalance, toDisplayUnits } from "./token";
import { SOLANA_RPC } from "./chain";
import { linkedWallet } from "./accounts";

/**
 * How much $MOON a player holds, in whole tokens, read straight from the chain.
 *
 * A player is an account; what they hold is whatever their linked Solana wallet
 * holds. No linked wallet reads as zero, which is Trenches - the game is fully
 * playable there, and linking a wallet is how you climb.
 *
 * `demo:<n>` ids report n tokens, so the dev launcher can exercise every tier
 * without holding anything.
 */
export async function moonHoldings(playerId: string, _chain: WalletChainId): Promise<number> {
  if (playerId.startsWith("demo:")) {
    const n = Number(playerId.split(":")[1]);
    return Number.isFinite(n) ? n : 0;
  }
  const wallet = await linkedWallet(playerId);
  if (!wallet) return 0;
  const onChain = await readTokenBalance(wallet);
  return onChain === null ? 0 : toDisplayUnits(onChain);
}

/**
 * A player's holdings, and the district a fresh session starts from.
 *
 * Districts are opened by owning homes (see homeAccessTier), not by $MOON held,
 * so the starting district is always the Trenches. A returning player is put
 * back where they last stood by the room itself, which knows their homes.
 * `demo:<n>` ids keep the old balance ladder so the dev launcher can reach
 * every district.
 */
export async function startingCityForWallet(
  playerId: string,
  chain: WalletChainId = DEFAULT_CHAIN,
): Promise<{ balance: number; city: CityId; chain: WalletChainId; symbol: "MOON" }> {
  const held = await moonHoldings(playerId, chain);
  const city: CityId = playerId.startsWith("demo:") ? cityFromBalance(held, moonThresholds()) : "trenches";
  return { balance: held, city, chain, symbol: "MOON" };
}

export function rpcsConfigured() {
  return {
    solana: Boolean(SOLANA_RPC),
  };
}
