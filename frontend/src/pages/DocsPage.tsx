import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  CATALOG,
  CURRENCY,
  CITIES,
  CITY_ORDER,
  DEALER_STOCK,
  HOME_PRICE,
  PROPERTY_MARKET_OPEN,
  unlockingCity,
} from "@block/shared";
import { Header } from "../components/Header";
import { SiteFooter } from "../components/SiteFooter";

type Section = { id: string; label: string; blurb: string };

const GROUPS: { title: string; sections: Section[] }[] = [
  {
    title: "Getting started",
    sections: [
      { id: "how-to-play", label: "How to play", blurb: "Pick a name, build a character, learn the controls." },
      { id: "overview", label: "Overview", blurb: "What Block is and what you do in it." },
      { id: "wallets", label: `Profiles & ${CURRENCY}`, blurb: "Names, saving, and the city's currency." },
    ],
  },
  {
    title: "The world",
    sections: [
      { id: "cities", label: "The four cities", blurb: "The Trenches, Bagtown, Midtown and Uptown." },
      {
        id: "access",
        label: "Unlocking districts",
        blurb: PROPERTY_MARKET_OPEN ? "Homes are the keys to the next district up." : "Only the Trenches is open for now.",
      },
      {
        id: "property",
        label: "Homes & cars",
        blurb: PROPERTY_MARKET_OPEN ? "Owning, locking, naming and finding things." : "Not for sale yet - coming soon.",
      },
      { id: "governance", label: "City governance", blurb: "Town Halls, the dais and the council." },
      { id: "health", label: "Health", blurb: "Getting hurt and getting patched up." },
    ],
  },
  {
    title: "Economy",
    sections: [
      {
        id: "market",
        label: PROPERTY_MARKET_OPEN ? "Buying & selling" : "Shopping",
        blurb: PROPERTY_MARKET_OPEN ? "Prices, the Store, dealerships and houses." : "The Store, the Fashion House and prices.",
      },
    ],
  },
];

const SECTIONS = GROUPS.flatMap((g) => g.sections);

const CITY_SHOTS = {
  trenches: { file: "trenches.png", label: "a residential street at night", width: 1533, height: 1232 },
  bagtown: { file: "bagtown.png", label: "the store district at night", width: 1589, height: 1196 },
  midtown: { file: "midtown.png", label: "an avenue seen from a car at night", width: 1395, height: 1187 },
  uptown: { file: "uptown.png", label: "the high-rise car district at night", width: 1737, height: 1259 },
} as const;

/** Old links still land somewhere sensible. */
const ALIASES: Record<string, string> = {
  addresses: "wallets",
  token: "wallets",
  moving: "access",
  brokemeter: "health",
  store: "market",
  accounts: "wallets",
};

