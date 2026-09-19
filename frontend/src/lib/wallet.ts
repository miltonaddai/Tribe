import { cityFromBalance, DEFAULT_CHAIN, type CharacterRecord, type CityId, type WalletChainId } from "@tribe/shared";
import { apiJson, apiUrl, assertJson } from "./api";
import { tributeThresholds } from "./cityThresholds";
import { CHAIN_EXPLORER, CHAIN_ID, CHAIN_ID_HEX, CHAIN_NAME, CHAIN_RPC } from "./chain";
import { hydrateCharacter, saveCharacter } from "./storage";
import { activeProvider, clearActiveProvider, selectWallet, setActiveProvider } from "./evmWallets";

const KEY = "tribe:wallet";


export type WalletState = {
  address: string;
  balance: number;
  city: CityId;
  demo: boolean;
  chain: WalletChainId;
  /** What `balance` counts: TRIBE once the token gates districts, ETH before. */
  symbol: "TRIBE";
};

export function loadWallet(): WalletState | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalletState;
    // Older saves may carry a chain that is no longer supported.
    return { ...parsed, chain: DEFAULT_CHAIN, symbol: "TRIBE" };
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

/** `held` is $TRIBE, matching the demo:<n> holdings the server reads back. */
export async function connectDemo(held = 150_000): Promise<WalletState> {
  const state: WalletState = {
    address: `demo:${held}`,
    balance: held,
    city: cityFromBalance(held, tributeThresholds()),
    demo: true,
    chain: DEFAULT_CHAIN,
    symbol: "TRIBE",
  };
  saveWallet(state);
  return state;
}

export async function connectChain(chain: WalletChainId = DEFAULT_CHAIN, walletId?: string): Promise<WalletState> {
  const address = await connectRobinhood(walletId);
  const { message, signature } = await signIn(address, chain);
  const verified = await fetch(apiUrl("/api/auth/verify"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, chain, message, signature }),
  }).then(async (r) => {
    // Content type first: a 200 of HTML is the site answering, not a rejection.
    assertJson(r);
    if (!r.ok) throw new Error("Sign-in was rejected");
    return r.json() as Promise<{
      balance: number;
      city: CityId;
      symbol?: "TRIBE";
      character?: CharacterRecord | null;
    }>;
  });
  const state: WalletState = {
    address,
    balance: verified.balance,
    // Take the server's answer rather than recomputing it. The gate depends on
    // the $TRIBE balance and thresholds the server holds, and the room enforces
    // it again on join, so a second local calculation could only disagree.
    city: verified.city,
    demo: false,
    chain,
    symbol: verified.symbol ?? "TRIBE",
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
  if (await currentChainId(ethereum) === CHAIN_ID) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw err;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: CHAIN_NAME,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [CHAIN_RPC],
          blockExplorerUrls: [CHAIN_EXPLORER],
        },
      ],
    });
    if (await currentChainId(ethereum) !== CHAIN_ID) {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    }
  }
  if (await currentChainId(ethereum) !== CHAIN_ID) {
    throw new Error(`Switch to ${CHAIN_NAME} to continue`);
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
  const issued = await apiJson<{ message: string }>(
    `/api/auth/nonce?address=${encodeURIComponent(address)}&chain=${chain}&origin=${encodeURIComponent(origin)}`,
  );
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
