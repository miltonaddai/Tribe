import { useState } from "react";
import { Link } from "react-router-dom";
import { CHAIN_EXPLORER, CHAIN_NAME } from "../lib/chain";
import { TRIBE_CONTRACT } from "../lib/token";

/**
 * The quiet strip at the bottom of the landing page.
 *
 * Deliberately understated: it exists so the things people look for before
 * trusting a token - the contract, who is behind it, the terms - are one glance
 * away, not so it competes with the hero.
 */

/**
 * Where the X account lives. Configuration rather than a constant, because a
 * hardcoded guess at a handle is a broken link on a live landing page, and the
 * icon is simply left out until it is set.
 */
const X_URL = (import.meta.env.VITE_X_URL as string | undefined)?.trim();

/** 0x1234…cDeF — long enough to check against a listing, short enough to read. */
function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function SiteFooter({ className = "" }: { className?: string } = {}) {
  const address = TRIBE_CONTRACT;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(address).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };

  return (
    <footer className={className ? `site-footer ${className}` : "site-footer"}>
      <div className="site-footer-inner">
        <span className="footer-mark">TRIBE</span>

        <span className="footer-ca">
          <span className="footer-ca-label">CA</span>
          <button
            type="button"
            className="footer-ca-value"
            onClick={copy}
            title={`${address} · click to copy`}
          >
            {copied ? "Copied" : short(address)}
          </button>
          {CHAIN_EXPLORER && (
            <a
              className="footer-ca-link"
              href={`${CHAIN_EXPLORER.replace(/\/$/, "")}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`View on ${CHAIN_NAME} explorer`}
            >
              ↗
            </a>
          )}
        </span>

        <nav className="footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Use</Link>
          {X_URL && (
            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Tribe on X"
              className="footer-x"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
