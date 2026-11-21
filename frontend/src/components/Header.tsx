import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CURRENCY } from "@block/shared";
import { useSession } from "../state/SessionStore";
import { loadCharacterForWallet } from "../lib/storage";

/** The Block mark. Decorative: every use sits beside the name or a label. */
export function BrandLogo() {
  return <img className="brand-logo" src="/logo.svg" alt="" aria-hidden draggable={false} />;
}

/** Three bars, or a cross once the menu is open. */
function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      {open ? <path d="M6 6 L18 18 M18 6 L6 18" /> : <path d="M4 7h16 M4 12h16 M4 17h16" />}
    </svg>
  );
}

/** Where "Play" goes: the game if there is a character, otherwise the next step to one. */
export function usePlayTarget() {
  const { session } = useSession();
  if (!session) return "/login";
  return loadCharacterForWallet(session.playerId, session.chain) ? "/play" : "/create";
}

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#districts", label: "Districts" },
  { href: "/#features", label: "Features" },
  { href: "/#bucks", label: CURRENCY },
];

export function Header({ solid = false }: { solid?: boolean }) {
  const { session, signOut } = useSession();
  const nav = useNavigate();
  const playTarget = usePlayTarget();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [pathname]);

  // The landing page scrolls inside its own container, not the window, so the
  // header listens on whichever element is actually scrolling.
  useEffect(() => {
    const scroller = root.current?.closest(".page-scroll") ?? window;
    const onScroll = () => {
      const top = scroller instanceof Window ? scroller.scrollY : (scroller as HTMLElement).scrollTop;
      setScrolled(top > 12);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open && !menu) return;
    const close = () => {
      setOpen(false);
      setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
    };
  }, [open, menu]);

  const cls = ["nav", solid || scrolled ? "nav-solid" : "", open ? "nav-open" : ""].filter(Boolean).join(" ");

  return (
    <header className={cls} ref={root}>
      <div className="nav-inner">
        <Link to="/" className="nav-brand" aria-label="Block home">
          <span className="nav-logo">
            <BrandLogo />
          </span>
          Block
        </Link>

        <nav className="nav-links" id="nav-menu" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              onClick={(e) => {
                setOpen(false);
                // Already on the landing page: scroll rather than navigate, so a
                // second click on the same link still goes somewhere.
                const target = pathname === "/" && document.getElementById(l.href.split("#")[1]);
                if (target) {
                  e.preventDefault();
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            >
              {l.label}
            </Link>
          ))}
          <Link to="/docs" className={pathname.startsWith("/docs") ? "active" : ""}>
            Docs
          </Link>
        </nav>

        <div className="nav-actions">
          {session ? (
            <div className="account">
              <button
                type="button"
                className="account-btn"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
              >
                <span className="account-avatar" aria-hidden>
                  {session.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="account-name">{session.username}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {menu && (
                <div className="account-menu" role="menu">
                  <div className="account-menu-head">
                    <strong>{session.username}</strong>
                    <span>Offline sandbox · {CURRENCY}</span>
                  </div>
                  <button type="button" role="menuitem" onClick={() => nav(playTarget)}>
                    Play now
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setMenu(false);
                      signOut();
                      nav("/");
                    }}
                  >
                    Switch player
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn-ghost btn-sm nav-signin">
              Pick a name
            </Link>
          )}
          <Link to={playTarget} className="btn btn-accent btn-sm">
            {session ? "Play" : "Play free"}
          </Link>
          <button
            type="button"
            className="nav-burger"
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <BurgerIcon open={open} />
          </button>
        </div>
      </div>
    </header>
  );
}
