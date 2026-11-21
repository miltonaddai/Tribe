import { Link } from "react-router-dom";
import { CURRENCY, PROPERTY_MARKET_OPEN } from "@tribe/shared";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-brand">
          <Link to="/" className="nav-brand">
            Tribe
          </Link>
          <p>A browser city built block by block. Free to play, owned by the people living in it.</p>
        </div>
        <nav className="foot-col" aria-label="Game">
          <span className="foot-label">Game</span>
          <Link to="/login">Play free</Link>
          <Link to="/docs">How to play</Link>
          <Link to="/docs/cities">Districts</Link>
          <Link to="/docs/market">{PROPERTY_MARKET_OPEN ? "Marketplace" : "Shopping"}</Link>
        </nav>
        <nav className="foot-col" aria-label="Economy">
          <span className="foot-label">Economy</span>
          <Link to="/docs/access">Unlocking districts</Link>
          <Link to="/docs/wallets">Profiles &amp; {CURRENCY}</Link>
        </nav>
        <nav className="foot-col" aria-label="Project">
          <span className="foot-label">Project</span>
          <span>Open source · MIT License</span>
        </nav>
      </div>
      <div className="foot-base">
        <span>© {new Date().getFullYear()} Tribe · MIT License</span>
        <span>Built for the browser</span>
      </div>
    </footer>
  );
}
