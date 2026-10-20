# Scaling Moonville — 80 → 500 players per world

Capacity plan for the world server and client renderer.

## Status — 500 players per world is working

Implemented on branch `upgrade/colyseus-0.18` and **load-tested at 500 concurrent bots**.
The original estimates below are kept for context; this section is measured.

| Done | What |
| --- | --- |
| ✅ | Single world, `WORLD_MAX_PLAYERS=500`, overflow rejected with `WORLD_FULL` → queue screen |
| ✅ | Phase 1: `syncMove` throttled to 20 Hz, remote players culled past 70 units, vehicle scan scoped to city |
| ✅ | Phase 2: interest management via Colyseus `StateView` + spatial grid, with hysteresis (in 70 / out 95) |
| ✅ | Friend presence and the world-map roster moved server-side, so filtering does not hide them |
| ✅ | Colyseus 0.16 → 0.18 (`@colyseus/core` 0.18.14, schema 5.x, client `colyseus.js` → `@colyseus/sdk`) |
| ✅ | Phase 3: citizen level-of-detail and entity pooling (60-66% fewer draw calls in a crowd) |
| ✅ | Server-side movement speed check (token bucket), closing the client-authoritative movement exploit |
| ⬜ | Phase 4: shard by district, multi-process |
| ⬜ | Move store purchases server-side (credits still originate on the client) |
| ⬜ | Browser verification — all load testing used the Node SDK, never a real browser |

### Measured at 500 concurrent players

Load split across 5 client processes so the harness was not the bottleneck.

| Metric | Filtering off | Filtering on |
| --- | --- | --- |
| Players each client holds | 500 | ~40 (realistic density) |
| Bandwidth per client | 124 KB/s | ~10 KB/s at 40 neighbours |
| Server event-loop p50 | ~15 ms | ~21 ms |
| Server event-loop p99 | ~25 ms | ~50 ms |
| Server RSS | ~330 MB | ~350 MB |
| Decoder errors | — | **0** |

**Interest management costs server CPU.** Without it Colyseus encodes once and sends identical
bytes to everyone; with it every client gets its own encode. It is still the right default:
the alternative is ~500 Mbps of sustained egress and every browser decoding 500 players.

**The p99 of ~50 ms sits right at the 50 ms patch interval.** That was on a development
machine. A 1 shared vCPU instance is likely slower, so treat 500 as the ceiling for one core,
not a comfortable operating point. Phase 4 (sharding) is what buys real headroom.

### Why the 0.18 upgrade was necessary

On 0.16, `StateView` filtering logged `"refId" not found` whenever a client joined while others
were moving — reproduced on every run. The same test on 0.18 passed three runs and a 500-player
load with zero decoder errors.

### Client draw calls at 40 neighbours

Cosmetics sit under one `detail` child culled past 34 units (restored inside 26).
Measured on a headless PlayCanvas app:

| Scene | Before | After | Saved |
| --- | --- | --- | --- |
| Uptown crowd (crowned, kitted) | 2,520 | 854 | 66% |
| Mixed crowd | 1,600 | 648 | 60% |
| Plain crowd | 640 | 436 | 32% |

A fully kitted citizen is 63 boxes and drops to 14; the crown alone is 22 of them.
The silhouette and any held gun stay at every distance, so a distant player still
reads as a person and as armed.

### Things learned the hard way

- `defineTypes()` **silently ignores a `view` key** in a field descriptor. Only the newer `schema()`
  builder reads it, so `view` must be applied with the `view()` decorator. Schema 5 also marks
  `defineTypes()` deprecated — migrating to `schema()` is worth doing before it is removed.
- A single Node process running 500 test clients saturates itself and reports multi-second
  latency that is not the server's. Measure server event-loop delay (`PERF_LOG=true`) instead.
- Persisted auction rows survive between test runs and are restored on boot, so tests should
  use a home nobody has bid on.

---

> **Original estimates below.** Derived from reading the code before any load testing. The
> ordering of the ceilings held up; see the measured table above for real numbers.

---

## The shape of the problem

