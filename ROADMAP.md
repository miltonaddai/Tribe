# Roadmap

Things decided but not built. Each entry records what was already checked, so
the next person does not have to re-derive it.

## Spectator mode — watch without a wallet

**Decided 2026-09-19. Not started. Do this after the deploy is stable.**

Let anyone watch a random live player without connecting a wallet, as a way to
see the city before committing to it.

### Why it is smaller than it sounds

The client already renders the whole city and every remote player. A spectator
is the existing client *minus* the local player, with the camera attached to
someone else's entity. Three pieces already exist:

- `request-roster` (WorldRoom) returns every player's `sessionId`, name,
  position and city — that is the "pick someone to watch" list, already built.
- `onJoin` reads `options.wallet ?? ""`, so a wallet-less join already works.
  Holdings resolve to tier 1 and the player lands in Trenches.
- The camera work from the fashion-house mirror and the ADS view is the same
  machinery, pointed at a remote instead of the local player.

Scope: a spectator flag on join, suppress the local player entity and input, a
camera that follows a chosen remote, a "watching X · next player" overlay, and a
route that skips the wallet guard in `GamePage`. Roughly a day or two.

### What it costs

Not rendering — spectators draw what players already draw. The cost is
server-side and linear per connection:

- `syncViews()` runs every 200ms and loops **every client**, computing an
  interest view for each. Spectators pay that in full.
- Each receives ~20Hz binary patches (`patchRate = 50`) for everything inside
  `AOI_IN` (70 units).

50 spectators cost about what 50 players cost.

### The structural problem to design around

`maxClients = 500` (`WORLD_MAX_PLAYERS`). Spectators would consume player slots,
so a popular stream could fill the world with people who cannot act in it, and
the "MOON IS FULL" queue would start turning away real players.

Mitigations to build in from the start, not bolt on:

- Cap spectators separately — say 20% of the room — so they can never crowd out
  players.
- Give them a slower patch rate. Nobody notices 10Hz while watching.

### Privacy

Spectating means a stranger can watch a named player without consent, and the
roster payload includes `p.wallet`. `showWalletPublicly` is a *client* setting,
so it does not protect anything here.

- Strip the wallet from the spectator roster server-side.
- Decide whether players can opt out of being watched.
- Keep it strictly read-only: no chat, no voice, no trade prompts, so there is
  no path from a wallet-less session to anything touching the economy.
