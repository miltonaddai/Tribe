# Changelog

All notable changes to Tribe are listed here.

## Unreleased — 2026-09-18

### Added

- **Fashion House** in every district, next door to the Store. Racks, mirrors and a fitting platform; press I inside to open the wardrobe. Four outfits are free, five are sold for $TRIBE and stay yours across sessions.
- Mirror view: opening the wardrobe swings the camera round to your front so you can see what you are wearing. Turn with A/D to check the sides.
- **Screenshots.** Press P (or the Photo button) for a clean shot of the city with the HUD hidden, watermarked with the district and coordinates. Copy, save, or share it — everything stays on your own machine, nothing is uploaded.
- **First-person aiming.** Raising a ranged weapon drops the camera to eye level so the view pivots in place instead of swinging the whole scene around you.
- Quick weapon keys: 1 and 2 draw, 0 puts the weapon away, X lowers and raises it without unequipping. Pressing the slot you are already holding disarms.
- Lie down on your bed at home.
- Town Hall notice: voting and elections are being built; the chamber is open in the meantime.
- **Docs → Token**: the official contract, dev wallet and store wallet, each marked *Coming soon* until published, with a warning that any address not on that page is not ours.
- Per-district screenshots on the docs Cities page.
- Landing footer with the contract address, Privacy Policy, Terms of Use and an X link.
- Floating buy button linking to DexScreener and Pons.
- **Privacy Policy** and **Terms of Use** pages.
- Loading screen while the server decides which district you belong in.
- On-screen camera hint and an Aim quick-action button.

### Fixed

- Joining no longer drops you in the wrong city for a few seconds before correcting itself — the world waits for the server's answer rather than guessing from a cached value.
- A balance that fell while you were inside a district no longer traps you there. Gating now tests crossing *in*, not where you already are, so you can always walk out.
- Owning a home in a district grants access to it regardless of holdings — property you paid for cannot be locked behind a door you cannot open.
- The gate now says how many tokens a district needs and how far short you are, using the figure the server actually enforces.
- Cars no longer end up embedded in buildings. Collision tested them as a circle smaller than the car, so a nose could sit inside a wall; the same flaw stopped the stuck-car recovery from ever firing.
- Beds are solid, and standing up no longer leaves you inside one.
- Equipping a weapon from the inventory never reached the server, so other players saw you unarmed.
- Buying an outfit failed silently at the fashion house: purchases were hard-coded to the Store counter, and the refusal had nowhere to appear.
- Mouse look is smooth — movement is applied once per frame rather than per event, so turning follows the hand rather than the mouse's report rate.
- Aim mode can be left. Escape used to release the pointer only for the next keypress to re-capture it.
- Removed a glowing slab that appeared to float in the middle of the Fashion House.
- Home listings were capped at 99,999 by a stray `max` on the price field.
- Docs page scrolled nowhere, sat out of line with the header, and let its footer float mid-page.

### Changed

- **Sidearm** reaches 45 units (was 30) and the **Street Rifle** 65 (was 55). Both stay inside the distance at which other players are replicated.
- The **Lead Pipe** is no longer sold. Anyone who bought one keeps it, and it still works.
- Outfits are never tier-gated — clothes are priced, not restricted by district.
- New hero trailer on the landing page, replacing the old clip.
- The navbar collapses to a hamburger menu on narrow screens.
- Docs restyled, made responsive, and given a footer.
- The contract address reads "Coming soon" until `VITE_TOKEN_LIVE` is set.
- Tribe asks touch devices and very narrow windows to come back on a desktop rather than starting a game that cannot be played.

## 2026-08-17

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