Every connected client receives the full state of every other player, twenty times a
second. That is `O(n²)` in players. At 80 it is 6,400 player-updates per tick and it
works. At 500 it is 250,000 per tick — five million a second — and no amount of faster
hardware rescues it.

Everything else below is real but secondary. Fix the broadcast model and the rest becomes
tuning; skip it and the rest is rearranging deck chairs.

### The number that makes 500 possible

The world is **452 units across**. A **60-unit interest radius covers 5.5% of it**. With
players spread across four districts, a client needs roughly **40 neighbours**, not 499 —
a 12× reduction in everything the server encodes, the network carries, and the browser
draws. That single change is the difference between 80 and 500.

---

## What binds, and in what order

| Ceiling | Where | Cost at capacity | Binds at |
| --- | --- | --- | --- |
| **Hard player cap** — room splits into a second world | `backend/src/rooms/WorldRoom.ts:133` — `maxClients = 80` | 81st player → separate world | **Now** |
| **Full-state broadcast** — no interest management | `patchRate = 50` (20 Hz) | n² · 20/s → 5M updates/s @ 500 | ~120 |
| **Client draw calls** — no culling, no batching | `frontend/src/game/character.ts` — 30–64 boxes per citizen | 2,400–5,000 entities @ 80 | ~100 |
| **Unthrottled position sync** | `frontend/src/game/engine.ts` — `syncMove()`, per frame | 4,800/s @ 60 Hz; 11,520/s @ 144 Hz | ~150 |
| **Vehicle scan per move** — cars persist, so this grows forever | `vehicleBlocksPlayerMove` | 427,200 tests/s @ 89 vehicles | ~200 |
| **Single process** — one core, no presence layer | `backend/src/index.ts` — `new Server({ transport })` | 1 core regardless of load | Beyond 1 world |

### Redis is reported but not wired

`/health` returns `redis: true`, but `redisEnabled()` only checks that `REDIS_URL` is set.
There is no `RedisPresence` or `RedisDriver` on the Colyseus server, and neither package is
a dependency. **Horizontal scaling has no foundation today**, and the health check currently
says otherwise — worth fixing early so nobody plans against it.

---

## Phase 0 — Instrument, so the rest is measured
**2–3 days · no capacity gain**

Every number here is derived from reading code. Before changing anything, make the real
ones visible — otherwise you cannot tell a fix from a coincidence.

- A headless bot harness: N Colyseus clients that join, walk a path, and report round-trip
  latency. **The single highest-leverage thing on this list.**
- Server tick timing — time spent in each `onMessage` handler and each patch, exported per room.
- Client frame budget in the existing FPS overlay: render, simulate, apply-network, HUD.
- Record the real curve at 20 / 40 / 80 / 120 bots. Find where frame time crosses 16.7 ms.

## Phase 1 — Stop the waste
**1–2 days · 80 → ~150**

No architectural change, no risk to gameplay. Pure overhead removal, and it roughly doubles
headroom on its own.

- **Throttle `syncMove` to 20 Hz** to match `patchRate`. Sending position faster than the
  server ever broadcasts it is discarded work — 3× less inbound on a 60 Hz display, 7× on a
  144 Hz one. One line.
- **Distance-cull remote players** beyond ~70 units. Currently `enabled` tracks only whether
  someone is indoors; in a 452-unit world most players are far off-screen and still fully drawn.
- **Scope the vehicle scan to the player's city** before the per-vehicle geometry test. Turns
  a full-table scan into a handful of checks.
- **Memoise the HUD citizen list** so React and the minimap SVG do not reconcile 100 rows at 25 Hz.
- **Add a per-message speed check to `move`** (see Liabilities below).

## Phase 2 — Interest management
**1–2 weeks · 150 → ~400**

The real unlock, and the one phase that cannot be skipped or deferred. Clients stop receiving
the whole world and start receiving their neighbourhood.

- **Server-side spatial grid** — bucket players into ~32-unit cells (one city block) and
  maintain it on move. The city grid already gives you the cell size for free.
- **Colyseus `StateView` / `@view` filtering** on `PlayerState` and `VehicleState`, so each
  client's patch carries only entities in its own and adjacent cells.
