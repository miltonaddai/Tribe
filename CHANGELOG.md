# Changelog

All notable changes to Tribe (formerly Block, and before that Moonville) are listed here.

## Unreleased — 2026-11-21

### Changed

- **Block is now Tribe, and Block Bucks are just Bucks.** Browser storage moves from `block:` (and any leftover `moonville:`) keys to `tribe:` on first load, so saves carry over. `@block/shared` is now `@tribe/shared`.
- **Moonville is now Block, and the currency is Block Bucks.** Block Bucks are simulated in-game money, so the $MOON token pages, buy button and contract address are gone from the site. Internal names follow: browser storage moves from `moonville:` to `block:` keys (migrated on first load), `@moonville/shared` is `@block/shared`, the `moon` balance field and database column are `bucks` (an existing sandbox database is migrated when the server starts), and env vars are renamed - `CITY_MIN_MOON_*` → `CITY_MIN_BUCKS_*`, `VITE_CITY_MIN_MOON_*` → `VITE_CITY_MIN_BUCKS_*`, `SANDBOX_STARTING_MOON` → `SANDBOX_STARTING_BUCKS`.
- **Open source under the MIT License.** See `LICENSE`.
- **Offline sandbox.** The game runs entirely on your machine and calls no outside API. Supabase is replaced by a local JSON-file database (`backend/data/sandbox-db.json`) and the `supabase/migrations/` folder is gone. There is no authentication: pick a name and play. $MOON is simulated - every new profile starts with `SANDBOX_STARTING_MOON` (2,000,000) and purchases come out of that balance. Solana wallets and payments, Firebase bug reports (now saved locally) and the default Google STUN server are removed.

### Removed

- The Privacy Policy and Terms of Use pages.

## 2026-10-19

### Changed

- **$MOON is live at `i6Z98UoNrVmqNSdKDhPdZaMmNZVcr8dAgaRrAMgpump`.** On mainnet the site and the server use it by default; `VITE_MOON_MINT` / `MOON_TOKEN_MINT` now only override it (for a devnet stand-in).
- **Purchases burn $MOON.** Buying anything signs an SPL burn of the price from your own wallet instead of a transfer to a store wallet, and the server checks the burn on-chain. `MOON_PAYMENT_ADDRESS` and `VITE_MOON_STORE_WALLET` are gone, along with the store wallet on the docs addresses page.
- **Homes unlock districts, not $MOON held.** Everyone starts in the Trenches; owning a home in a district opens the next one up (Trenches home → Bagtown, Bagtown home → Midtown, Midtown home → Uptown). Lower districts stay open, and a home always lets you back into its own district. The gate tells you which district to buy in. `CITY_MIN_MOON_*` now only affects dev-launcher demo players.
- Buying something with no wallet linked opens the link-wallet dialog, and the purchase carries on once a wallet is linked.
- **Tribe is now Moonville**, and the token is **$MOON**. The districts are renamed to match the climb: Trench City → **Trenches**, Gas City → **Bagtown**, The Real World → **Midtown**, Valhalla → **Uptown**. The Valhalla Gold outfit is now Uptown Gold. Internal names follow too (storage keys, `MOON_*` env vars, the `@moonville/shared` package, district ids and the database), and migration 018 wipes all player game data. Accounts are kept.
- **Play without a wallet.** Anyone can sign up with a unique username and a password and play straight away. The username is your nametag. Characters, homes, cars and inventory are saved to the account, so they follow you to any computer.
- **Solana replaces Robinhood Chain.** $MOON is now an SPL token on Solana. Link Phantom, Solflare or Backpack from Settings or the account menu by signing one message; the linked wallet's $MOON opens the richer districts and pays for purchases. Accounts with no wallet play in the Trenches. This is a fresh start: Robinhood-era characters and property are not carried over.
- **New look.** A scrollable landing page (how it works, districts, features, $MOON, FAQ), a new sign-in page, redesigned docs with grouped navigation and an Accounts & wallets page, and a new type pairing (Inter and Unbounded) and palette across the site and the game HUD.
- The token mint, dev wallet and store wallet are now build settings (`VITE_MOON_MINT`, `VITE_MOON_DEV_WALLET`, `VITE_MOON_STORE_WALLET`) and show *Coming soon* until set. The buy button is hidden until there is a mint.

### Security

- The game room now takes the player's identity from a signed session token. It used to trust the wallet address sent by the client, which let a crafted client join as anyone.
- Character and settings saves require a session too, for the same reason.

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
