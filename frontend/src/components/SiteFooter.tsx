import { useState } from "react";
import { Link } from "react-router-dom";
import { CHAIN_NAME, SOLANA_EXPLORER } from "../lib/chain";
import { MOON_MINT } from "../lib/token";
import { MoonLogo } from "./Header";

/**
 * Where the X account lives. Configuration rather than a constant, because a
 * guessed handle is a broken link on a live page; the icon is left out until set.
 */
const X_URL = (import.meta.env.VITE_X_URL as string | undefined)?.trim();

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** The mint, copyable, or an honest "coming soon" until $MOON is live on Solana. */
export function MintAddress() {
  const [copied, setCopied] = useState(false);
  if (!MOON_MINT) return <span className="mint mint-soon">Coming soon on {CHAIN_NAME}</span>;
  const mint = MOON_MINT;
  const copy = () => {
    void navigator.clipboard?.writeText(mint).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };
  return (
    <span className="mint">
      <button type="button" className="mint-value" onClick={copy} title={`${mint} · click to copy`}>
        {copied ? "Copied" : short(mint)}
      </button>
      <a
        className="mint-link"
        href={`${SOLANA_EXPLORER.replace(/\/$/, "")}/token/${mint}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`View on ${CHAIN_NAME} explorer`}
      >
        ↗
      </a>
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-brand">
          <Link to="/" className="nav-brand">
            <span className="nav-logo">
              <MoonLogo />
            </span>
            Moonville
          </Link>
          <p>A browser city built block by block. Free to play, owned by the people living in it.</p>
          <div className="foot-mint">
            <span className="foot-label">$MOON mint</span>
            <MintAddress />
          </div>
        </div>
        <nav className="foot-col" aria-label="Game">
          <span className="foot-label">Game</span>
          <Link to="/login">Play free</Link>
          <Link to="/docs">How to play</Link>
          <Link to="/docs/cities">Districts</Link>
          <Link to="/docs/market">Marketplace</Link>
        </nav>
        <nav className="foot-col" aria-label="Token">
          <span className="foot-label">Token</span>
          <Link to="/docs/access">Unlocking districts</Link>
          <Link to="/docs/token">Official addresses</Link>
          <Link to="/docs/wallets">Linking a wallet</Link>
        </nav>
        <nav className="foot-col" aria-label="Legal">
          <span className="foot-label">Legal</span>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Use</Link>
          {X_URL && (
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="foot-x">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Follow on X
            </a>
          )}
        </nav>
      </div>
      <div className="foot-base">
        <span>© {new Date().getFullYear()} Moonville</span>
        <span>Built for the browser · Runs on {CHAIN_NAME}</span>
      </div>
    </footer>
  );
}
