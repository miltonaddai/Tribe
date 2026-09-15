import { Link } from "react-router-dom";
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

export function Header({ solid = false }: { solid?: boolean }) {
  const { wallet, disconnect, openPicker } = useWallet();

  return (
    <header className={`site-header ${solid ? "solid" : ""}`}>
      <Link to="/" className="brand">
        <CubeLogo />
        The Block
      </Link>
      <div className="header-actions">
        <Link to="/docs" className="docs-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 3h8l5 5v13H7z" />
            <path d="M15 3v5h5" />
          </svg>
          Docs
        </Link>
        {wallet ? (
          <button className="btn btn-accent btn-fill" onClick={disconnect} type="button">
            <span className="btn-fill-inner">
              <WalletIcon />
              Connected · {wallet.symbol} · {shorten(wallet.address)}
            </span>
          </button>
        ) : (
          <button className="btn btn-accent btn-fill" onClick={openPicker} type="button">
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
