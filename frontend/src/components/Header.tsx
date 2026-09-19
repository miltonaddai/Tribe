import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../state/WalletStore";
import { shorten } from "../lib/wallet";

export function CubeLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M6 12 L16 7 L26 12 L16 17 Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 12 L6 21 L16 26 L16 17" stroke="currentColor" strokeWidth="1.7" />
      <path d="M26 12 L26 21 L16 26" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a1 1 0 0 1 1 1v1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="14" r="1.25" fill="currentColor" />
    </svg>
  );
}

/** Three bars, or a cross once the menu is open. */
function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      {open ? (
        <>
          <path d="M6 6 L18 18" />
          <path d="M18 6 L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function Header({ solid = false }: { solid?: boolean }) {
  const { wallet, disconnect, openPicker } = useWallet();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const root = useRef<HTMLElement>(null);

  // Navigating is a decision; the menu has served its purpose by then.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Reaching for a wider window is as much a dismissal as tapping away: the
    // panel is a mobile affordance and has no meaning once the bar fits.
    const onResize = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header className={`site-header ${solid ? "solid" : ""}`} ref={root}>
      <Link to="/" className="brand">
        <CubeLogo />
        Tribe
      </Link>

      <button
        type="button"
        className="header-burger"
        aria-expanded={open}
        aria-controls="header-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <BurgerIcon open={open} />
      </button>

      <div className={open ? "header-actions open" : "header-actions"} id="header-menu">
        <Link to="/docs" className="docs-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 3h8l5 5v13H7z" />
            <path d="M15 3v5h5" />
          </svg>
          Docs
        </Link>
        {wallet ? (
          <button
            className="btn btn-accent btn-fill"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            type="button"
          >
            <span className="btn-fill-inner">
              <WalletIcon />
              {/* The full label needs room the phone bar does not have, so the
                  narrow layout keeps the address and drops the prose. */}
              <span className="wallet-label-full">Connected · {wallet.symbol} · {shorten(wallet.address)}</span>
              <span className="wallet-label-short">{shorten(wallet.address)}</span>
            </span>
          </button>
        ) : (
          <button
            className="btn btn-accent btn-fill"
            onClick={() => {
              setOpen(false);
              openPicker();
            }}
            type="button"
          >
            <span className="btn-fill-inner">
              <WalletIcon />
              Connect Wallet
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
