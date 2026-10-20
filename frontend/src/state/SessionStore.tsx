import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listSolanaWallets, type DetectedWallet } from "../lib/solanaWallets";
import { clearSession, linkWallet, loadSession, refreshSession, unlinkWallet, type Session } from "../lib/session";
import { CHAIN_NAME } from "../lib/chain";

/** Why the dialog opened: from the menu, or because a purchase needs a wallet. */
export type LinkReason = "menu" | "purchase";

type Ctx = {
  session: Session | null;
  setSession: (s: Session | null) => void;
  signOut: () => void;
  /**
   * Opens the "link a Solana wallet" dialog. Resolves true once a wallet is
   * linked, false if the dialog is closed first - so a purchase can wait on it
   * and carry on. Only meaningful when signed in.
   */
  openLink: (reason?: LinkReason) => Promise<boolean>;
  /** True while that dialog is open, so the game can hand back the cursor. */
  linkOpen: boolean;
  unlink: () => Promise<void>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkReason, setLinkReason] = useState<LinkReason>("menu");
  // Whoever is waiting on the open dialog. Settled exactly once, on link or close.
  const linkWaiter = useRef<((linked: boolean) => void) | null>(null);
  const settleLink = (linked: boolean) => {
    linkWaiter.current?.(linked);
    linkWaiter.current = null;
  };

  // Once per visit: a fresh token, the linked wallet, current holdings. A token
  // the server no longer accepts signs the player out here rather than failing
  // later at the game's door.
  useEffect(() => {
    if (!session || session.demo) return;
    void refreshSession().then((next) => setSession(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      setSession,
      signOut: () => {
        clearSession();
        setSession(null);
      },
      openLink: (reason: LinkReason = "menu") =>
        new Promise<boolean>((resolve) => {
          setLinkReason(reason === "purchase" ? "purchase" : "menu");
          // A second request replaces the first; the first is told it lost.
          linkWaiter.current?.(false);
          linkWaiter.current = resolve;
          setLinkOpen(true);
        }),
      linkOpen,
      unlink: async () => setSession(await unlinkWallet()),
    }),
    [session, linkOpen],
  );

  return (
    <SessionCtx.Provider value={value}>
      {children}
      {linkOpen && (
        <LinkWalletDialog
          reason={linkReason}
          onClose={() => {
            setLinkOpen(false);
            settleLink(false);
          }}
          onLinked={(next) => {
            setSession(next);
            setLinkOpen(false);
            settleLink(true);
          }}
        />
      )}
    </SessionCtx.Provider>
  );
}

function LinkWalletDialog({
  reason,
  onClose,
  onLinked,
}: {
  reason: LinkReason;
  onClose: () => void;
  onLinked: (s: Session) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function link(id: string) {
    setBusy(id);
    setError(null);
    try {
      onLinked(await linkWallet(id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not link the wallet.";
      setError(walletErrorText(message));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-scrim" onClick={() => !busy && onClose()} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="link-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{reason === "purchase" ? "To pay" : "Optional"}</p>
            <h2 id="link-title">Link a {CHAIN_NAME} wallet</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={Boolean(busy)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="modal-lede">
          {reason === "purchase"
            ? "Purchases are paid in $MOON from your own wallet. Link one now and your purchase carries on - you sign one message to prove the wallet is yours, and nothing is sent until you approve the payment."
            : "You can play without one. Linking a wallet lets you buy items, cars and homes with $MOON - and a home is the key to the next district up. You sign one message to prove the wallet is yours; nothing is sent."}
        </p>
        <WalletList busy={busy} onPick={(id) => void link(id)} />
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}

/** A wallet's own "you cancelled" reads as an error otherwise. */
export function walletErrorText(message: string) {
  return /reject|cancel|denied|declined/i.test(message) ? "Cancelled in the wallet." : message;
}

/**
 * The Solana wallets this browser has, installed ones first, with install
 * links for the rest. Shared by wallet linking and wallet sign-in.
 */
export function WalletList({ busy, onPick }: { busy: string | null; onPick: (id: string) => void }) {
  const [wallets, setWallets] = useState<DetectedWallet[]>(() => listSolanaWallets());

  // Extensions inject after load, so look again shortly after showing.
  useEffect(() => {
    const t = window.setTimeout(() => setWallets(listSolanaWallets()), 400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="wallet-list">
      {wallets.map((w) =>
        w.installed ? (
          <button key={w.id} type="button" className="wallet-row" disabled={Boolean(busy)} onClick={() => onPick(w.id)}>
            <WalletGlyph name={w.name} icon={w.icon} />
            <span className="wallet-row-copy">
              <strong>{w.name}</strong>
              <span>{busy === w.id ? "Check your wallet…" : "Detected"}</span>
            </span>
            <span className="wallet-row-go" aria-hidden>
              →
            </span>
          </button>
        ) : (
          <a key={w.id} className="wallet-row missing" href={w.site} target="_blank" rel="noreferrer noopener">
            <WalletGlyph name={w.name} icon={w.icon} />
            <span className="wallet-row-copy">
              <strong>{w.name}</strong>
              <span>Not installed · Get it</span>
            </span>
            <span className="wallet-row-go" aria-hidden>
              ↗
            </span>
          </a>
        ),
      )}
    </div>
  );
}

function WalletGlyph({ name, icon }: { name: string; icon?: string }) {
  if (icon) return <img className="wallet-glyph" src={icon} alt="" width={36} height={36} />;
  return (
    <span className="wallet-glyph wallet-glyph-letter" aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("SessionProvider missing");
  return ctx;
}
