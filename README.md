# Moonville

Crypto-native, Roblox-style social game. Sign up with a username, spawn a character, and drop into a living city. A Solana wallet is optional and only needed to buy things.

Code identifiers still use the old names (`moonville:` storage keys, `MOON_*` env vars, city ids `trenches` / `bagtown` / `midtown` / `uptown`) so saved data and deploy config keep working.

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
- **Accounts:** username + password (scrypt hashes, HMAC-signed session tokens). Players are keyed by `acct:<uuid>`.
- **Wallets:** Solana, optional — linked to an account by signing one message; $MOON (SPL) balances gate districts and pay for purchases
- **Assets:** Cloudflare R2 (avatars, clothing, cars)

## Cities

One connected map, gated by tier. Higher-city citizens can always travel down. You cannot buy your way up.

| Tier | City | Feel |
| --- | --- | --- |
| 1 | Trenches | Rough, random, everyone starts here |
| 2 | Bagtown | Sparse, calm, hardworking |
| 3 | Midtown | Neon, orderly, booming |
| 4 | Uptown | Gold towers, fancy cars |

The $MOON held by your linked Solana wallet sets which districts you can enter; with no wallet linked you play in the Trenches. Health is your lifeline — punch other citizens to wear it down, and walk into a hospital to refill it.

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

Copy `frontend/.env.example` → `frontend/.env` and `backend/.env.example` → `backend/.env`. **Play free** creates a username account; linking a Solana wallet (Phantom, Solflare, Backpack) is done later from Settings or the account menu. Set `SESSION_SECRET` in `backend/.env` so restarts do not sign everyone out, and run `supabase/migrations/017_solana_accounts.sql` before deploying. Set `VITE_DEV_TOOLS=true` in `frontend/.env` (and `ALLOW_DEMO_PLAYERS=true` in `backend/.env`, never in production) to show a floating launcher for jumping between pages and city game modes without an account.

The game runs without Supabase, Redis, a Solana RPC, or R2. Without Supabase, accounts are kept in memory and lost on restart.

### Controls

- **WASD / arrows / on-screen pad** — walk (or drive when in a car)
- **E** — enter / exit buildings and vehicles, work a job block
- **Enter** — city chat
- **T** — trade when standing next to another player
- **Microphone button** — opt in to proximity voice chat (within 22 world units)
- **Esc** — pause

Voice chat uses peer-to-peer WebRTC audio and the existing Colyseus room for signaling. Microphone access requires HTTPS in production (localhost is allowed during development). The default public STUN server is suitable for local testing; configure `VITE_VOICE_ICE_SERVERS` with a TURN service in `frontend/.env` for reliable production connectivity.
