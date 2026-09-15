import { cityFromBalance, DEFAULT_CHAIN, type CityId, type WalletChainId } from "@the-block/shared";
import { thresholdsForChain } from "./cityThresholds";

const ROBINHOOD_RPC =
  process.env.ROBINHOOD_TESTNET_RPC ||
  process.env.ALCHEMY_ROBINHOOD_URL ||
  "https://rpc.testnet.chain.robinhood.com";

export async function fetchNativeBalance(address: string, _chain: WalletChainId): Promise<number> {
  if (address.startsWith("demo:")) {
    const n = Number(address.split(":")[1]);
    if (!Number.isNaN(n)) return n;
  }
  return fetchEthBalance(address);
}

async function fetchEthBalance(address: string): Promise<number> {
  if (address && !address.startsWith("demo:")) {
    try {
      const res = await fetch(ROBINHOOD_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      });
      const json = (await res.json()) as { result?: string };
      const wei = BigInt(json.result ?? "0x0");
      return Number(wei) / 1e18;
    } catch (err) {
      console.warn("[wallet] Robinhood testnet balance lookup failed", err);
    }
  }
  return hashedFallback(address);
}

function hashedFallback(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return (hash % 180) / 10;
}

export async function startingCityForWallet(
  address: string,
  chain: WalletChainId = DEFAULT_CHAIN,
): Promise<{ balance: number; city: CityId; chain: WalletChainId }> {
  const balance = await fetchNativeBalance(address, chain);
  return { balance, city: cityFromBalance(balance, thresholdsForChain(chain)), chain };
}

export function rpcsConfigured() {
  return {
    robinhoodTestnet: Boolean(ROBINHOOD_RPC),
  };
}
