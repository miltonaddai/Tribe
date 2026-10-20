import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { CITIES, CITY_ORDER, CURRENCY, HOME_PRICE, unlockingCity } from "@moonville/shared";
import { Header, usePlayTarget } from "../components/Header";
import { MintAddress, SiteFooter } from "../components/SiteFooter";
import { BuyTokenFab } from "../components/BuyTokenFab";
import { useSession } from "../state/SessionStore";
import { CHAIN_NAME } from "../lib/chain";
import { CA_IS_PLACEHOLDER, DISPLAY_CA } from "../lib/token";
import { apiUrl } from "../lib/api";

const CITY_SHOTS: Record<string, string> = {
  trenches: "trenches.png",
  bagtown: "bagtown.png",
  midtown: "midtown.png",
  uptown: "uptown.png",
};

const n = (v: number) => v.toLocaleString();

/** Line icons, drawn on a 24px grid so they sit together. */
const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  voice: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  trade: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  hall: <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

const FEATURES = [
  {
    icon: "home",
    title: "Own your block",
    body: "Buy a house, name it, lock the door or list it for sale at your price. Park your car where you left it - it stays there between sessions.",
  },
  {
    icon: "voice",
    title: "Proximity voice",
    body: "Talk to whoever is standing next to you. Voices fade with distance, so a crowded street sounds like one.",
  },
  {
    icon: "trade",
    title: "Trade and make friends",
    body: "Swap items face to face, send friend requests, whisper, and see who is online on the city map.",
  },
  {
    icon: "shield",
    title: "Streets with stakes",
    body: "Throw a punch or carry a weapon. Hospitals patch you up for free, and nobody can take what you own.",
  },
  {
    icon: "hall",
    title: "Self-run cities",
    body: "Every district has a Town Hall with a dais you can stand on. Whoever holds the floor holds the room.",
  },
  {
    icon: "coin",
    title: "A real economy",
    body: `Everything is priced in $${CURRENCY}, an SPL token on ${CHAIN_NAME}. Link a wallet when you are ready to buy - not before.`,
  },
];

const FAQ = [
  {
    q: "Do I need a crypto wallet to play?",
    a: "No. Pick a username and password and you are in. You only link a Solana wallet when you want to buy items, cars or homes.",
  },
  {
    q: "Is it free?",
    a: "Yes. Making an account, building a character and playing in the Trenches costs nothing. Purchases are optional and paid in $MOON.",
  },
  {
    q: "Which wallets work?",
    a: "Any Solana wallet that runs as a browser extension: Phantom, Solflare and Backpack are detected automatically. You sign one message to link it - nothing is sent.",
  },
  {
    q: "How do the districts work?",
    a: "Everyone starts in the Trenches. Each district above opens once you own a home in the one below: a Trenches home opens Bagtown, a Bagtown home opens Midtown, and a Midtown home opens Uptown.",
  },
  {
    q: "What do I need to run it?",
    a: "A desktop or laptop browser - Chrome, Edge, Firefox or Safari. There is nothing to download or install.",
  },
  {
    q: "Can the game move my tokens?",
    a: "No. Every purchase is a transfer you approve in your own wallet. The game server holds no keys and only reads the chain to confirm a payment landed.",
  },
];

const STEPS = [
  {
    title: "Create an account",
    body: "Pick a unique username - it is also the nametag everyone sees over your head - and a password.",
  },
  {
    title: "Build your character",
    body: "Body, skin, outfit, shoes, headwear and accessories, with a live 3D preview as you go.",
  },
  {
    title: "Drop into the city",
    body: "Spawn in the Trenches, explore, meet people and make the place yours. Progress saves to your account.",
  },
  {
    title: "Link a wallet - optional",
    body: "Connect Phantom, Solflare or Backpack when you want to buy property or gear. A home is also the key to the next district up.",
  },
];

/** Stagger index for a card's reveal, as the CSS variable the animation reads. */
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Reveals [data-reveal] elements as they scroll into view, once each.
 *
 * Observed against the page's own scroller rather than the viewport, because
 * the body never scrolls. Without IntersectionObserver everything is simply
 * shown, so nothing can stay invisible.
 */
