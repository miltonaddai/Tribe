import { useEffect, useMemo, type CSSProperties } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  CATALOG,
  CURRENCY,
  CITIES,
  CITY_ORDER,
  DEALER_STOCK,
  DEFAULT_TRIBE_CITY_THRESHOLDS,
  HOME_PRICE,
} from "@tribe/shared";
import { Header } from "../components/Header";
import { SiteFooter } from "../components/SiteFooter";

const SECTIONS = [
  { id: "how-to-play", label: "How to Play" },
  { id: "overview", label: "Overview" },
  { id: "cities", label: "The Four Cities" },
  { id: "access", label: "Access & $TRIBE" },
  { id: "market", label: "Buying & Selling" },
  { id: "property", label: "Homes & Cars" },
  { id: "governance", label: "City Governance" },
  { id: "health", label: "Health" },
  { id: "token", label: "Token" },
];

const CITY_SHOTS = {
  trench: { file: "trench-city.png", label: "a residential street at night", width: 1533, height: 1232 },
  gas: { file: "gas-city.png", label: "the store district at night", width: 1589, height: 1196 },
  realworld: { file: "real-world.png", label: "an avenue seen from a car at night", width: 1395, height: 1187 },
  valhalla: { file: "valhalla.png", label: "the high-rise car district at night", width: 1737, height: 1259 },
} as const;

/** Old links still land somewhere sensible. */
const ALIASES: Record<string, string> = {
  addresses: "token",
  moving: "access",
  brokemeter: "health",
  store: "market",
};

