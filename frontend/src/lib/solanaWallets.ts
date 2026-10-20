/**
 * Solana wallets injected by browser extensions.
 *
 * Phantom, Solflare and Backpack all expose the same small surface - connect,
 * signMessage, signAndSendTransaction - on their own window property. Reading
 * those directly keeps the bundle free of a wallet-adapter framework for what
 * is three method calls.
 */

export type SolanaProvider = {
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } } | void>;
  disconnect?: () => Promise<void>;
  signMessage: (message: Uint8Array, display?: "utf8" | "hex") => Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction: (tx: unknown, opts?: unknown) => Promise<{ signature: string }>;
};

export type DetectedWallet = {
  id: string;
  name: string;
  icon?: string;
  installed: boolean;
  site: string;
};

const KNOWN: { id: string; name: string; icon?: string; site: string; find: () => SolanaProvider | undefined }[] = [
  {
    id: "phantom",
    name: "Phantom",
    icon: "/images/Phantom-Wallet.png",
    site: "https://phantom.app/download",
    find: () => window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined),
  },
  {
    id: "solflare",
    name: "Solflare",
    site: "https://solflare.com/download",
    find: () => (window.solflare?.isSolflare ? window.solflare : undefined),
  },
  {
    id: "backpack",
    name: "Backpack",
    site: "https://backpack.app/download",
    find: () => window.backpack,
  },
];

export function listSolanaWallets(): DetectedWallet[] {
  const wallets = KNOWN.map((k) => ({
    id: k.id,
    name: k.name,
    icon: k.icon,
    site: k.site,
    installed: Boolean(k.find()),
  }));
  return wallets.sort((a, b) => Number(b.installed) - Number(a.installed));
}

let active: SolanaProvider | null = null;

/** Opens the wallet's approval prompt and returns the address it shares. */
export async function connectSolanaWallet(id: string): Promise<{ provider: SolanaProvider; address: string }> {
  const known = KNOWN.find((k) => k.id === id);
  const provider = known?.find();
  if (!provider) throw new Error(`${known?.name ?? "That wallet"} is not installed.`);
  const result = await provider.connect();
  const key = (result && "publicKey" in result ? result.publicKey : provider.publicKey)?.toString();
  if (!key) throw new Error("The wallet did not share an address.");
  active = provider;
  return { provider, address: key };
}

/**
 * The wallet to pay with. Reconnects silently to a wallet that was approved
 * before, so a page reload does not need another click.
 */
export async function walletFor(address: string): Promise<SolanaProvider | null> {
  if (active?.publicKey?.toString() === address) return active;
  for (const k of KNOWN) {
    const provider = k.find();
    if (!provider) continue;
    try {
      const result = await provider.connect({ onlyIfTrusted: true });
      const key = (result && "publicKey" in result ? result.publicKey : provider.publicKey)?.toString();
      if (key === address) {
        active = provider;
        return provider;
      }
    } catch {
      // Not trusted yet for this site, or a different account is selected.
    }
  }
  return null;
}

/** signMessage returns either `{ signature }` or the bytes, depending on the wallet. */
export async function signWithWallet(provider: SolanaProvider, message: string): Promise<Uint8Array> {
  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  return signed instanceof Uint8Array ? signed : signed.signature;
}

export function forgetWallet() {
  void active?.disconnect?.().catch(() => undefined);
  active = null;
}