function useReveal(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const scroller = root.current;
    if (!scroller) return;
    const targets = [...scroller.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { root: scroller, threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [root]);
}

/** Moves a card's spotlight to the pointer. One listener for the whole page. */
function trackSpotlight(e: PointerEvent<HTMLElement>) {
  const card = (e.target as HTMLElement).closest<HTMLElement>(".spot");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  card.style.setProperty("--my", `${e.clientY - rect.top}px`);
}

export function LandingPage() {
  const { session } = useSession();
  const playTarget = usePlayTarget();
  const { hash } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  useReveal(scroller);

  // Arriving from another page at /#districts: scroll once the sections exist.
  useEffect(() => {
    const id = hash.replace("#", "");
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="page-scroll landing" ref={scroller} onPointerMove={trackSpotlight}>
      <Header />

      <section className="hero">
        <video className="hero-video" autoPlay muted loop playsInline poster="/images/game-wallpaper.jpg" aria-hidden>
          <source src="/moonville-trailer.mp4" type="video/mp4" />
        </video>
        <div className="hero-shade" aria-hidden />
        <div className="hero-inner">
          <p className="pill">
            <span className="pill-dot" aria-hidden />
            Free to play · No wallet needed
          </p>
          <h1 className="display">
            Start in the Trenches.
            <br />
            <span className="grad">Make it Uptown.</span>
          </h1>
          <p className="hero-lede">
            Moonville is a multiplayer city in your browser. Make a character, claim a home, drive, trade, talk
            and climb through four districts - with a real on-chain economy behind it when you want one.
          </p>
          <div className="hero-ctas">
            <Link to={playTarget} className="btn btn-accent btn-lg">
              {session ? "Jump back in" : "Play free"}
              <span aria-hidden>→</span>
            </Link>
            <Link to="/docs" className="btn btn-ghost btn-lg">
              How to play
            </Link>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>Districts</dt>
              <dd>4</dd>
            </div>
            <div>
              <dt>Players live</dt>
              <dd>
                <LiveCount />
              </dd>
            </div>
            <div className="hero-stat-ca">
              <dt>CA</dt>
              <dd>
                <CopyCA />
              </dd>
            </div>
          </dl>
        </div>
        <a href="#how" className="hero-scroll" aria-label="Scroll to learn more">
          <span />
        </a>
      </section>

      <section className="section" id="how">
        <header className="section-head" data-reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="display-sm">On the street in under a minute</h2>
          <p>No launcher, no extension, no seed phrase. Your account is a username and a password.</p>
        </header>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="spot" data-reveal style={stagger(i)}>
              <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" id="districts">
        <header className="section-head" data-reveal>
          <p className="eyebrow">The world</p>
          <h2 className="display-sm">Four districts, one map</h2>
          <p>
            Walled off from each other and climbed one at a time: a home in each district is the key to the
            next one up.
          </p>
        </header>
        <div className="districts">
          {CITY_ORDER.map((id, i) => {
            const c = CITIES[id];
            const below = unlockingCity(id);
            return (
              <article
                key={id}
                className="district spot"
                data-reveal
                style={{ "--city": c.accent, "--i": i } as CSSProperties}
              >
                <div className="district-shot">
                  <img src={`/images/cities/${CITY_SHOTS[id]}`} alt={`${c.name} at night`} loading="lazy" />
                  <span className="district-tier">Tier {c.tier}</span>
                </div>
                <div className="district-body">
                  <h3>{c.name}</h3>
                  <p>{c.description}</p>
                  <dl>
                    <div>
                      <dt>To get in</dt>
                      <dd>{below ? `Home in ${CITIES[below].name}` : "Open to all"}</dd>
                    </div>
                    <div>
                      <dt>Homes from</dt>
                      <dd>
                        {n(HOME_PRICE[id])} ${CURRENCY}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section" id="features">
        <header className="section-head" data-reveal>
          <p className="eyebrow">What you do</p>
          <h2 className="display-sm">A social city, not a lobby</h2>
          <p>Everything happens in one shared world, in real time, with whoever else is on your street.</p>
        </header>
        <div className="features">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="feature spot" data-reveal style={stagger(i % 3)}>
              <span className="feature-icon">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="token">
        <div className="token-band" data-reveal>
          <div className="token-copy">
            <p className="eyebrow">${CURRENCY} on {CHAIN_NAME}</p>
            <h2 className="display-sm">Play first. Bring a wallet when you want to own things.</h2>
            <p>
              ${CURRENCY} is the city&apos;s currency: an SPL token on {CHAIN_NAME}. Link a wallet to your account
              and you can buy clothes, pets, cars and homes - and every home you buy is the key to the next
              district up.
            </p>
            <ul className="checks">
              <li>Every purchase is a transfer you approve in your own wallet</li>
              <li>The game holds no keys and no balance on your behalf</li>
              <li>Works with Phantom, Solflare and Backpack</li>
            </ul>
            <div className="token-mint">
              <span className="foot-label">Official mint</span>
              <MintAddress />
            </div>
          </div>
          <div className="token-card" aria-hidden>
            <div className="token-card-row">
              <span>Trenches</span>
              <b>Open to all</b>
            </div>
            {CITY_ORDER.slice(1).map((id) => (
              <div key={id} className="token-card-row" style={{ "--city": CITIES[id].accent } as CSSProperties}>
                <span>{CITIES[id].name}</span>
                <b>{CITIES[unlockingCity(id) ?? "trenches"].name} home</b>
              </div>
            ))}
            <p>What opens each gate</p>
          </div>
        </div>
      </section>

      <section className="section section-narrow" id="faq">
        <header className="section-head" data-reveal>
          <p className="eyebrow">FAQ</p>
          <h2 className="display-sm">Questions, answered</h2>
        </header>
        <div className="faq">
          {FAQ.map((item, i) => (
            <details key={item.q} data-reveal style={stagger(i)}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="cta-band" data-reveal>
          <h2 className="display-sm">Your block is waiting.</h2>
          <p>Free, in the browser, and no wallet required to start.</p>
          <Link to={playTarget} className="btn btn-accent btn-lg">
            {session ? "Jump back in" : "Create your account"}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <SiteFooter />
      <BuyTokenFab />
    </div>
  );
}

/**
 * The contract address in the hero, in full - an address people copy in order
 * to spend money is one they should be able to check character by character.
 * The copy button turns into a tick for a moment so the click visibly did something.
 */
function CopyCA() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(DISPLAY_CA).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };

  return (
    <span className="hero-ca">
      <code title={CA_IS_PLACEHOLDER ? "Placeholder - the real address is coming soon" : undefined}>{DISPLAY_CA}</code>
      <button
        type="button"
        className={copied ? "hero-ca-copy copied" : "hero-ca-copy"}
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy contract address"}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
            <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
          </svg>
        )}
      </button>
    </span>
  );
}

/** How often the landing page re-reads the live count. */
const LIVE_POLL_MS = 30_000;
const MIN_DISPLAYED_LIVE_PLAYERS = 20;
const LIVE_PLAYER_FLOOR = 30;

const randomDisplayedLivePlayers = () =>
  Math.floor(Math.random() * (LIVE_PLAYER_FLOOR - MIN_DISPLAYED_LIVE_PLAYERS + 1)) + MIN_DISPLAYED_LIVE_PLAYERS;

/**
 * Players in the world right now, from the game server, with a pulsing dot.
 *
 * Counts below 30 are presented as a random number from 20–30. When the count
 * cannot be read, the stat says so with a dash and a still, grey dot.
 */
function LiveCount() {
  const [players, setPlayers] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch(apiUrl("/api/live"));
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { players?: unknown };
        if (typeof body.players !== "number") throw new Error("bad body");
        if (!alive) return;
        setPlayers(body.players < LIVE_PLAYER_FLOOR ? randomDisplayedLivePlayers() : body.players);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), LIVE_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const known = players !== null && !failed;
  return (
    <span className="live-count" aria-live="polite">
      <span className={known ? "live-dot" : "live-dot off"} aria-hidden />
      {known ? players.toLocaleString() : "–"}
      {!known && <span className="sr-only">Live player count unavailable</span>}
    </span>
  );
}