export function DocsPage() {
  const { section = "how-to-play" } = useParams();
  const { hash } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const active = SECTIONS.some((s) => s.id === section) ? section : (ALIASES[section] ?? "how-to-play");
  const body = useMemo(() => content(active), [active]);
  const index = SECTIONS.findIndex((s) => s.id === active);
  const prev = SECTIONS[index - 1];
  const next = SECTIONS[index + 1];
  const group = GROUPS.find((g) => g.sections.some((s) => s.id === active));

  // Each page opens at its top; a hash then scrolls to its heading.
  useEffect(() => {
    const id = hash.replace("#", "");
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else scroller.current?.scrollTo(0, 0);
  }, [hash, active]);

  return (
    <div className="page-scroll docs" ref={scroller}>
      <Header solid />
      <div className="docs-shell">
        <aside className="docs-nav" aria-label="Documentation">
          {GROUPS.map((g) => (
            <div key={g.title} className="docs-nav-group">
              <p className="docs-nav-title">{g.title}</p>
              {g.sections.map((s) => (
                <div key={s.id}>
                  <Link to={`/docs/${s.id}`} className={s.id === active ? "active" : ""} aria-current={s.id === active ? "page" : undefined}>
                    {s.label}
                  </Link>
                  {s.id === "cities" && active === "cities" && (
                    <div className="docs-nav-sub">
                      {CITY_ORDER.map((id) => (
                        <Link key={id} to={`/docs/cities#${id}`} className={hash === `#${id}` ? "active" : ""}>
                          {CITIES[id].name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </aside>

        <main className="docs-body">
          <p className="eyebrow">{group?.title ?? "Docs"}</p>
          <article className="prose">{body}</article>

          <nav className="docs-pager" aria-label="Pages">
            {prev ? (
              <Link to={`/docs/${prev.id}`} className="pager prev">
                <span>Previous</span>
                <strong>{prev.label}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/docs/${next.id}`} className="pager next">
                <span>Next</span>
                <strong>{next.label}</strong>
              </Link>
            )}
          </nav>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

/** "Unlocking districts" while homes are not for sale: what is open, and what comes next. */
function AccessClosed() {
  return (
    <>
      <h1>Unlocking districts</h1>
      <p className="lede">
        For now the city is the Trenches. Bagtown, Midtown and Uptown are locked for everyone, and walking up to
        their gates turns you back.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Right now</th>
            </tr>
          </thead>
          <tbody>
            {CITY_ORDER.map((cid) => (
              <tr key={cid}>
                <td>
                  <span className="dot" style={{ background: CITIES[cid].accent }} />
                  {CITIES[cid].name}
                </td>
                <td>{unlockingCity(cid) ? "Locked" : "Open to everyone"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>What comes next</h2>
      <p>
        The districts open with homes. Once homes go on sale, a home in each district is the key to the next one up:
        a Trenches home opens Bagtown, a Bagtown home opens Midtown, and a Midtown home opens Uptown.
      </p>
      <Note>{CURRENCY} on their own will never open a gate. The home does.</Note>
    </>
  );
}

/** "Homes & cars" while they are not for sale. */
function PropertyClosed() {
  return (
    <>
      <h1>Homes &amp; cars</h1>
      <p className="lede">Coming soon. Homes and cars aren&apos;t for sale yet.</p>
      <h2>Driving</h2>
      <p>
        The unowned cars parked on the street belong to nobody, and anyone can drive them. Walk up and press{" "}
        <kbd>E</kbd> to get in, <Keys>W A S D</Keys> to drive, and <kbd>E</kbd> again to get out.
      </p>
      <h2>What is coming</h2>
      <ul>
        <li>Houses you buy outright, name, lock, and sell to other players at your own price.</li>
        <li>A car of your own from the dealership, parked where you left it between sessions.</li>
        <li>Homes as the keys to the districts above the Trenches.</li>
      </ul>
    </>
  );
}

/** Docs list what the store sells, so retired items are left out. */
function priceList(kind: string) {
  return CATALOG.filter((i) => i.kind === kind && i.listed !== false);
}

const n = (v: number) => v.toLocaleString();


function homeRange(city: keyof typeof HOME_PRICE) {
  const base = HOME_PRICE[city];
  return `${n(base)} to ${n(base * 2)}`;
}

function Note({ children }: { children: ReactNode }) {
  return <div className="callout">{children}</div>;
}

function Keys({ children }: { children: string }) {
  return (
    <>
      {children.split(" ").map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </>
  );
}

function PriceTable({ items }: { items: { id: string; name: string; price: number; tier: number }[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Needs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>
                {n(i.price)} {CURRENCY}
              </td>
              <td>Tier {i.tier}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function content(id: string) {
  if (id === "wallets") {
    return (
      <>
        <h1>Profiles &amp; {CURRENCY}</h1>
        <p className="lede">
          This build is an offline sandbox. There is no sign-in: you pick a name and play, and {CURRENCY} are the
          in-game currency.
        </p>

        <h2>Your profile</h2>
        <ul>
          <li>
            <strong>Name.</strong> 3 to 16 letters, numbers or underscores. It is your nametag. Lookalikes count as
            the same name: &quot;milton&quot; and &quot;milt0n&quot; collide.
          </li>
          <li>
            <strong>No password.</strong> Typing a name that already exists picks that profile back up. Open a second
            tab with a different name to test as two players at once.
          </li>
          <li>
            <strong>Stored locally.</strong> Your character, inventory, friends and anything you own are saved by the game
            server on this machine, in <code>backend/data/sandbox-db.json</code>. Delete that file to reset the world.
          </li>
        </ul>

        <h2>{CURRENCY}</h2>
        <ul>
          <li>Every new profile starts with a stack of {CURRENCY} to spend in the city.</li>
          <li>Purchases come straight out of that balance. There is no real money involved.</li>
          <li>
            {PROPERTY_MARKET_OPEN
              ? "When you sell a home or a car to another player, their " + CURRENCY + " move to you."
              : "Trades swap items, not " + CURRENCY + "."}
          </li>
        </ul>
      </>
    );
  }

  if (id === "overview") {
    return (
      <>
        <h1>Overview</h1>
        <p className="lede">
          Block is a social city in your browser. Pick a name, build a character, and drop into
          {PROPERTY_MARKET_OPEN ? " one of four districts" : " the Trenches"}. Everything for sale is priced in{" "}
          {CURRENCY}.
        </p>
        <h2>Free to play</h2>
        <p>
          There is no sign-up and nothing to buy with real money. Pick a name and spend as long as you like in the
          Trenches - and when you want
          {PROPERTY_MARKET_OPEN
            ? " clothes, a car or a house, pay for it in " + CURRENCY + ". A home is also how you unlock the next district up."
            : " clothes, a pet or a weapon, pay for it in " + CURRENCY + "."}
        </p>
        <h2>One currency, one economy</h2>
        <p>
          The balance on your HUD is your {CURRENCY}. Every new player starts with a stack of them. Buy something
          and the price comes out of your balance
          {PROPERTY_MARKET_OPEN ? "; sell a car or a home to another player and theirs moves to you." : "."}
        </p>
        <h2>What you actually do</h2>
        <ul>
          <li>Walk the grid, drive, and duck into the civic buildings every district has.</li>
          {PROPERTY_MARKET_OPEN ? (
            <>
              <li>Buy clothes, pets and weapons from a Store. Buy a car from a dealership. Buy a house.</li>
              <li>Name your house, lock it, or put it back on the market at a price you set.</li>
            </>
          ) : (
            <>
              <li>Buy clothes, pets and weapons from the Store and the Fashion House.</li>
              <li>Borrow one of the unowned cars parked on the street - anyone can drive them.</li>
            </>
          )}
          <li>Talk in city chat, whisper to whoever is standing next to you, or turn on proximity voice.</li>
          <li>Send friend requests, trade items, and see who is online on the map.</li>
          <li>Throw a punch. Carry a gun if you would rather not. Hospitals patch you up.</li>
        </ul>
        <Note>
          {PROPERTY_MARKET_OPEN
            ? "Districts open one at a time, and the key to each is a home in the district below. Buy a home in the Trenches to open Bagtown, a Bagtown home to open Midtown, and a Midtown home to open Uptown."
            : "Homes and cars aren't for sale yet, so for now the city is the Trenches: Bagtown, Midtown and Uptown are locked. When homes go on sale, a home in each district becomes the key to the next one up."}
        </Note>
      </>
    );
  }

  if (id === "cities") {
    return (
      <>
        <h1>The four cities</h1>
        <p className="lede">
          The world is one connected map, ordered by wealth. Each district is a 6×6 grid of lots behind a wall
          with gates, and each has the same civic spine: Town Hall, Hospital, Police Station, Store, dealership
          and park.
        </p>
        <div className="city-cards">
          {CITY_ORDER.map((cid) => {
            const c = CITIES[cid];
            const shot = CITY_SHOTS[cid];
            return (
              <Link key={cid} to={`/docs/cities#${cid}`} className="city-card" style={{ "--city": c.accent } as CSSProperties}>
                <img
                  src={`/images/cities/${shot.file}`}
                  alt={`${c.name}: ${shot.label}`}
                  width={shot.width}
                  height={shot.height}
                  loading="lazy"
                />
                <span className="city-card-copy">
                  <small>Tier {c.tier}</small>
                  <strong>{c.name}</strong>
                </span>
              </Link>
            );
          })}
        </div>
        <h2 id="trenches">The Trenches: the degen floor</h2>
        <p>
          {PROPERTY_MARKET_OPEN
            ? `Low-rise, dense, and busy. Homes here run ${homeRange("trenches")} ${CURRENCY}, the cheapest doors on the map, and it is where everyone starts. Open to everyone - and a home here is your key to Bagtown.`
            : "Low-rise, dense, and busy. It is where everyone starts - and, for now, the only district that is open."}
        </p>
        <h2 id="bagtown">Bagtown: quiet, paid, still hungry</h2>
        <p>
          {PROPERTY_MARKET_OPEN
            ? `Wider lots, fewer buildings, more sky. Homes run ${homeRange("bagtown")} ${CURRENCY}. The gate opens to anyone who owns a home in the Trenches.`
            : "Wider lots, fewer buildings, more sky. Locked for now."}
        </p>
        <h2 id="midtown">Midtown: neon after dark</h2>
        <p>
          {PROPERTY_MARKET_OPEN
            ? `The district that never turns the lights off. Homes run ${homeRange("midtown")} ${CURRENCY}, and you need a home in Bagtown to get in.`
            : "The district that never turns the lights off. Locked for now."}
        </p>
        <h2 id="uptown">Uptown: the bag that made it</h2>
        <p>
          {PROPERTY_MARKET_OPEN
            ? `Gold towers, four to ten storeys, and the most expensive property in the game at ${homeRange("uptown")} ${CURRENCY}. The gate opens to Midtown homeowners.`
            : "Gold towers, four to ten storeys. Locked for now."}
        </p>
      </>
    );
  }

  if (id === "access") {
    if (!PROPERTY_MARKET_OPEN) return <AccessClosed />;
    return (
      <>
        <h1>Unlocking districts</h1>
        <p className="lede">
          You climb the city one district at a time, and the key to each one is a home in the district below
          it. Nothing else opens a gate - not {CURRENCY} held, not a pass.
        </p>
        <h2>The ladder</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>District</th>
                <th>To get in</th>
                <th>Homes from</th>
              </tr>
            </thead>
            <tbody>
              {CITY_ORDER.map((cid) => {
                const below = unlockingCity(cid);
                return (
                  <tr key={cid}>
                    <td>
                      <span className="dot" style={{ background: CITIES[cid].accent }} />
                      {CITIES[cid].name}
                    </td>
                    <td>{below ? `Own a home in ${CITIES[below].name}` : "Open to everyone"}</td>
                    <td>
                      {n(HOME_PRICE[cid])} {CURRENCY}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h2>How you climb</h2>
        <ol className="steps-list">
          <li>Everyone starts in the Trenches. Buy a home there and the Bagtown gate opens.</li>
          <li>Buy a home in Bagtown and Midtown opens.</li>
          <li>Buy a home in Midtown and Uptown opens.</li>
        </ol>
        <p>
          Districts below you always stay open, so the higher you have climbed, the more of the map you can walk.
          A home also always lets you back into its own district.
        </p>
        <h2>Selling</h2>
        <p>
          Access follows the homes you own right now. Sell your only Trenches home and Bagtown closes to you again -
          unless you own a home in Bagtown itself, which keeps that district open.
        </p>
        <Note>
          {CURRENCY} still pay for everything - homes, cars, clothes - but it does not open any gate on its own. The
          home does.
        </Note>
      </>
    );
  }

  if (id === "market") {
    return (
      <>
        <h1>{PROPERTY_MARKET_OPEN ? "Buying & selling" : "Shopping"}</h1>
        <p className="lede">
          Everything is priced in {CURRENCY}, paid straight from your balance the moment you buy.
        </p>
        <Note>
          Every purchase leaves a receipt in your inbox - press <kbd>N</kbd>.
        </Note>

        <h2>The Store</h2>
        <p>
          Every district has one. Walk in, press <kbd>I</kbd>, and the shop replaces your bag. Clothes and outfits
          are at the Fashion House next door. Some items need a higher district tier before they will sell to you
          {PROPERTY_MARKET_OPEN ? "." : " - while only the Trenches is open, those stay locked."}
        </p>
        <h3>Accessories</h3>
        <PriceTable items={priceList("accessory")} />
        <h3>Weapons</h3>
        <PriceTable items={priceList("gun")} />
        <h3>Pets</h3>
        <PriceTable items={priceList("pet")} />

        {PROPERTY_MARKET_OPEN ? (
          <>
        <h2>Cars</h2>
        <p>
          Every district has a dealership. Walk up to the car you want on the forecourt and press <kbd>E</kbd>.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Car</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {DEALER_STOCK.map((c) => (
                <tr key={c.kind}>
                  <td>{c.name}</td>
                  <td>
                    {n(c.price)} {CURRENCY}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>One car per player</strong>, and only 150 privately owned cars ever exist. When they are gone,
          they are gone. The unowned cars parked on the street belong to nobody and anyone can drive them.
        </p>

        <h2>Houses</h2>
        <p>
          Any house without an owner is for sale at a fixed price. Walk up to the door and press <kbd>B</kbd>.
          Prices run from {n(HOME_PRICE.trenches)} {CURRENCY} for a small Trenches house to{" "}
          {n(HOME_PRICE.uptown * 2)} {CURRENCY} for an Uptown tower.
        </p>
        <h2>Selling your house</h2>
        <p>
          Stand at your own door and press <kbd>B</kbd> to list it at a price you name. The only floor is 1,000{" "}
          {CURRENCY}. The listing stands until somebody pays it or you withdraw it with <kbd>B</kbd> again.
        </p>
          </>
        ) : (
          <>
            <h2>Homes and cars</h2>
            <p>
              Not for sale yet. The cars on dealership forecourts are on display only, and houses have no price tag.
              They are coming soon - <Link to="/docs/property">here is what to expect</Link>.
            </p>
          </>
        )}
      </>
    );
  }

  if (id === "property") {
    if (!PROPERTY_MARKET_OPEN) return <PropertyClosed />;
    return (
      <>
        <h1>Homes &amp; cars</h1>
        <p className="lede">
          Property is tied to your name, not your session. Come back next week with the same name and your house
          and car are exactly where you left them.
        </p>
        <h2>Your house</h2>
        <p>
          Buying a house gives you the door. Walk in with <kbd>E</kbd> and press <kbd>H</kbd> to name it. The name
          appears on the sign over your door, in your inventory, and on the map.
        </p>
        <p>
          Interiors grow with the price: a single room with a bed and a kitchen counter at the bottom, then a
          dining set and bookshelf, a fireplace and chandelier, and at the top a glass wall, a bar and rather a
          lot of gold.
        </p>
        <h2>Locks</h2>
        <p>
          Press <kbd>L</kbd> at your own door, or in your own car, to lock or unlock it. Unlocked means anyone
          can walk in or drive off - and it stays yours either way. Lending is not losing.
        </p>
        <h2>Your car</h2>
        <p>
          <kbd>E</kbd> to get in, <Keys>W A S D</Keys> to drive, <kbd>E</kbd> again to get out. It stays where you
          parked it, including between sessions.
        </p>
        <h2>Keeping track</h2>
        <p>
          Press <kbd>I</kbd> for the Property column and <kbd>M</kbd> for the map. Your house and car are drawn on
          it, so you never have to remember which street you left them on.
        </p>
      </>
    );
  }

  if (id === "governance") {
    return (
      <>
        <h1>City governance</h1>
        <p className="lede">
          Each city runs itself. The Town Hall is the biggest interior on the map, with a public aisle, a raised
          dais and a seal on the back wall.
        </p>
        <h2>The floor is yours</h2>
        <p>
          Step onto the dais and you are above the room, behind the speaker&apos;s desk. Turn on proximity voice
          and the benches can hear you. There is no permission system and no queue: whoever stands on the dais is
          the one talking.
        </p>
        <h2>The council of 12</h2>
        <p>
          Every district seats a council of twelve to vote on the things that keep a city standing. Council terms
          are social for now, so show up, be known, and the room notices.
        </p>
        <Note>
          Governance is the part of Block still being built. The hall, the dais and the voice are real; the voting
          is currently whatever the people in the room agree it is.
        </Note>
      </>
    );
  }

  if (id === "health") {
    return (
      <>
        <h1>Health</h1>
        <p className="lede">
          The bar at the bottom of your screen is your health. It only moves when another citizen decides it
          should, and it costs nothing to fix.
        </p>
        <h2>How it moves</h2>
        <p>
          A punch takes a little. A weapon takes more. Getting hit knocks you back and interrupts what you were
          doing. Nothing you own is lost when you go down: no dropped items, no stolen car, no repossessed house.
        </p>
        <h2>Fixing it</h2>
        <p>Every district has a Hospital. Walk through the door and your health refills on its own. Free.</p>
        <Note>Violence in Block is social, not economic. Someone can ruin your afternoon. Nobody can take your property.</Note>
      </>
    );
  }

  /** Keys that only do something while homes and cars can be bought. */
  const MARKET_KEYS = new Set(["B", "H", "L"]);
  const allControls: [string, string][] = [
    ["W A S D", "Walk. A/D turn. Hold Shift to sprint. In a car, drive and steer."],
    ["Mouse", "Look around. With a gun equipped the mouse aims it; otherwise hold right mouse to look."],
    ["F", "Punch, or fire the gun you are holding (left click works too)."],
    ["Space", "Jump. Indoors it stays under the ceiling."],
    ["E", PROPERTY_MARKET_OPEN ? "Enter or leave a building or car; buy a car at a dealership." : "Enter or leave a building or car."],
    ["B", "At a house: buy it, list your own, or withdraw the listing."],
    ["H", "Name a house you own."],
    ["L", "Lock or unlock your house or car."],
    ["C", "Sit next to a chair or bench. WASD or C again to stand."],
    ["I", "Inventory. Inside a Store this is also the shop."],
    ["M", PROPERTY_MARKET_OPEN ? "Map: districts, your property, and who is online." : "Map: districts and who is online."],
    ["N", PROPERTY_MARKET_OPEN ? "Inbox: receipts, sales and friend requests." : "Inbox: receipts and friend requests."],
    ["G", "Send a friend request to whoever is next to you."],
    ["T", "Offer an item from your bag to the citizen beside you."],
    ["Enter", "Whisper if someone is in range, otherwise city chat."],
    ["Esc", "Pause, and release the mouse."],
  ];
  const controls = PROPERTY_MARKET_OPEN ? allControls : allControls.filter(([k]) => !MARKET_KEYS.has(k));

  return (
    <>
      <h1>How to play</h1>
      <p className="lede">
        Block runs in the browser on a desktop or laptop. Pick a name, build a character, and you are on the
        street. No download, no launcher, no sign-up.
      </p>

      <h2>Get in</h2>
      <ol className="steps-list">
        <li>
          Press <strong>Play free</strong> and pick a name. It becomes your nametag.
        </li>
        <li>Build a look: body, skin, clothes, shoes, headwear and accessories, with a live 3D preview.</li>
        <li>Spawn in the Trenches. Explore, meet people, and make the place yours.</li>
        <li>
          Spend your {CURRENCY}
          {PROPERTY_MARKET_OPEN ? " - a home in the Trenches opens Bagtown." : " on clothes, pets and gear."}{" "}
          <Link to="/docs/wallets">How {CURRENCY} work</Link>.
        </li>
      </ol>

      <h2>Controls</h2>
      <div className="controls">
        {controls.map(([k, what]) => (
          <div key={k} className="control">
            <span className="control-keys">
              <Keys>{k}</Keys>
            </span>
            <span>{what}</span>
          </div>
        ))}
      </div>

      <h2>The street</h2>
      <p>Each district is a grid of lots, roads and sidewalks. Six places show up in every city:</p>
      <ul>
        <li>
          <strong>Town Hall.</strong> The biggest interior. Columns, benches and a dais you can stand on.
        </li>
        <li>
          <strong>Hospital.</strong> Walk in and your health refills on its own.
        </li>
        <li>
          <strong>Police Station.</strong> Glass desk, lockers, a cell with bars. File crime reports here.
        </li>
        <li>
          <strong>Store.</strong> Accessories, pets and weapons. Press <kbd>I</kbd> inside. Outfits are at the
          Fashion House.
        </li>
        <li>
          <strong>Dealership.</strong>{" "}
          {PROPERTY_MARKET_OPEN ? (
            <>
              Where cars are sold. Press <kbd>E</kbd> at the one you want.
            </>
          ) : (
            "Cars on display - not for sale yet."
          )}
        </li>
        <li>
          <strong>Park.</strong> Trees, benches, and no reason to be there other than being there.
        </li>
      </ul>

      <h2>Other people</h2>
      <p>
        Real players have nametags; NPCs walk the sidewalks and sit on benches. Stand near someone and press{" "}
        <kbd>Enter</kbd> to whisper, or use city chat when nobody is close. Turn on proximity voice from the HUD to
        talk to anyone nearby - it fades with distance.
      </p>
    </>
  );
}
