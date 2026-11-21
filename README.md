# Tribe

**Start in the Trenches. Make it yours.**

Tribe is a multiplayer social city in your browser. Pick a name, build a character, and drop into a living city with other players: dress up, trade, talk, throw a punch, and explore the Trenches. Homes, cars and the climb to the gold towers of Uptown are coming soon.

## The city

The world is one connected map, ordered by wealth. Each district is a 6×6 grid of lots behind a wall with gates.

| Tier | District | Feel |
| --- | --- | --- |
| 1 | **Trenches** | Rough, random - everyone starts here |
| 2 | **Bagtown** | Sparse, calm, hardworking |
| 3 | **Midtown** | Neon, orderly, booming |
| 4 | **Uptown** | Gold towers, fancy cars |

> **For now, only the Trenches is open.** Homes and cars aren't for sale yet, and Bagtown, Midtown and Uptown are locked for everyone until they are.

**Homes will be the keys.** Once homes go on sale, a home in the Trenches opens Bagtown, a Bagtown home opens Midtown, and a Midtown home opens Uptown. You can always travel back down, and a home always lets you back into its own district.

Every district has the same civic spine:

- **Town Hall** - columns, benches and a dais. Whoever holds the floor holds the room.
- **Hospital** - walk in and your health refills, free.
- **Police Station** - file crime reports on the city's blotter.
- **Store** and **Fashion House** - clothes, accessories, pets and weapons.
- **Dealership** - cars on the forecourt, going on sale soon.
- **Park** - trees, benches, and no reason to be there other than being there.

## What you do

- **Spend Bucks.** Bucks are the city's currency. Every new player starts with a stack of them to spend on clothes, accessories, pets and weapons.
- **Meet people.** City chat, whispers to whoever is next to you, and proximity voice that fades with distance. Send friend requests and see who is online on the map.
- **Trade.** Offer items from your bag face to face.
- **Fight.** Throw a punch or carry a gun. Health wears down when you are hit; a hospital patches you up. Nobody can take what you own.
- **Govern.** Each district seats a council of twelve. For now it is social: show up, be known, and the room notices.

## Controls

| Key | Action |
| --- | --- |
| **W A S D** | Walk (A/D turn). Hold Shift to sprint. In a car, drive and steer. |
| **Mouse** | Look around. With a gun out it aims; otherwise hold right mouse to look. |
| **F** / left click | Punch, or fire the gun you are holding. |
| **Space** | Jump. |
| **E** | Enter or leave a building or car. |
| **C** | Sit on a nearby chair or bench. |
| **I** | Inventory - inside a Store this is also the shop. |
| **M** | Map: districts and who is online. |
| **N** | Inbox: receipts and friend requests. |
| **G** | Send a friend request to whoever is next to you. |
| **T** | Offer an item to the player beside you. |
| **Enter** | Whisper if someone is in range, otherwise city chat. |
| **Esc** | Pause and release the mouse. |

Tribe runs on a desktop or laptop browser - Chrome, Edge, Firefox or Safari.

## Running it

You need Node.js 22+ and Yarn 1.

```bash
yarn install:all
```

Then start the game server and the website together:

```bash
yarn dev
```

Both run in one terminal, each line labelled `server` or `web`, and Ctrl+C stops both. To run them separately instead, use `yarn dev:backend` and `yarn dev:web` in two terminals.

Open http://localhost:5173, pick a name and play. Typing a name that already exists picks that player back up, so open a second tab with a different name to see multiplayer in action. Other machines on your network can join at `http://<your-ip>:5173`.

| | |
| --- | --- |
| Web | http://localhost:5173 |
| Game server | ws://localhost:2567 |
| Health check | http://localhost:2567/health |

No configuration is required. Optional settings - starting balance, the car cap, voice servers, a floating dev launcher for jumping straight into any district - are documented in `backend/.env.example` and `frontend/.env.example`.

The world is saved by the game server to `backend/data/sandbox-db.json`. Stop the server and delete that file to start the city fresh.

## How it is built

| Folder | What it is |
| --- | --- |
| `frontend/` | React + Vite site and the PlayCanvas 3D game client. |
| `backend/` | Node.js game server: Colyseus rooms for positions, vehicles and events, plus an Express API. |
| `shared/` | City layout, items, prices and character types used by both. |

Each of `frontend/` and `backend/` installs its own dependencies - do not run `yarn install` in the repo root.

The server is authoritative: balances, inventory, property and health live on it, and the client only ever asks. Voice chat is peer-to-peer WebRTC audio, with the game room used for signalling.

The property market is one switch: `PROPERTY_MARKET_OPEN` in `shared/cities.ts`. It is `false` for now, which closes home and car sales and locks every district above the Trenches. Set it to `true` to open both.

## License

Tribe is open source under the [MIT License](LICENSE).
