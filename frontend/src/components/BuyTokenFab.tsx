import { useEffect, useRef, useState } from "react";
import { MoonLogo } from "./Header";
import { DEXSCREENER_URL, JUPITER_URL } from "../lib/token";

/**
 * Floating "buy the token" button on the landing page.
 *
 * Collapsed to a single mark until asked: the page sells the game first. Both
 * links are derived from the published mint, so neither can point at a
 * different token than the site names - and until there is a mint, the button
 * is not shown at all rather than linking somewhere unverified.
 */
export function BuyTokenFab() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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

  if (!JUPITER_URL || !DEXSCREENER_URL) return null;

  const links = [
    { href: JUPITER_URL, label: "Jupiter", note: "Swap SOL for $MOON" },
    { href: DEXSCREENER_URL, label: "DexScreener", note: "Chart & liquidity" },
  ];

  return (
    <div className={open ? "buy-fab open" : "buy-fab"} ref={root}>
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
              <strong>{l.label}</strong>
              <span>{l.note}</span>
            </a>
          ))}
        </div>
      )}
      <button
        type="button"
        className="buy-fab-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Hide buy links" : "Buy $MOON"}
        onClick={() => setOpen((v) => !v)}
      >
        <MoonLogo />
        <span>Buy $MOON</span>
      </button>
    </div>
  );
}
