import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { CITIES, CITY_ORDER, CURRENCY, HOME_PRICE, PROPERTY_MARKET_OPEN, unlockingCity } from "@block/shared";
import { Header, usePlayTarget } from "../components/Header";
import { SiteFooter } from "../components/SiteFooter";
import { useSession } from "../state/SessionStore";

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
    title: PROPERTY_MARKET_OPEN ? "Own your block" : "Homes and cars - coming soon",
    body: PROPERTY_MARKET_OPEN
      ? "Buy a house, name it, lock the door or list it for sale at your price. Park your car where you left it - it stays there between sessions."
      : "Houses and cars aren't for sale yet. When they open, a home will be yours to name, lock and sell - and the key to the next district up.",
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
    body: `Everything is priced in ${CURRENCY}. Everyone starts with a stack of them to spend on clothes, pets and gear.`,
  },
];

const FAQ = [
  {
    q: "Do I need an account?",
    a: "No. Pick a name and you are in. Type the same name next time to pick your character back up.",
  },
  {
    q: "Is it free?",
    a: `Yes, and there is nothing to buy with real money. ${CURRENCY} are the in-game currency: every new player starts with some, and you spend them in the city.`,
  },
  {
    q: "Where is my progress saved?",
    a: "On the game server, in a single save file. Come back with the same name and everything is where you left it.",
  },
  {
    q: "How do the districts work?",
    a: PROPERTY_MARKET_OPEN
      ? "Everyone starts in the Trenches. Each district above opens once you own a home in the one below: a Trenches home opens Bagtown, a Bagtown home opens Midtown, and a Midtown home opens Uptown."
      : "For now the city is the Trenches - Bagtown, Midtown and Uptown are locked. They open once homes go on sale: a home in each district will be the key to the next one up.",
  },
  {
    q: "What do I need to run it?",
    a: "A desktop or laptop browser - Chrome, Edge, Firefox or Safari. There is nothing to download or install.",
  },
];

const STEPS = [
  {
    title: "Pick a name",
    body: "It is the nametag everyone sees over your head. No password, no sign-up.",
  },
  {
    title: "Build your character",
    body: "Body, skin, outfit, shoes, headwear and accessories, with a live 3D preview as you go.",
  },
  {
    title: "Drop into the city",
    body: "Spawn in the Trenches, explore, meet people and make the place yours. Progress saves automatically.",
  },
  {
    title: `Spend your ${CURRENCY}`,
    body: PROPERTY_MARKET_OPEN
      ? "Buy clothes, a car or a home. Every home you buy is the key to the next district up."
      : "Buy clothes, pets and gear at the Store and the Fashion House.",
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
          <source src="/trailer.mp4" type="video/mp4" />
        </video>
        <div className="hero-shade" aria-hidden />
        <div className="hero-inner">
          <p className="pill">
            <span className="pill-dot" aria-hidden />
            Free to play · No sign-up
          </p>
          <h1 className="display">
            Start in the Trenches.
            <br />
            <span className="grad">{PROPERTY_MARKET_OPEN ? "Make it Uptown." : "Make it yours."}</span>
          </h1>
          <p className="hero-lede">
            {PROPERTY_MARKET_OPEN
              ? "Block is a multiplayer city in your browser. Make a character, claim a home, drive, trade, talk and climb through four districts."
              : "Block is a multiplayer city in your browser. Make a character, dress up, drive, trade, talk and make the Trenches your own - with three more districts to come."}
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
              <dt>{PROPERTY_MARKET_OPEN ? "Districts" : "Districts open"}</dt>
              <dd>{PROPERTY_MARKET_OPEN ? CITY_ORDER.length : `1 of ${CITY_ORDER.length}`}</dd>
            </div>
            <div>
              <dt>Sign-up</dt>
              <dd>None</dd>
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
          <p>No launcher, no extension, no account. Just a name.</p>
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
            {PROPERTY_MARKET_OPEN
              ? "Walled off from each other and climbed one at a time: a home in each district is the key to the next one up."
              : "Walled off from each other. For now only the Trenches is open - the rest unlock when homes go on sale."}
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
                      <dd>{!below ? "Open to all" : PROPERTY_MARKET_OPEN ? `Home in ${CITIES[below].name}` : "Locked for now"}</dd>
                    </div>
                    {PROPERTY_MARKET_OPEN && (
                      <div>
                        <dt>Homes from</dt>
                        <dd>
                          {n(HOME_PRICE[id])} {CURRENCY}
                        </dd>
                      </div>
                    )}
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

      <section className="section" id="bucks">
        <div className="bucks-band" data-reveal>
          <div className="bucks-copy">
            <p className="eyebrow">{CURRENCY}</p>
            <h2 className="display-sm">The city runs on {CURRENCY}.</h2>
            <p>
              {CURRENCY} are the city&apos;s currency. Everyone starts with a stack, and you spend them on clothes,
              pets and gear
              {PROPERTY_MARKET_OPEN ? " - and on cars and homes, and every home you buy is the key to the next district up." : "."}
            </p>
            <ul className="checks">
              <li>No real money involved</li>
              {PROPERTY_MARKET_OPEN ? (
                <li>Sell your car or home to another player at your price</li>
              ) : (
                <li>Homes and cars go on sale soon</li>
              )}
              <li>Trade items face to face</li>
            </ul>
          </div>
          <div className="bucks-card" aria-hidden>
            <div className="bucks-card-row">
              <span>Trenches</span>
              <b>Open to all</b>
            </div>
            {CITY_ORDER.slice(1).map((id) => (
              <div key={id} className="bucks-card-row" style={{ "--city": CITIES[id].accent } as CSSProperties}>
                <span>{CITIES[id].name}</span>
                <b>{PROPERTY_MARKET_OPEN ? `${CITIES[unlockingCity(id) ?? "trenches"].name} home` : "Locked for now"}</b>
              </div>
            ))}
            <p>{PROPERTY_MARKET_OPEN ? "What opens each gate" : "Who can get in"}</p>
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
          <p>Free, in the browser, and no sign-up.</p>
          <Link to={playTarget} className="btn btn-accent btn-lg">
            {session ? "Jump back in" : "Pick a name"}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
