/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COLYSEUS_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_DEV_TOOLS: string;
  readonly VITE_SOLANA_CLUSTER: string;
  readonly VITE_SOLANA_RPC: string;
  readonly VITE_SOLANA_EXPLORER: string;
  readonly VITE_MOON_MINT: string;
  readonly VITE_MOON_DEV_WALLET: string;
  readonly VITE_CITY_MIN_MOON_TRENCHES: string;
  readonly VITE_CITY_MIN_MOON_BAGTOWN: string;
  readonly VITE_CITY_MIN_MOON_MIDTOWN: string;
  readonly VITE_CITY_MIN_MOON_UPTOWN: string;
}

interface Window {
  phantom?: { solana?: import("./lib/solanaWallets").SolanaProvider };
  solana?: import("./lib/solanaWallets").SolanaProvider & { isPhantom?: boolean };
  solflare?: import("./lib/solanaWallets").SolanaProvider & { isSolflare?: boolean };
  backpack?: import("./lib/solanaWallets").SolanaProvider;
}