export function DocsPage() {
  const { section = "how-to-play" } = useParams();
  const { hash } = useLocation();
  const active = SECTIONS.some((s) => s.id === section) ? section : (ALIASES[section] ?? "how-to-play");
  const body = useMemo(() => content(active), [active]);

  useEffect(() => {
    const id = hash.replace("#", "");
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, active]);

  return (
    <div className="docs-scroll">
      <Header solid />
      <div className="docs-layout">
      <aside className="docs-side">
        <h2>DOCUMENTATION</h2>
        {SECTIONS.map((s) => (
          <div key={s.id}>
            <Link to={`/docs/${s.id}`} className={s.id === active ? "active" : ""}>
              {s.label}
            </Link>
            {s.id === "cities" &&
              CITY_ORDER.map((id) => (
                <Link
                  key={id}
                  to={`/docs/cities#${id}`}
                  className={`sub${active === "cities" && hash === `#${id}` ? " active" : ""}`}
                >
                  {CITIES[id].name}
                </Link>
              ))}
          </div>
        ))}
      </aside>
      <main className="docs-main">
        <p className="docs-crumb">TRIBE · DOCS</p>
        {body}
      </main>
      <SiteFooter className="docs-footer" />
      </div>
    </div>
  );
}

/** Docs list what the store sells, so retired items are left out. */
function priceList(kind: string) {
  return CATALOG.filter((i) => i.kind === kind && i.listed !== false);
}

const n = (v: number) => v.toLocaleString();

/** Read from the game rather than written out, so retuning cannot strand the docs. */
function gateFor(city: string) {
  return DEFAULT_TRIBE_CITY_THRESHOLDS.find((t) => t.city === city)?.min ?? 0;
}

/** The base price is the smallest home in a district; the largest is twice it. */
function homeRange(city: keyof typeof HOME_PRICE) {
  const base = HOME_PRICE[city];
  return `${n(base)} to ${n(base * 2)}`;
}

/**
 * The addresses page.
 *
 * Exists to be the one place a player can check an address against, because the
 * alternative is that they check against whatever a stranger posts. So it is
 * deliberately blunt about what is not published yet: an empty row that says
 * "coming soon" is a verifiable fact, while a page that simply omits an address
 * leaves room for someone else to supply one.
 */
function Addresses() {
  const rows = [
    {
      name: "Official $TRIBE contract",
      what: "The token itself. Every balance, gate check and purchase reads from this contract.",
      address: "0xA68bd63519ed181ad169843bd63f04BB6Fd4aB5a",
    },
    {
      name: "Dev wallet",
      what: "The team wallet.",
      address: "0xCac7a5D3DDbB7c66d618280F4BcDE18df4e76fd2",
    },
    {
      name: "Game store wallet",
      what: "Where in-game store payments settle. Published so a purchase can be checked on the explorer.",
      address: "0xD88E045b3DeFD1FFb16036E8F87E0F3486A4C054",
    },
  ];

  return (
    <>
      <h1>Token</h1>
      <p>
        Check anything you are about to send funds to against this list, and treat an address from
        anywhere else as wrong until it matches.
      </p>

      <div className="addr-list">
        {rows.map((r) => (
          <div className="addr-row" key={r.name}>
            <div className="addr-head">
              <span className="addr-name">{r.name}</span>
              {r.address ? (
                <code className="addr-value">{r.address}</code>
              ) : (
                <span className="addr-soon">Coming soon</span>
              )}
            </div>
            <p className="addr-what">{r.what}</p>
          </div>
        ))}
      </div>

      <div className="docs-note">
        Tribe will never DM you an address, and never ask for your seed phrase or private key. Any
        address that does not appear on this page is not ours.
      </div>
    </>
  );
}

function content(id: string) {
  if (id === "token") return <Addresses />;
  if (id === "overview") {
    return (
      <>
        <h1>Overview</h1>
        <p>
          Tribe is a crypto-native social city. You connect a wallet, build a character, and drop into one of
          four districts. Everything you own is bought with ${CURRENCY}, the same token you hold in your
          wallet: the clothes in your bag, the car at the kerb, the house with your name over the door.
        </p>
        <h2>One token, one economy</h2>
        <p>
          There is no separate game currency to top up and no exchange rate to learn. The balance on your HUD
          is your actual ${CURRENCY} balance, read from the chain. When you buy something, your wallet asks
          you to sign a transfer, and the item is yours once that transaction confirms. Nothing is held on
          your behalf, and nothing can be spent without you approving it.
        </p>
        <h2>What you actually do</h2>
        <ul>
          <li>Walk the grid, drive, and duck into the four civic buildings every district has.</li>
          <li>Buy clothes, pets and weapons from a Store. Buy a car from a dealership. Buy a house.</li>
          <li>Name your house, lock it, or put it back on the market at a price you set.</li>
          <li>Talk in city chat, whisper to whoever is standing next to you, or turn on proximity voice.</li>
          <li>Send friend requests, trade items, and see who is online on the map.</li>
          <li>Throw a punch. Carry a gun if you would rather not. Hospitals patch you up.</li>
        </ul>
        <div className="docs-note">
          Your district is decided by how much ${CURRENCY} you hold, and it is checked continuously rather
          than stamped once at sign-in. Buy more and the gates open. Spend it all and they close again.
        </div>
      </>
    );
  }

  if (id === "cities") {
    return (
      <>
        <h1>The Four Cities</h1>
        <p>
          The world is one connected map, ordered by wealth. Each district is a 6×6 grid of lots with brick
          sidewalks, asphalt roads, and a wall with gates. Every city has the same civic spine, dressed in
          local colours so you always know where to go even when the sky changes: a Town Hall, a Hospital, a
          Police Station, a Store, a car dealership and a park.
        </p>
        <p>
          Architecture is the lore. Trench builds low and loud. Gas leaves lots empty on purpose. The Real
          World never turns the neon off. Valhalla stacks gold until the fog gives up.
        </p>
        <div className="city-grid">
          {CITY_ORDER.map((cid) => {
            const c = CITIES[cid];
            const shot = CITY_SHOTS[cid];
            return (
              <article key={cid} className="city-card" style={{ "--city": c.accent } as CSSProperties}>
                {/* Captured in the district it names, not a mock-up. */}
                <img
                  className="city-shot"
                  src={`/images/cities/${shot.file}`}
                  alt={`${c.name}: ${shot.label}`}
                  width={shot.width}
                  height={shot.height}
                  loading="lazy"
                />
                <h3>
                  {c.tagline}: {c.name}
                </h3>
                <p>{c.description}</p>
              </article>
            );
          })}
        </div>
        <h2 id="trench">Trench City: the degen floor</h2>
        <p>
          Low-rise, dense, and busy. Homes here run {homeRange("trench")} {CURRENCY}, the cheapest doors on
          the map, and where most people start. No holding requirement at all.
        </p>
        <h2 id="gas">Gas City: quiet, paid, still hungry</h2>
        <p>
          Wider lots, fewer buildings, more sky. Homes run {homeRange("gas")} {CURRENCY}. You need{" "}
          {n(gateFor("gas"))} {CURRENCY} in your wallet to walk through the gate.
        </p>
        <h2 id="realworld">The Real World: neon after dark</h2>
        <p>
          The district that never turns the lights off. Homes run {homeRange("realworld")} {CURRENCY}, and the
          gate wants {n(gateFor("realworld"))} {CURRENCY} held.
        </p>
        <h2 id="valhalla">Valhalla: the bag that made it</h2>
        <p>
          Gold towers, four to ten storeys, and the most expensive property in the game at{" "}
          {homeRange("valhalla")} {CURRENCY}. The gate opens at {n(gateFor("valhalla"))} {CURRENCY}.
        </p>
      </>
    );
  }

  if (id === "access") {
    return (
      <>
        <h1>Access &amp; ${CURRENCY}</h1>
        <p>
          Which districts you can enter depends on how much ${CURRENCY} you hold. It is read from the chain,
          it is checked while you play, and it is the only thing that decides. There is no pass to buy, no
          allowlist, and no way to talk your way through a gate.
        </p>
        <h2>The four tiers</h2>
        <table className="docs-table">
          <thead>
            <tr>
              <th>District</th>
              <th>${CURRENCY} held</th>
            </tr>
          </thead>
          <tbody>
            {CITY_ORDER.map((cid) => (
              <tr key={cid}>
                <td>{CITIES[cid].name}</td>
                <td>{gateFor(cid) === 0 ? "Anyone, no minimum" : n(gateFor(cid))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>It updates while you play</h2>
        <p>
          Your holdings are re-read about once a minute, so buying more ${CURRENCY} opens a gate without
          reconnecting. The reverse is also true: spend down past a threshold and the district you are
          standing in is no longer yours to re-enter. Wealth here is a state you are in, not a badge you were
          handed on your first night.
        </p>
        <h2>How the gates work</h2>
        <p>
          The four cities sit around a shared plaza, each behind a wall with one or two gates. Walk toward a
          richer skyline without the holdings and the game stops you and says so. Walk the other way and the
          road is always open. A Valhalla wallet is welcome in the Trench, but a Trench wallet is not
          wandering Valhalla on vibes.
        </p>
        <div className="docs-note">
          Higher can always go lower. Lower cannot pass. What you spend in the Store or on a house leaves your
          wallet, which means a big enough shopping trip can cost you a district.
        </div>
      </>
    );
  }

  if (id === "market") {
    const guns = priceList("gun");
    const accessories = priceList("accessory");
    const pets = priceList("pet");
    return (
      <>
        <h1>Buying &amp; Selling</h1>
        <p>
          Everything is priced in ${CURRENCY} and paid for from your own wallet. When you buy, your wallet
          opens and asks you to sign a transfer for the exact amount. Approve it and the item arrives once the
          transaction confirms; reject it and nothing happens. You will need a little ETH on Robinhood Chain
          for gas, the same as any other transaction.
        </p>
        <div className="docs-note">
          Nothing is ever taken from your wallet without you signing for it, and the game holds no balance on
          your behalf. Every purchase also leaves a receipt in your inbox. Press N to read it.
        </div>

        <h2>The Store</h2>
        <p>
          Every district has one. Walk in, press I, and the shop replaces your bag. Some items need a higher
          access tier before they will sell to you.
        </p>
        <h3>Accessories</h3>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            {accessories.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  {i.price.toLocaleString()} {CURRENCY}
                </td>
                <td>Tier {i.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Weapons</h3>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            {guns.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  {i.price.toLocaleString()} {CURRENCY}
                </td>
                <td>Tier {i.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Pets</h3>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            {pets.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  {i.price.toLocaleString()} {CURRENCY}
                </td>
                <td>Tier {i.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Equip anything you own from the inventory panel. A pet follows you around. A gun changes what your
          hands do. See Health for what that means on the receiving end.
        </p>

        <h2>Cars</h2>
        <p>
          Every district has a dealership. Stand on the forecourt, walk up to the car you want, and press E.
        </p>
        <table className="docs-table">
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
                  {c.price.toLocaleString()} {CURRENCY}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <strong>One car per player</strong>, and there are only ever 150 privately owned cars in the world.
          When they are gone, they are gone, and the dealership will tell you so. The handful of unowned cars
          parked on the street belong to nobody and anyone can drive them.
        </p>

        <h2>Houses</h2>
        <p>
          Any house without an owner is for sale at a fixed price. Walk up to the door and press B to buy it
          outright. There is no bidding, no auction clock, and no waiting. The price depends on the district
          and on how big the building is, from {n(HOME_PRICE.trench)} {CURRENCY} for a small Trench house to{" "}
          {n(HOME_PRICE.valhalla * 2)} {CURRENCY} for a Valhalla tower.
        </p>
        <h2>Selling your house</h2>
        <p>
          Stand at your own door and press B to list it. You name the asking price. There is no ceiling, and
          the only floor is 1,000 {CURRENCY}. The listing stands until somebody pays it or you withdraw it,
          which you can do at any time by pressing B again.
        </p>
      </>
    );
  }

  if (id === "property") {
    return (
      <>
        <h1>Homes &amp; Cars</h1>
        <p>
          Property is tied to your wallet, not to your session. Log out, come back next week, connect the same
          wallet, and your house and car are exactly where you left them.
        </p>

        <h2>Your house</h2>
        <p>
          Buying a house gives you the door. Walk in with E, and press{" "}
          <strong>H</strong> to give the place a name. It appears on the sign over your door, in your
          inventory, and on the map.
        </p>
        <p>
          Interiors are not all the same. A cheap house is a single room with a bed, a sofa and a kitchen
          counter. As the price climbs the room gets larger and the ceiling higher, and the furnishings grow
          with it: a dining set and a bookshelf, then a fireplace and a chandelier, and at the top a glass
          wall, a bar with stools and rather a lot of gold.
        </p>

        <h2>Locks</h2>
        <p>
          Press <strong>L</strong> at your own door, or in your own car, to lock or unlock it. Locked means
          nobody else gets in. Unlocked means anyone can walk into your house or drive your car, and it stays
          yours either way. Lending is not losing.
        </p>

        <h2>Your car</h2>
        <p>
          Press E to get in, W A S D to drive, E again to get out. It stays where you parked it, including
          between sessions. Locking works the same as a house: an unlocked car is one a friend can borrow, not
          one they can take.
        </p>

        <h2>Keeping track</h2>
        <p>
          Press I and look at the Property column for everything you own and whether it is locked. Press M for
          the map. Your house and car are drawn on it, so you never have to remember which street you left
          the thing on.
        </p>
      </>
    );
  }

  if (id === "governance") {
    return (
      <>
        <h1>City Governance</h1>
        <p>
          Each city runs itself. The Town Hall is not scenery. It is the biggest interior on the map, with a
          public aisle, a raised dais and a seal on the back wall. That is where the city pretends to be a
          republic and occasionally succeeds.
        </p>
        <h2>The floor is yours</h2>
        <p>
          Walk up onto the dais and you are standing above the room, behind the speaker's desk, facing the
          benches. Turn on proximity voice and the people in front of you can hear you. There is no permission
          system and no queue. Whoever is standing on the dais is the one talking.
        </p>
        <h2>The council of 12</h2>
        <p>
          Every district seats a council of twelve. They vote on the boring things that keep a city standing:
          which lots get lighting, whether the hospital wing gets another bay, how aggressive the police desk
          should be about loitering near the gate. Council terms are social rather than on-chain for now, so
          show up, be known, and the room notices.
        </p>
        <div className="docs-note">
          Governance is the part of Tribe that is still being built. The hall, the dais and the voice are
          real; the voting is currently whatever the people in the room agree it is.
        </div>
      </>
    );
  }

  if (id === "health") {
    return (
      <>
        <h1>Health</h1>
        <p>
          The bar at the bottom of your screen is your health. It only moves when another citizen decides it
          should, and it is the one thing in Tribe that costs you nothing to fix.
        </p>
        <h2>How it moves</h2>
        <p>
          A punch takes a little. A weapon takes more, and a Street Rifle takes considerably more than a Lead
          Pipe. Getting hit knocks you back and interrupts what you were doing. Nothing you own is lost when
          you go down: no dropped items, no stolen car, no repossessed house.
        </p>
        <h2>Fixing it</h2>
        <p>
          Every district has a Hospital. Walk through the door and your health refills on its own while you
          are inside. There is nothing to pay and nobody to talk to.
        </p>
        <div className="docs-note">
          Violence in Tribe is social, not economic. Someone can ruin your afternoon. Nobody can take your
          property.
        </div>
      </>
    );
  }

  return (
    <>
      <h1>How to Play</h1>
      <p>
        Tribe runs in the browser. Connect a wallet, make a character, and you are on the street. No download,
        no launcher.
      </p>

      <h2>Get in</h2>
      <ol className="docs-ol">
        <li>Hit Start Playing and connect an EVM wallet: MetaMask, Phantom, Coinbase Wallet or Zerion.</li>
        <li>Approve the signature. You will be switched to Robinhood Chain automatically.</li>
        <li>
          Build a look: name, body, clothes, shoes, headwear. Your display name has to be unique, and the
          page tells you while you type.
        </li>
        <li>
          Spawn in the best district your ${CURRENCY} balance allows. Hold more and the gates open as you go.
        </li>
      </ol>

      <h2>Controls</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Input</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>W A S D / arrows / on-screen pad</td>
            <td>Walk. A/D turn. Hold Shift to sprint. In a car, this is drive and steer.</td>
          </tr>
          <tr>
            <td>Mouse</td>
            <td>
              Look around. With a gun equipped the mouse aims it as soon as you move, so you do not need to
              hold a button. Otherwise, hold right mouse to look.
            </td>
          </tr>
          <tr>
            <td>Left click / F</td>
            <td>Punch, or fire the gun you are holding.</td>
          </tr>
          <tr>
            <td>Space</td>
            <td>Jump. Indoors it stays under the ceiling.</td>
          </tr>
          <tr>
            <td>E</td>
            <td>Enter or leave a building or car, and buy a car at a dealership.</td>
          </tr>
          <tr>
            <td>B</td>
            <td>At a house: buy it, list your own for sale, or withdraw the listing.</td>
          </tr>
          <tr>
            <td>H</td>
            <td>Name a house you own.</td>
          </tr>
          <tr>
            <td>L</td>
            <td>Lock or unlock your house or your car.</td>
          </tr>
          <tr>
            <td>C</td>
            <td>Sit, when you are next to a chair or bench. WASD or C again to stand.</td>
          </tr>
          <tr>
            <td>I</td>
            <td>Inventory. Inside a Store this is also the shop.</td>
          </tr>
          <tr>
            <td>M</td>
            <td>Map. Shows the districts, your property, and who is online.</td>
          </tr>
          <tr>
            <td>N</td>
            <td>Inbox: purchase receipts, sales, and friend requests.</td>
          </tr>
          <tr>
            <td>G</td>
            <td>Send a friend request to whoever is standing next to you.</td>
          </tr>
          <tr>
            <td>T</td>
            <td>Offer an item from your bag to the citizen beside you.</td>
          </tr>
          <tr>
            <td>Enter</td>
            <td>Whisper if someone is in range, otherwise open city chat.</td>
          </tr>
          <tr>
            <td>Esc</td>
            <td>Pause, and release the mouse if a gun has hold of it.</td>
          </tr>
        </tbody>
      </table>

      <h2>The street</h2>
      <p>
        Each district is a grid of lots, roads and sidewalks. Most buildings are houses, and any without an
        owner can be bought on the spot. Six places show up in every city:
      </p>
      <ul>
        <li>
          <strong>Town Hall.</strong> The biggest interior. Columns, benches and a dais you can stand on.
        </li>
        <li>
          <strong>Hospital.</strong> Walk in and your health refills on its own.
        </li>
        <li>
          <strong>Police Station.</strong> Glass desk, lockers, a cell with bars. Do not live there.
        </li>
        <li>
          <strong>Store.</strong> Clothes, pets and weapons. Press I inside.
        </li>
        <li>
          <strong>Dealership.</strong> The forecourt where cars are sold. Press E at the one you want.
        </li>
        <li>
          <strong>Park.</strong> Trees, benches, and no reason to be there other than being there.
        </li>
      </ul>
      <p>
        Streetlamps come on at dusk and light the roads. The clock follows your own, so day outside is day
        in-game. Override it in Settings if you would rather it were always night.
      </p>

      <h2>Other people</h2>
      <p>
        Real players have nametags. NPCs walk the sidewalks, wave and sit on benches. They will not whisper
        back, but they will take a punch. Stand near someone and press Enter to whisper, or click their
        nametag. City chat is the loud channel when nobody is close.
      </p>
      <p>
        Turn on proximity voice from the HUD and you can talk to anyone nearby. It fades with distance and
        cuts out entirely once you walk away. The speaker button beside it picks which device you hear it on,
        and lights up when somebody near you is talking.
      </p>

      <h2>Stay alive, stay moving</h2>
      <p>
        Watch the health bar, and find a Hospital if it dips. Gates to richer districts will turn you away if
        your ${CURRENCY} balance is short; poorer districts are always open. Pause from the HUD for settings,
        these docs, or a clean way out.
      </p>
      <p style={{ marginTop: 24, color: "#777", fontSize: 14 }}>
        Cities, access, the market and health each have their own page in the sidebar.
      </p>
    </>
  );
}
