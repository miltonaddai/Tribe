import { useEffect, useRef, useState } from "react";
import { CubeLogo } from "./Header";
import { tokenConfig } from "../lib/payments";

/**
 * Floating "buy the token" button on the landing page.
 *
 * Collapsed to a single mark until asked: the landing page is meant to sell the
 * game first, and a row of exchange links across the hero reads as a token
 * launch with a game attached rather than the other way round.
 *
 * Both destinations are configurable. DexScreener can be derived from the
 * contract address on its own - its search URL takes any address on any chain -
 * so it works with no configuration at all. Pons cannot be derived, so it is
 * env-only and simply absent until set, because a guessed swap URL on a live
 * page sends people somewhere wrong while trying to spend money.
 */

const PONS_URL = (import.meta.env.VITE_PONS_URL as string | undefined)?.trim();
const DEX_URL = (import.meta.env.VITE_DEXSCREENER_URL as string | undefined)?.trim();

export function BuyTokenFab() {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void tokenConfig().then((cfg) => {
      if (live && cfg?.address) setAddress(cfg.address);
    });
    return () => {
      live = false;
    };
  }, []);

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

  // Search rather than a pair URL: it resolves from the address alone, so it
  // keeps working before a pair exists and on a chain whose slug we do not know.
  const dex = DEX_URL || (address ? `https://dexscreener.com/search?q=${address}` : null);
  const links = [
    dex && { href: dex, label: "DexScreener", note: "Chart & liquidity" },
    PONS_URL && { href: PONS_URL, label: "Pons", note: "Swap for $TRIBE" },
  ].filter(Boolean) as { href: string; label: string; note: string }[];

  if (links.length === 0) return null;

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
