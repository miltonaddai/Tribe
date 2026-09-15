import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_CHAIN, type WalletChainId } from "@the-block/shared";
import { listEvmWallets, onEvmWalletsChange, type DetectedWallet } from "../lib/evmWallets";
import { loadCharacterForWallet } from "../lib/storage";
import { clearWallet, connectChain, disconnectWallets, loadWallet, type WalletState } from "../lib/wallet";

type Ctx = {
  wallet: WalletState | null;
  setWallet: (w: WalletState | null) => void;
  disconnect: () => void;
  pickerOpen: boolean;
  connecting: string | null;
  error: string | null;
  openPicker: () => void;
  closePicker: () => void;
  connect: (walletId?: string) => Promise<WalletState | null>;
};

const WalletCtx = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [wallet, setWallet] = useState<WalletState | null>(() => loadWallet());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      wallet,
      setWallet,
      pickerOpen,
      connecting,
      error,
      openPicker: () => {
        setError(null);
        setPickerOpen(true);
      },
      closePicker: () => {
        if (!connecting) setPickerOpen(false);
      },
      connect: async (walletId?: string) => {
        setConnecting(walletId ?? "default");
        setError(null);
        try {
          const chain: WalletChainId = DEFAULT_CHAIN;
          const next = await connectChain(chain, walletId);
          setWallet(next);
          setPickerOpen(false);
          nav(loadCharacterForWallet(next.address, next.chain) ? "/play" : "/create");
          return next;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not connect wallet");
          return null;
        } finally {
          setConnecting(null);
        }
      },
      disconnect: () => {
        clearWallet();
        setWallet(null);
        void disconnectWallets();
      },
    }),
    [wallet, pickerOpen, connecting, error, nav],
  );

  return (
    <WalletCtx.Provider value={value}>
      {children}
      {pickerOpen && <WalletPicker />}
    </WalletCtx.Provider>
  );
}

function WalletPicker() {
  const { closePicker, connect, connecting, error } = useWallet();
  const [wallets, setWallets] = useState<DetectedWallet[]>(() => listEvmWallets());

  useEffect(() => {
    const refresh = () => setWallets(listEvmWallets());
    refresh();
    return onEvmWalletsChange(refresh);
  }, []);

  return (
    <div className="wallet-overlay" onClick={closePicker} role="presentation">
      <div
        className="wallet-modal"
        role="dialog"
        aria-labelledby="wallet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wallet-modal-head">
          <div>
            <p className="wallet-kicker">SIGN IN</p>
            <h2 id="wallet-title">Choose a wallet</h2>
          </div>
          <button type="button" onClick={closePicker} aria-label="Close" disabled={Boolean(connecting)}>
            ✕
          </button>
        </div>

        <p className="wallet-lede">
          Approve the connection and sign the message. You will be switched to Robinhood Chain Testnet
          automatically.
        </p>

        <div className="wallet-options">
          {wallets.map((w) =>
            w.installed ? (
              <button
                key={w.id}
                type="button"
                className="wallet-option wallet-option-row"
                disabled={Boolean(connecting)}
                onClick={() => void connect(w.id)}
              >
                <WalletGlyph name={w.name} icon={w.icon} />
                <span className="wallet-option-copy">
                  <strong>{w.name}</strong>
                  <span>{connecting === w.id ? "Check your wallet…" : "Robinhood Chain Testnet"}</span>
                </span>
              </button>
            ) : (
              <a
                key={w.id}
                className="wallet-option wallet-option-row wallet-option-missing"
                href={w.site}
                target="_blank"
                rel="noreferrer noopener"
              >
                <WalletGlyph name={w.name} icon={w.icon} />
                <span className="wallet-option-copy">
                  <strong>{w.name}</strong>
                  <span>Not installed · Get it</span>
                </span>
              </a>
            ),
          )}
        </div>
        {error && <p className="wallet-error">{error}</p>}
      </div>
    </div>
  );
}

function WalletGlyph({ name, icon }: { name: string; icon?: string }) {
  // Local artwork arrives as a /images path; announced icons as a data URI.
  if (icon && (icon.startsWith("data:image/") || icon.startsWith("/"))) {
    return <img className="wallet-icon" src={icon} alt="" width={36} height={36} />;
  }
  return (
    <span className="wallet-icon wallet-icon-fallback" aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("WalletProvider missing");
  return ctx;
}
