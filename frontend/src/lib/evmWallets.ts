/**
 * Wallet discovery via EIP-6963. Before this standard every extension raced to
 * own `window.ethereum`, so whoever won got the connection regardless of which
 * wallet the player actually wanted. Wallets now announce themselves and we let
 * the player choose.
 */

export type DetectedWallet = {
  /** rdns where available, otherwise a synthetic id for a legacy provider. */
  id: string;
  name: string;
  icon?: string;
  /** False for a wallet we list but the player has not installed. */
  installed: boolean;
  site?: string;
};

/**
 * The wallets we surface by name, roughly in order of how many people use them.
 * Anything else the browser announces still shows up, listed after these.
 *
 * Local artwork wins over the icon a wallet announces, so the picker looks
 * consistent; MetaMask has no local file and falls back to its own.
 */
const KNOWN_WALLETS: { rdns: string[]; name: string; logo?: string; site: string }[] = [
  { rdns: ["io.metamask", "io.metamask.flask"], name: "MetaMask", site: "https://metamask.io/download/" },
  {
    rdns: ["com.coinbase.wallet"],
    name: "Coinbase Wallet",
    logo: "/images/coinbase-logo.png",
    site: "https://www.coinbase.com/wallet/downloads",
  },
  {
    rdns: ["app.phantom"],
    name: "Phantom",
    logo: "/images/Phantom-Wallet.png",
    site: "https://phantom.app/download",
  },
  {
    rdns: ["io.zerion.wallet"],
    name: "Zerion",
    logo: "/images/Zerion icon.png",
    site: "https://zerion.io/download",
  },
  { rdns: ["app.keplr"], name: "Keplr", site: "https://www.keplr.app/download" },
];

function knownFor(id: string, name: string) {
  const lowerId = id.toLowerCase();
  const lowerName = name.toLowerCase();
  return (
    KNOWN_WALLETS.find((k) => k.rdns.some((r) => r === lowerId)) ??
    KNOWN_WALLETS.find((k) => k.name.toLowerCase() === lowerName)
  );
}

function rankOf(id: string, name: string) {
  const known = knownFor(id, name);
  return known ? KNOWN_WALLETS.indexOf(known) : KNOWN_WALLETS.length;
}

/** What discovery yields, before we merge it with the known-wallet registry. */
type RawInfo = { id: string; name: string; icon?: string };
type Entry = { info: RawInfo; provider: EthereumProvider };

const announced = new Map<string, Entry>();
const listeners = new Set<() => void>();
let listening = false;

function keyFor(info: EIP6963ProviderInfo) {
  return info.rdns || info.uuid;
}

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = event.detail;
    if (!detail?.info || !detail.provider) return;
    const id = keyFor(detail.info);
    const existing = announced.get(id);
    if (existing && existing.provider === detail.provider) return;
    announced.set(id, {
      info: { id, name: detail.info.name, icon: detail.info.icon },
      provider: detail.provider,
    });
    for (const fn of listeners) fn();
  });
  requestAnnouncements();
}

function requestAnnouncements() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** Wallets that predate EIP-6963, so the list is never empty when one exists. */
function legacyEntries(): Entry[] {
  if (typeof window === "undefined") return [];
  const found: Entry[] = [];
  const add = (name: string, provider?: EthereumProvider) => {
    if (!provider?.request) return;
    if (found.some((e) => e.provider === provider)) return;
    found.push({ info: { id: `legacy:${name}`, name }, provider });
  };

  const root = window.ethereum;
  // A multi-wallet extension may stack the real providers in an array.
  for (const p of root?.providers ?? []) {
    add(labelFor(p), p);
  }
  add(labelFor(root), root);
  add("Phantom", window.phantom?.ethereum);
  return found;
}

function labelFor(provider?: EthereumProvider) {
  if (!provider) return "Browser Wallet";
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isPhantom) return "Phantom";
  if (provider.isZerion) return "Zerion";
  return "Browser Wallet";
}

function allEntries(): Entry[] {
  startListening();
  const entries = [...announced.values()];
  const names = new Set(entries.map((e) => e.info.name.toLowerCase()));
  for (const legacy of legacyEntries()) {
    if (!names.has(legacy.info.name.toLowerCase())) entries.push(legacy);
  }
  return entries;
}

export function listEvmWallets(): DetectedWallet[] {
  const entries = allEntries();
  const installed: DetectedWallet[] = entries.map((e) => {
    const known = knownFor(e.info.id, e.info.name);
    return {
      ...e.info,
      name: known?.name ?? e.info.name,
      // Local artwork first, then whatever the wallet announced.
      icon: known?.logo ? encodeURI(known.logo) : e.info.icon,
      installed: true,
      site: known?.site,
    };
  });

  const seen = new Set(installed.map((w) => w.name.toLowerCase()));
  const missing: DetectedWallet[] = KNOWN_WALLETS.filter((k) => !seen.has(k.name.toLowerCase())).map((k) => ({
    id: `install:${k.rdns[0]}`,
    name: k.name,
    icon: k.logo ? encodeURI(k.logo) : undefined,
    installed: false,
    site: k.site,
  }));

  // Popularity order, with anything installed ahead of anything that is not.
  return [...installed, ...missing].sort(
    (a, b) =>
      Number(b.installed) - Number(a.installed) ||
      rankOf(a.id, a.name) - rankOf(b.id, b.name) ||
      a.name.localeCompare(b.name),
  );
}

/** Wallets announce asynchronously, so the list fills in after first paint. */
export function onEvmWalletsChange(listener: () => void) {
  startListening();
  listeners.add(listener);
  requestAnnouncements();
  // A couple of late nudges catch extensions that inject after load.
  const timers = [window.setTimeout(requestAnnouncements, 120), window.setTimeout(requestAnnouncements, 600)];
  return () => {
    listeners.delete(listener);
    timers.forEach((t) => window.clearTimeout(t));
  };
}

let active: EthereumProvider | null = null;

export function activeProvider(): EthereumProvider {
  if (!active) throw new Error("No wallet connected");
  return active;
}

export function selectWallet(id: string): EthereumProvider {
  const entry = allEntries().find((e) => e.info.id === id);
  if (!entry) throw new Error("That wallet is no longer available");
  active = entry.provider;
  return entry.provider;
}

/** For the legacy path, where there is a provider but no announced identity. */
export function setActiveProvider(provider: EthereumProvider) {
  active = provider;
}

export function clearActiveProvider() {
  active = null;
}
