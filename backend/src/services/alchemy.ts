import { cityFromBalance, DEFAULT_CHAIN, type CityId, type WalletChainId } from "@tribe/shared";
import { tributeThresholds } from "./cityThresholds";
import { readTokenBalance, toDisplayUnits } from "./token";
import { CHAIN_RPC } from "./chain";



/**
 * How much $TRIBE a wallet holds, in whole tokens. Read straight from the chain.
 *
 * Nothing stored is added. Under the deposit-float model this also counted an
 * in-game balance, because tokens moved into the game left the wallet. With the
 * allowance model they never leave, so adding a stored figure would double-count
 * - the `tribute` column on characters is a leftover from that design and is not
 * the authority on anything.
 *
 * `demo:<n>` addresses report n tokens, so the dev launcher can exercise every
 * tier without holding anything.
 */
export async function tributeHoldings(address: string, _chain: WalletChainId): Promise<number> {
  if (address.startsWith("demo:")) {
    const n = Number(address.split(":")[1]);
    return Number.isFinite(n) ? n : 0;
  }
  const onChain = await readTokenBalance(address);
  return onChain === null ? 0 : toDisplayUnits(onChain);
}

/**
 * Which district a wallet spawns in. Access is tied to $TRIBE alone - there is
 * no native-balance path. Until TRIBE_TOKEN_ADDRESS is set, on-chain holdings
 * read as zero and everyone lands in Trench; set CITY_MIN_TRIBE_* to 0 locally
 * to work on the upper districts before the token exists.
 */
export async function startingCityForWallet(
  address: string,
  chain: WalletChainId = DEFAULT_CHAIN,
): Promise<{ balance: number; city: CityId; chain: WalletChainId; symbol: "TRIBE" }> {
  const held = await tributeHoldings(address, chain);
  return { balance: held, city: cityFromBalance(held, tributeThresholds()), chain, symbol: "TRIBE" };
}

export function rpcsConfigured() {
  return {
    robinhood: Boolean(CHAIN_RPC),
  };
}
