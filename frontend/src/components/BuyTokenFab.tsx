import { useEffect, useRef, useState } from "react";
import { CubeLogo } from "./Header";
import { DEXSCREENER_URL, PONS_URL } from "../lib/token";

/**
 * Floating "buy the token" button on the landing page.
 *
 * Collapsed to a single mark until asked: the landing page is meant to sell the
 * game first, and a row of exchange links across the hero reads as a token
 * launch with a game attached rather than the other way round.
 *
 * Both destinations are built from the published contract address, so neither
 * can point at a different token than the site names, and neither waits on the
 * server or a deploy setting. These are links people follow in order to spend
 * money; a missing env var should not be able to quietly remove them.
 */

export function BuyTokenFab() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close on Escape or a click elsewhere: a panel that can only be dismissed by
  // hitting the same small circle again is a panel people leave open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const links = [
    { href: PONS_URL, label: "Pons", note: "Swap for $TRIBE" },
    { href: DEXSCREENER_URL, label: "DexScreener", note: "Chart & liquidity" },
  ];

  return (
    <div className={open ? "buy-fab open" : "buy-fab"} ref={root}>
      {/* Rendered conditionally rather than hidden with the attribute: this
          element is display:flex, which overrides [hidden]'s display:none, so
          the panel stayed on screen while believing it was closed. */}
      {open && (
        <div className="buy-fab-menu" role="menu">
          {links.map((l) => (
            <a
              key={l.label}
              className="buy-fab-link"
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="buy-fab-link-name">{l.label}</span>
              <span className="buy-fab-link-note">{l.note}</span>
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        className="buy-fab-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Hide buy links" : "Buy $TRIBE"}
        title="Buy $TRIBE"
        onClick={() => setOpen((v) => !v)}
      >
        <CubeLogo />
      </button>
    </div>
  );
}
