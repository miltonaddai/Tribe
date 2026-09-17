import { useEffect, useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { CURRENCY, CITIES, CITY_ORDER } from "@tribe/shared";
import { Header } from "../components/Header";

const SECTIONS = [
  { id: "how-to-play", label: "How to Play" },
  { id: "overview", label: "Overview" },
  { id: "cities", label: "The Four Cities" },
  { id: "moving", label: "Moving Between Cities" },
  { id: "governance", label: "City Governance" },
  { id: "health", label: "Health" },
];

export function DocsPage() {
  const { section = "how-to-play" } = useParams();
  const { hash } = useLocation();
  const active = SECTIONS.some((s) => s.id === section) ? section : section === "brokemeter" ? "health" : "how-to-play";
  const body = useMemo(() => content(active), [active]);

  useEffect(() => {
    const id = hash.replace("#", "");
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, active]);

  return (
    <div className="docs-layout">
      <Header solid />
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
        <p className="docs-crumb">TRIBE — DOCS</p>
        {body}
      </main>
    </div>
  );
}

function content(id: string) {
  if (id === "overview") {
    return (
      <>
        <h1>Overview</h1>
        <p>
          Tribe is a crypto-native social city. You do not rent an apartment from a studio. You connect a
          wallet, mint a look, and drop into a district that already knows what kind of bag you showed up with.
          Native Crypto Twitter language shapes the four cities — Trench City, Gas City, The Real World, and
          Valhalla — each with its own sky, architecture, vehicles, and temperament.
        </p>
        <h2>An onchain city, built block by block</h2>
        <p>
          The pitch is simple: claim a block, team up with your neighbors, and live in a city that is actually
          owned by the people walking it. No landlords. No pay-to-skip gates after you spawn. Your tribe is
          whoever is standing on the same sidewalk.
        </p>
        <p>
          Under the jokes, Tribe is a live multiplayer street. Citizens walk, drive, duck into buildings,
          whisper when they get close, and keep their health off empty. The map is one connected world
          — four districts around a gated plaza — so a Valhalla whale can slum it in the Trench, but a trenchrat
          cannot stroll into gold towers until they have put in the work.
        </p>
        <h2>What you actually do</h2>
        <ul>
          <li>Walk the grid, hop a car, and learn the four civic buildings in every city.</li>
          <li>Talk in city chat, or press Enter next to someone for a real-time whisper.</li>
          <li>Press I for inventory. Walk into a Store to buy guns, accessories, and pets.</li>
          <li>Punch other citizens with F or a left click. Walk into a hospital to refill health.</li>
          <li>Climb districts the long way. Wallet size only picks your first spawn.</li>
          <li>Lighting follows your local clock: day outside is day in-game, night is night. Override it in Settings.</li>
        </ul>
        <div className="docs-note">
          Your starting city is a passport stamp, not a caste forever. The chain decides where you land. The
          sidewalk decides who you become.
        </div>
      </>
    );
  }

  if (id === "cities") {
    return (
      <>
        <h1>The Four Cities</h1>
        <p>
          The world is one connected map, ordered by wealth. Each district is a 4×4 block grid with brick
          sidewalks, asphalt roads, and a gated border. Every city has the same civic spine — a Town Hall, a
          Hospital, a Police Station, and a Store — dressed in local colors so you always know where to go, even when
          the sky changes.
        </p>
        <p>
          Architecture is the lore. Trench builds low and loud. Gas leaves lots empty on purpose. The Real
          World never turns the neon off. Valhalla stacks gold until the fog gives up.
        </p>
        <div className="city-grid">
          {CITY_ORDER.map((cid) => {
            const c = CITIES[cid];
            return (
              <article key={cid} className="city-card" style={{ borderTopColor: c.accent }}>
                <h3>
                  {c.tagline}: {c.name}
                </h3>
                <p>{c.description}</p>
              </article>
            );
          })}
        </div>

        <h2 id="trench">Trench City — the degen floor</h2>
        <p>
          Most wallets wake up here. The Trench is purple, cramped, and proud of it. Buildings squat at one to
          three floors, lots fill in at random, and nobody pretends the skyline is a flex. This is where rugs
          are folklore, copium is a public utility, and the funniest nights on the map tend to start.
        </p>
        <p>
          Citizens here are loud on the sidewalk and generous with a wave. If you are new, learn the Town Hall
          clock and the hospital first. Everything else — cars, whispers, the walk up to Gas — comes after you
          can find your own block without spinning.
        </p>

        <h2 id="gas">Gas City — quiet, paid, still hungry</h2>
        <p>
          Gas City is the commute after the casino. The lots are sparse, the fog sits a little heavier, and the
          people who live here already paid the fee to leave the Trench. It is not pretty in a Valhalla way. It
          is calm because everyone is working.
        </p>
        <p>
          Expect fewer buildings, more sky, and neighbors who will actually sit on a bench. Hardworking
          citizens, low drama, second-city money. If Trench is a group chat at 3am, Gas is the group chat that
          made it to morning.
        </p>

        <h2 id="realworld">The Real World — neon after dark</h2>
        <p>
          The Real World is the night market of the map. Dark sky, green glass, orderly streets, and a booming
          unofficial economy that never clocks out. The name is a joke that stuck: touch grass, but make it
          emissive.
        </p>
        <p>
          Citizens here keep to the lanes and still flash. If you can pass the gate, you will feel the jump in
          polish immediately — taller habits, tighter fashion, and a hospital that looks like it actually has a
          budget.
        </p>

        <h2 id="valhalla">Valhalla — the bag that made it</h2>
        <p>
          Valhalla is the wealthiest district and it wants you to know. Gold towers, four to ten floors,
          fancy cars, street lamps that cost more than a Trench block. The population is old in the crypto
          sense: they have been here, they remember previous cycles, and they do not need to yell.
        </p>
        <p>
          It takes a lot to spawn here and even more to belong. Visit from below if your tier allows it. Stay
          if you can keep your health honest in a city that assumes you already ate.
        </p>
      </>
    );
  }

  if (id === "moving") {
    return (
      <>
        <h1>Moving Between Cities</h1>
        <p>
          Your connected wallet balance decides where you spawn. After that, the only way into a wealthier
          city is in-game work — you cannot buy a gate pass, mint a VIP lanyard, or wire a second wallet to
          skip the line. The chain is the bouncer for night one. Your access tier is the bouncer forever after.
        </p>
        <h2>Spawn is a stamp, not a ceiling</h2>
        <p>
          Your EVM wallet balance on Robinhood Chain is read at sign-in and mapped onto the four tiers. A heavy bag
          can wake up in Valhalla. A fresh wallet starts in the Trench. That stamp becomes your access tier.
          It does not update when you ape a candle later that afternoon.
        </p>
        <ul>
          <li>Citizens of higher-tier cities may always travel down to poorer districts.</li>
          <li>Citizens of lower-tier cities cannot pass a gate into a richer district.</li>
          <li>Order of wealth: Trench City → Gas City → The Real World → Valhalla.</li>
        </ul>
        <h2>How the gates work</h2>
        <p>
          The four cities sit around a shared plaza. Between them is a belt of gate posts — no overhead bars,
          just a line you feel when the game stops you. Walk toward a richer skyline without the tier and you
          get the message: not yet. Walk the other way and the sidewalk stays open. Whales are allowed to
          visit the Trench. Trenchrats are not allowed to wander Valhalla on vibes.
        </p>
        <p>
          Climbing is slow on purpose. Keep your health up, and treat every district as a
          neighborhood you might actually live in — not a loading screen to skip. When your access rises, the
          same roads you were blocked on become ordinary streets.
        </p>
        <div className="docs-note">
          Higher can always go lower. Lower cannot buy higher. If you want Valhalla from the Trench, you walk
          it the same way everyone else did: one honest job at a time.
        </div>
      </>
    );
  }

  if (id === "governance") {
    return (
      <>
        <h1>City Governance</h1>
        <p>
          Each city runs itself. The Town Hall is not scenery — it is the biggest interior on the map, with a
          public aisle, a dais, and a seal on the back wall. That is where the city pretends to be a republic
          and occasionally succeeds.
        </p>
        <h2>The council of 12</h2>
        <p>
          Every district seats a council of twelve. They vote on the boring things that keep a city standing:
          which lots get lighting, whether the hospital wing gets another bay, how aggressive the police desk
          should be about loitering near the gate. Council terms are social, not onchain yet — show up, be
          known, and the room notices.
        </p>
        <p>
          Council votes are local. A Gas City lighting bill does not need Valhalla&apos;s gold. A Trench
          festival does not need The Real World&apos;s neon committee. Neighbors first, skyline second.
        </p>
        <h2>The constitution</h2>
        <p>
          Each city keeps a short constitution: who can stand for council, how a gate upgrade gets proposed,
          and what counts as a civic building versus a regular home. Amendments only pass if citizens vote on
          the proposed change. No silent patches to the social contract. If the rules move, the sidewalk voted.
        </p>
        <h2>Four cities, one map</h2>
        <p>
          Leaders of all four cities can vote on new city concepts — extra districts, seasonal plazas, a fifth
          temperament if the culture earns it. That vote is the only time Valhalla and the Trench have to sit
          at the same table. The Hospital and Police Station stay under local control. The Town Hall is where
          those arguments get a roof.
        </p>
        <ul>
          <li>
            <strong>Town Hall</strong> — public seating, a raised desk, the city seal. Come here to feel like
            the district has a spine.
          </li>
          <li>
            <strong>Hospital</strong> — waiting room, bays, a desk that never clocks out. The civic answer to
            a health scare.
          </li>
          <li>
            <strong>Police Station</strong> — front glass, a holding cell, lockers. Order, or the performance
            of it, depending on the city.
          </li>
          <li>
            <strong>Store</strong> — shelves, a till, neon. Buy guns, accessories, and pets with{" "}
            {CURRENCY}. Press I while you are inside.
          </li>
        </ul>
      </>
    );
  }

  if (id === "health") {
    return (
      <>
        <h1>Health</h1>
        <p>
          Health is your lifeline. It starts full and stays there until someone lands a punch. The bar at the
          top of the screen is the only HUD that tells you whether you can still throw hands — or whether you
          need a hospital.
        </p>
        <h2>How it moves</h2>
        <p>
          Get close to another citizen, face them, and press F or left-click. A clean hit knocks a chunk off
          their bar and shoves them back. You cannot punch someone who is already inside a hospital. You
          cannot punch if your own health is gone.
        </p>
        <ul>
          <li>Walk into any Hospital landmark. Health refills on its own while you are inside.</li>
          <li>At zero you are down — you can still limp, just not fight. The hospital is the fix.</li>
          <li>Low-health warnings can be toggled in Settings.</li>
        </ul>
        <h2>What zero means</h2>
        <p>
          Hitting empty does not delete your character or seize the wallet. It means you got dropped on the
          sidewalk. Other citizens will still talk to you. The gate still cares about tier, not about whether
          you can throw a punch. The honest fix is the same in every district: walk to the Hospital, step
          inside, walk back out with a full bar.
        </p>
        <div className="docs-note">
          If the bar is red, you are not roleplaying hurt. You are one doorway from a refill. Go inside.
        </div>
      </>
    );
  }

  return (
    <>
      <h1>How to Play</h1>
      <p>
        Connect a wallet, make a citizen, and drop into the city your bag qualifies you for. From there it is
        a street game: walk, look, talk, punch, and get to a hospital if the bar goes red.
      </p>

      <h2>Get in</h2>
      <ol className="docs-ol">
        <li>Hit Start Playing and connect an EVM wallet on Robinhood Chain.</li>
        <li>Build a look — name, clothes, shoes, a little headwear if you have taste.</li>
        <li>Spawn in your home city. The stamp on your passport is the wallet balance at sign-in.</li>
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
            <td>Hold right mouse</td>
            <td>Look around. Let go and you are back to walking as normal.</td>
          </tr>
          <tr>
            <td>Space</td>
            <td>Jump. Indoors it stays under the ceiling.</td>
          </tr>
          <tr>
            <td>E</td>
            <td>Enter or exit a building or vehicle.</td>
          </tr>
          <tr>
            <td>C</td>
            <td>Sit — only when you are next to a chair or bench. You snap onto the seat. WASD or C again to stand.</td>
          </tr>
          <tr>
            <td>F / left click</td>
            <td>Punch the citizen in front of you. Knocks health down. A gun in your bag hits harder. Hospitals refill it.</td>
          </tr>
          <tr>
            <td>I</td>
            <td>Open inventory. Inside a Store, this is also the shop.</td>
          </tr>
          <tr>
            <td>Enter</td>
            <td>Whisper if someone is in range. Otherwise open city chat.</td>
          </tr>
          <tr>
            <td>T</td>
            <td>Open trade and offer an item from your inventory when you are standing next to another citizen.</td>
          </tr>
          <tr>
            <td>Esc</td>
            <td>Pause. Release look-around first if you are holding right mouse.</td>
          </tr>
        </tbody>
      </table>

      <h2>The street</h2>
      <p>
        Each city is a grid of lots, roads, and sidewalks. Regular buildings are homes — sofa, kitchen, a bed
        in the corner. Four landmarks show up in every district:
      </p>
      <ul>
        <li>
          <strong>Town Hall</strong> — the biggest interior. Columns, benches, a dais. Sit with C for
          meetings. Civic business and showing off that you found the door.
        </li>
        <li>
          <strong>Hospital</strong> — waiting chairs, exam bays, a desk under a red cross. Step inside and
          health refills on its own.
        </li>
        <li>
          <strong>Police Station</strong> — glass desk, lockers, a cell with bars. Do not live there.
        </li>
        <li>
          <strong>Store</strong> — neon awning, glass front. Press I inside to buy guns, accessories, and
          pets with {CURRENCY}.
        </li>
      </ul>
      <p>
        Names float over the civic buildings so you do not have to squint at a facade. Hold right mouse and
        look up if a tower is being dramatic about it.
      </p>

      <h2>Other people</h2>
      <p>
        Real players get nametags. NPCs walk the sidewalks, wave, and sit on benches — they will not open a
        whisper, but they will take a punch. Get close to a citizen, press Enter, and talk in real time. Click
        a nametag in range to do the same. City chat is the loud channel when nobody is next to you. Press T
        to offer an item from your inventory if you are feeling generous or suspicious. Press I to open your
        bag. Press F to throw a punch if you are not.
      </p>

      <h2>Stay alive, stay moving</h2>
      <p>
        Watch the health bar. If it dips, find the Hospital nametag and walk through the door — it fills
        while you are inside. Higher-tier gates will bounce you if your access is too low; poorer districts
        are always open if you can already stand in a richer one. Pause from the HUD if you need settings,
        docs, or a clean disconnect.
      </p>
      <p style={{ marginTop: 24, color: "#777", fontSize: 14 }}>
        City lore, gates, councils, and health have their own pages in the sidebar.
      </p>
    </>
  );
}
