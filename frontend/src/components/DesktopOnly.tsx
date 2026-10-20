import { Link } from "react-router-dom";
import { MoonLogo } from "./Header";
import { MIN_PLAY_WIDTH, type Blocked } from "../lib/device";

/**
 * Shown instead of the game on a device that cannot play it.
 *
 * Says what is needed and why, then offers somewhere else to go. A dead end
 * that only refuses is a visitor lost; the docs are readable on a phone and are
 * the right thing to be doing until they are at a desk.
 */
export function DesktopOnly({ reason }: { reason: Blocked }) {
  const narrow = reason === "narrow";

  return (
    <div className="desktop-only">
      <div className="desktop-only-card">
        <span className="desktop-only-mark">
          <MoonLogo />
        </span>

        <h1>{narrow ? "Your window is too narrow" : "Moonville needs a desktop"}</h1>

        <p>
          {narrow ? (
            <>
              The game needs at least {MIN_PLAY_WIDTH}px of width — below that the HUD covers the city.
              Widen the window and it will start on its own.
            </>
          ) : (
            <>
              The city runs on a keyboard and mouse: WASD to walk, right-drag to look around, and a
              pointer to aim. There is no touch equivalent yet, so a phone or tablet would leave you
              standing still.
            </>
          )}
        </p>

        {!narrow && (
          <p className="desktop-only-sub">
            Open <strong>Moonville</strong> on a laptop or desktop and sign in - your character and
            everything you own will be exactly where you left them.
          </p>
        )}

        <div className="desktop-only-actions">
          <Link className="btn btn-accent btn-fill" to="/docs">
            <span className="btn-fill-inner">Read the docs</span>
          </Link>
          <Link className="btn btn-outline" to="/">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
