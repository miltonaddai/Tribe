# Changelog

All notable changes to The Block are listed here.

## Unreleased — 2026-08-17

### Added

- Wallet reconnect remembers the citizen for that address and drops straight into the game instead of character create.
- Characters are stored per wallet so a second wallet cannot load someone else’s citizen.
- Quadruped pet follow: cats and dogs trot with hip-pivoted legs, catch up instead of teleporting, and stay on the floor indoors.
- NPC drivers cruise the city road grid (two cars in Trench, Real World, and Valhalla; one in Gas City). Those cars are not enterable.
- Local-time lighting: sky, sun, windows, and lamps follow the player’s clock (dawn ~5:30–7:45, dusk ~17:15–20:00). The Real World keeps a muted neon daylight look.
- Settings → Graphics → **Time of Day**: Local Time, Always Day, or Always Night.
- Concrete perimeter wall around the map with posts, a cap, and collision.
- Inventory, Store interiors in every city, guns, pets, mystery crates, and player-to-player trades.
- Health (replaces Brokemeter), punching (F or left click), hospital refill, sit on chairs/benches (C).
- Custom dropdowns on the settings modal (same control as character create).

### Fixed

- Health bar fill had no height, so it always looked empty and hospitals seemed to do nothing.
- Missing saved health no longer joins you at 0.
- Credits chip no longer overlaps the pause button.
- Pets no longer slide or mix wallets when following.

### Changed

- Connector roads stop at the perimeter wall; the playable square includes the outer curb.
- Settings dropdowns use the in-game option list instead of the browser native `<select>`.
- Street lamps appear in more lots so night streets stay readable.

## 0.1.0

First playable slice.

- React + Vite frontend, PlayCanvas world, Colyseus 0.16 room, shared types.
- Four gated cities: Trench, Gas, The Real World, Valhalla. Wallet balance sets starting city only.
- Solana testnet and Robinhood testnet wallet connect, nonce verify, character create.
- Enterable Town Hall, Hospital, Police, Home, and Store interiors.
- Driveable parked cars, chat, whispers, minimap, docs, and settings.
- Supabase migrations for wallets, characters, pants/shoes, and inventory.