- **Split the schema by change rate.** Position and rotation change every tick; name, outfit,
  wallet and accessories almost never. Separating them stops 30 static fields riding along
  with every movement delta.
- **Hysteresis on cell entry/exit** so players walking a boundary do not thrash in and out of view.

## Phase 3 — Render scaling on the client
**1–2 weeks · removes the browser ceiling**

Phase 2 cuts what arrives; this cuts what is drawn. Even 40 visible neighbours at 45 boxes
each is 1,800 draw calls before any world geometry.

- **Batch each citizen into one mesh.** A PlayCanvas batch group per citizen turns ~45 draw
  calls into one. The single biggest client win.
- **LOD tiers** — full model inside 25 units, simplified body beyond, billboard past 60.
  Cosmetics multiply: the crown alone is 22 boxes on every wearer.
- **Cap concurrently rendered citizens** at ~60, nearest first, so a plaza crowd degrades
  gracefully instead of collapsing.
- **Pool remote entities** rather than destroying and rebuilding on every join and leave.

## Phase 4 — Shard by district, then by process
**2–3 weeks · 500/world, then linear**

The world is already four walled districts connected by a gate belt. That is a sharding
boundary the design handed you for free, and it fixes a live correctness bug at the same time.

- **One room per district** via `filterBy: ["city"]`. Gate crossings become room handoffs —
  the walls and two-gate layout make the seam a natural place to hide a transition.
- **Wire Redis properly** — `RedisPresence` and `RedisDriver`, so rooms can live in different
  processes and `/health` stops lying.
- **Multiple Node processes** behind the Colyseus proxy, one core each, then multiple machines.
- **Scope auction loading per district.** Home ids already encode their city, so a district
  room loads only its own — which also stops two rooms settling the same auction, a bug that
  exists today the moment an 81st player connects.

---

## Expected curve

| Stage | Players per world |
| --- | --- |
| Today | 80 |
| After Phase 1 | ~150 |
| After Phase 2 | ~400 |
| After Phase 3 | ~450 |
| After Phase 4 | 500+ (then linear across processes) |

---

## Budgets to hold at 500

Concrete targets, so "does it scale" becomes a pass or fail rather than a judgement call.
A 60 fps frame is 16.7 ms; these split it.

| Budget | Target |
| --- | --- |
| Render — world geometry + at most 60 batched citizens | 8 ms |
| Simulation — movement, vehicles, NPC ticks, collision | 3 ms |
| Network apply — decoding and applying state patches | 1.5 ms |
| HUD — React reconciliation, nametag projection, minimap | 2 ms |
| Neighbours in view, average, after interest management | < 40 |
| Server time per patch tick, one district room at capacity | < 25 ms |

---

## Liabilities that scale turns into problems

### Movement is client-authoritative

The `move` handler validates the destination — zone, tier gate, vehicle collision — but never
the distance travelled. Vehicles have a teleport guard; players do not. At 80 friendly testers
that is invisible. At 500 with real money in home auctions, it is a speed hack and a way to
reach a gated city. A per-message speed check costs almost nothing and belongs in Phase 1.

### Credits still originate on the client

The server owns auction escrow and refuses credit increases from `loadout`, which closes the
obvious hole. But store purchases are still computed client-side and reported upward. Before a
large population, purchases should move server-side so the economy has one authority rather
than one-and-a-half.

---

## Reference: current constants

| Constant | Value | Where |
| --- | --- | --- |
| `maxClients` | 80 | `backend/src/rooms/WorldRoom.ts` |
| `patchRate` | 50 ms (20 Hz) | `backend/src/rooms/WorldRoom.ts` |
| `WORLD_HALF` | 226 (452 across) | `shared/cities.ts` |
| `CITY_SIZE` / `CITY_GRID` | 192 / 6×6 lots | `shared/cities.ts` |
| Homes in world | 81 | `allHomeIds()` |
| Boxes per citizen | 30 base, up to 64 with crown + backpack | `frontend/src/game/character.ts` |

Formatted version: <https://claude.ai/code/artifact/3df1d73a-a37e-41b2-a176-018452f260a9>
