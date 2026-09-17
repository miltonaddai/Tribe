/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COLYSEUS_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_DEV_TOOLS: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_CHAIN_NAME: string;
  readonly VITE_CHAIN_RPC: string;
  readonly VITE_CHAIN_EXPLORER: string;
  readonly VITE_CITY_MIN_TRIBE_TRENCH: string;
  readonly VITE_CITY_MIN_TRIBE_GAS: string;
  readonly VITE_CITY_MIN_TRIBE_REALWORLD: string;
  readonly VITE_CITY_MIN_TRIBE_VALHALLA: string;
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  /** Some multi-wallet extensions stack every injected provider here. */
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  isZerion?: boolean;
};

/** EIP-6963: wallets announce themselves instead of fighting over window.ethereum. */
type EIP6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

type EIP6963ProviderDetail = {
  info: EIP6963ProviderInfo;
  provider: EthereumProvider;
};

interface WindowEventMap {
  "eip6963:announceProvider": CustomEvent<EIP6963ProviderDetail>;
}

interface Window {
  ethereum?: EthereumProvider;
  phantom?: {
    ethereum?: EthereumProvider;
  };
}
