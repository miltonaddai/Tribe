# The Block

Crypto-native, Roblox-style social game. Connect a wallet, spawn a character, and drop into a living city.

## Folders

| Folder | What it is |
| --- | --- |
| `frontend/` | React + Vite + PlayCanvas. Own `.env` and `node_modules`. |
| `backend/` | Colyseus + Express. Own `.env` and `node_modules`. |
| `shared/` | City config and character types used by both. No env, no install. |

Do not run `yarn install` in the repo root. Each app installs its own dependencies.

## Stack

- **Frontend:** React + Vite, PlayCanvas renderer
- **Backend:** Node.js + Colyseus (player / vehicle positions, rooms, events)
- **Data:** Supabase (PostgreSQL). Run the files in `supabase/migrations/` in order in the SQL Editor.
- **Presence:** Redis
- **Wallets:** Robinhood Chain Testnet (EVM) — balances and sign-in
- **Assets:** Cloudflare R2 (avatars, clothing, cars)

## Cities

One connected map, gated by tier. Higher-city citizens can always travel down. You cannot buy your way up.

| Tier | City | Feel |
| --- | --- | --- |
| 1 | Trench City | Rough, random, most players start here |
| 2 | Gas City | Sparse, calm, hardworking |
| 3 | The Real World | Neon, orderly, booming |
| 4 | Valhalla | Gold towers, fancy cars |

Your Robinhood Chain ETH balance sets the **starting** city. In-game work raises access over time. Health is your lifeline — punch other citizens to wear it down, and walk into a hospital to refill it.

## Run locally

```bash
yarn install:all
```

Then in two terminals:

```bash
yarn dev:web
yarn dev:backend
```

Or from each folder:

```bash
cd frontend
yarn install
yarn dev
```

```bash
cd backend
yarn install
yarn dev
```

- Web: http://localhost:5173
- Colyseus: ws://localhost:2567
- Health: http://localhost:2567/health

Copy `frontend/.env.example` → `frontend/.env` and `backend/.env.example` → `backend/.env`. **Connect Wallet** signs you in on Robinhood Chain Testnet with any EVM wallet (MetaMask, Phantom EVM). Set `VITE_DEV_TOOLS=true` in `frontend/.env` to show a floating launcher (bottom right) for jumping between pages and city game modes without a wallet.

The game runs without Supabase, Redis, Alchemy, or R2.

### Controls

- **WASD / arrows / on-screen pad** — walk (or drive when in a car)
- **E** — enter / exit buildings and vehicles, work a job block
- **Enter** — city chat
- **T** — trade when standing next to another player
- **Microphone button** — opt in to proximity voice chat (within 22 world units)
- **Esc** — pause

Voice chat uses peer-to-peer WebRTC audio and the existing Colyseus room for signaling. Microphone access requires HTTPS in production (localhost is allowed during development). The default public STUN server is suitable for local testing; configure `VITE_VOICE_ICE_SERVERS` with a TURN service in `frontend/.env` for reliable production connectivity.
