import { cityFromBalance, DEFAULT_CHAIN, type CharacterRecord, type CityId, type WalletChainId } from "@the-block/shared";
import { ethThresholds } from "./cityThresholds";
import { hydrateCharacter, saveCharacter } from "./storage";
import { activeProvider, clearActiveProvider, selectWallet, setActiveProvider } from "./evmWallets";

const KEY = "the-block:wallet";
const ROBINHOOD_CHAIN_ID = 46630;
const ROBINHOOD_CHAIN_HEX = "0xb626";

export type WalletState = {
  address: string;
  balance: number;
  city: CityId;
  demo: boolean;
  chain: WalletChainId;
  symbol: "ETH";
};

export function loadWallet(): WalletState | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalletState;
    // Older saves may carry a chain that is no longer supported.
    return { ...parsed, chain: DEFAULT_CHAIN, symbol: "ETH" };
  } catch {
    return null;
  }
}

export function saveWallet(state: WalletState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearWallet() {
  localStorage.removeItem(KEY);
}

export function shorten(address: string) {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export async function connectDemo(eth = 0.012): Promise<WalletState> {
  const state: WalletState = {
    address: `demo:${eth}`,
    balance: eth,
    city: cityFromBalance(eth, ethThresholds()),
    demo: true,
    chain: DEFAULT_CHAIN,
    symbol: "ETH",
  };
  saveWallet(state);
  return state;
}

export async function connectChain(chain: WalletChainId = DEFAULT_CHAIN, walletId?: string): Promise<WalletState> {
  const address = await connectRobinhood(walletId);
  const { message, signature } = await signIn(address, chain);
  const verified = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, chain, message, signature }),
  }).then(async (r) => {
    if (!r.ok) throw new Error("Sign-in was rejected");
    return r.json() as Promise<{ balance: number; city: CityId; character?: CharacterRecord | null }>;
  });
  const state: WalletState = {
    address,
    balance: verified.balance,
    city: cityFromBalance(verified.balance, ethThresholds()),
    demo: false,
    chain,
    symbol: "ETH",
  };
  saveWallet(state);
  const existing = hydrateCharacter(verified.character);
  if (existing) saveCharacter({ ...existing, wallet: address }, chain);
  return state;
}

async function connectRobinhood(walletId?: string): Promise<string> {
  // Use the wallet the player picked, not whichever one grabbed window.ethereum.
  const ethereum = walletId ? selectWallet(walletId) : window.ethereum ?? window.phantom?.ethereum;
  if (!ethereum?.request) throw new Error("No EVM wallet found. Install MetaMask, Zerion, Phantom or Coinbase Wallet.");
  setActiveProvider(ethereum);
  await ethereum.request({ method: "eth_requestAccounts" });
  await ensureRobinhoodNetwork(ethereum);
  const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("No EVM account available");
  return address;
}

async function ensureRobinhoodNetwork(ethereum: NonNullable<Window["ethereum"]>) {
  if (await currentChainId(ethereum) === ROBINHOOD_CHAIN_ID) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_CHAIN_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw err;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: ROBINHOOD_CHAIN_HEX,
          chainName: "Robinhood Chain Testnet",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
          blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
        },
      ],
    });
    if (await currentChainId(ethereum) !== ROBINHOOD_CHAIN_ID) {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ROBINHOOD_CHAIN_HEX }],
      });
    }
  }
  if (await currentChainId(ethereum) !== ROBINHOOD_CHAIN_ID) {
    throw new Error("Switch to Robinhood Chain Testnet to continue");
  }
}

function currentChainId(ethereum: NonNullable<Window["ethereum"]>) {
  return ethereum.request({ method: "eth_chainId" }).then((value) => {
    const raw = String(value).trim().toLowerCase();
    return raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number.parseInt(raw, 10);
  });
}

async function signIn(address: string, chain: WalletChainId) {
  const origin = window.location.origin;
  const issued = await fetch(
    `/api/auth/nonce?address=${encodeURIComponent(address)}&chain=${chain}&origin=${encodeURIComponent(origin)}`,
  ).then((r) => r.json() as Promise<{ message: string }>);
  if (!issued.message) throw new Error("Could not start sign-in");
  const signature = await signEvm(address, issued.message);
  return { message: issued.message, signature };
}

async function signEvm(address: string, message: string) {
  const ethereum = activeProvider();
  return (await ethereum.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
}

/** EVM wallets have no disconnect call; we just forget which one was in use. */
export async function disconnectWallets() {
  clearActiveProvider();
}
