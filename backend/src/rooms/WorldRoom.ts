import { Room, type Client } from "@colyseus/core";
import { fileReport, recentReports } from "../services/crimes";
import { fetchCharacter, purchasedItemIds, saveCharacterState } from "../services/db";
import { tributeThresholds } from "../services/cityThresholds";
import {
  otherSide,
  ownSide,
  sanitizeStake,
  settleTrade,
  TRADE_IDLE_MS,
  TRADE_RANGE,
  type TradeSession,
} from "../services/trade";
import { CURRENCY,
  cleanHomeName,
  catalogItem,
  homePrice,
  CITY_BOUNDS,
  CITIES,
  cityEntered,
  type CharacterRecord,
  type InventoryStack,
  ownsOutfit,
  isOutfitId,
  isTierGated,
  DEFAULT_CHAIN,
  cityAtPosition,
  gunSpec,
  addItem,
  decodeInventory,
  encodeInventory,
  hasItem,
  isItemId,
  takeItem,
  allHomeIds,
  carSpec,
  landmarkLot,
  lotCentre,
  parseHomeId,
  type CityId,
  type WalletChainId,
} from "@tribe/shared";
import { PlayerState, VehicleState, ChatLine, HomeState, WorldState, INTEREST_MANAGEMENT } from "../schema/index";
import {
  clampAskingPrice,
  isHomeId,
  MIN_ASKING_PRICE,
} from "../services/homeAuctions";
import { getSupabase } from "../services/supabase";
import {
  claimPayment,
  fetchLastSpot,
  saveLastSpot,
  type LastSpot,
  fetchTribute,
  loadHomeAuctions,
  loadPlayerVehicles,
  saveHomeAuction,
  savePlayerVehicle,
  writeTribute,
} from "../services/db";
import { MAX_PLAYER_VEHICLES, TRIBUTE_CAP, TRIBUTE_DEV_GRANT, envNumber } from "../services/liveEnv";
import { startingCityForWallet } from "../services/alchemy";
import { paymentsConfigured, toBaseUnits, tokenConfigured, verifyPayment } from "../services/token";
import { AOI_IN, SpatialGrid, shouldSee } from "./interest";
import { StateView } from "@colyseus/schema";
import { loadMessages, markMessagesRead, saveMessage, type MessageKind } from "../services/messages";
import { createRequest, loadFriends, removeFriend, respondToRequest } from "../services/friends";

type JoinOptions = {
  name?: string;
  wallet?: string;
  chain?: WalletChainId;
  city?: CityId;
  accessTier?: number;
  bodyType?: string;
  skinTone?: string;
  outfit?: string;
  pantsColor?: string;
  shoe?: string;
  shoeColor?: string;
  headwear?: string;
  accessories?: string;
  health?: number;
  brokemeter?: number;
  tribute?: number;
  inventory?: string;
  gun?: string;
  pet?: string;
};

/** Close code for a session displaced by a newer login on the same wallet. */
const SESSION_REPLACED = 4100;

const SEED_VEHICLES: { city: CityId; x: number; z: number; rotY: number; color: string; kind: string }[] = [
  { city: "trench", x: -48, z: 58, rotY: 0, color: "#F4F4F4", kind: "hatch" },
  { city: "trench", x: -62, z: 42, rotY: Math.PI / 2, color: "#EEEEEE", kind: "hatch" },
  { city: "gas", x: 46, z: 62, rotY: 0, color: "#5B8FCF", kind: "sedan" },
  { city: "realworld", x: -42, z: -58, rotY: Math.PI, color: "#D9772C", kind: "sedan" },
  { city: "realworld", x: -58, z: -44, rotY: -Math.PI / 2, color: "#1A3F34", kind: "sedan" },
  { city: "valhalla", x: 44, z: -40, rotY: 0, color: "#FF8A1F", kind: "sport" },
  { city: "valhalla", x: 62, z: -56, rotY: Math.PI / 2, color: "#2B4C9B", kind: "sedan" },
  { city: "valhalla", x: 38, z: -68, rotY: Math.PI, color: "#1A1A1A", kind: "suv" },
];

const PUNCH_RANGE = 2.8;
const PUNCH_DAMAGE = 18;
const PUNCH_COOLDOWN_MS = 520;
const VOICE_SIGNAL_RANGE = 24;
const VEHICLE_HIT_MIN_SPEED = 5;
const VEHICLE_MAX_SPEED = 22;
/** Walk is 9, sprint 13.95. Anything faster than this on foot is not the game. */
const PLAYER_MAX_SPEED = 14;
/**
 * Distance budget, in units, a player may spend in one burst. Refills at
 * PLAYER_MAX_SPEED. A budget rather than a per-message allowance because a
 * per-message one is farmable: send moves twice as often, travel twice as far.
 */
const MOVE_BURST = 6;
/** Teleports the server performs itself — spawn, doors, leaving a car. */
const MOVE_GRACE_MS = 1200;

function isHospital(buildingId: string) {
  return buildingId.includes("hospital");
}

/** Building ids are `${city}-${kind}`, so the kind is readable off the id. */
function isStation(buildingId: string) {
  return buildingId.includes("police");
}

function vehicleHalfExtents(kind: string) {
  if (kind === "sport") return { halfWidth: 1.025, halfLength: 2.45 };
  if (kind === "suv") return { halfWidth: 1.14, halfLength: 2.75 };
  return { halfWidth: 1.075, halfLength: 2.6 };
}

function vehiclesOverlap(
  ax: number,
  az: number,
  aYaw: number,
  aKind: string,
  bx: number,
  bz: number,
  bYaw: number,
  bKind: string,
) {
  const a = vehicleHalfExtents(aKind);
  const b = vehicleHalfExtents(bKind);
  const aRight = { x: Math.cos(aYaw), z: -Math.sin(aYaw) };
  const aForward = { x: Math.sin(aYaw), z: Math.cos(aYaw) };
  const bRight = { x: Math.cos(bYaw), z: -Math.sin(bYaw) };
  const bForward = { x: Math.sin(bYaw), z: Math.cos(bYaw) };
  const delta = { x: bx - ax, z: bz - az };
  const axes = [aRight, aForward, bRight, bForward];
  const dot = (u: { x: number; z: number }, v: { x: number; z: number }) => u.x * v.x + u.z * v.z;
  for (const axis of axes) {
    const centerDistance = Math.abs(dot(delta, axis));
    const aRadius = a.halfWidth * Math.abs(dot(aRight, axis)) + a.halfLength * Math.abs(dot(aForward, axis));
    const bRadius = b.halfWidth * Math.abs(dot(bRight, axis)) + b.halfLength * Math.abs(dot(bForward, axis));
    if (centerDistance >= aRadius + bRadius + 0.08) return false;
  }
  return true;
}

/**
 * There is exactly one world. Colyseus would otherwise spin up a second room
 * when the first fills, quietly splitting players into parallel cities that
 * cannot see each other and that both write the same auction rows.
 */
/**
 * How often a moving car's position is written down.
 *
 * Often enough that an unclean shutdown loses a few seconds of driving rather
 * than the whole trip, rare enough that a busy road is not a write storm.
 */
const VEHICLE_SAVE_MS = 5_000;

/** How long a wallet's holdings are reused before re-reading the chain. */
const HOLDINGS_CACHE_MS = 60_000;

type Holdings = { tier: number; balance: number };

/**
 * The outcome of writing a spot down, so an explicit save from the pause menu
 * can say what happened rather than silently appearing to work. The automatic
 * saves ignore it - "offline" is the database being unreachable, the rest are
 * the player not standing anywhere worth remembering.
 */
type SpotSave =
  | { ok: true; city: CityId }
  | { ok: false; reason: "no-wallet" | "indoors" | "nowhere" | "offline" };

let liveWorlds = 0;

// 0.18 takes an options object as the Room generic rather than the bare state type.
export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = Math.max(1, envNumber("WORLD_MAX_PLAYERS", 500));
  patchRate = 50;
  private punchAt = new Map<string, number>();
  private vehicleMotion = new Map<string, { x: number; z: number; at: number }>();
  private vehicleImpactAt = new Map<string, number>();
  private knockedUntil = new Map<string, number>();
  /** Live trade sessions, and an index from each participant to their session. */
  private trades = new Map<string, TradeSession>();
  private tradeOf = new Map<string, string>();
  private chains = new Map<string, WalletChainId>();
  private moveBudget = new Map<string, { budget: number; at: number }>();
  private moveGraceUntil = new Map<string, number>();
  private holdingsCache = new Map<string, Holdings & { at: number }>();
  /** wallet -> their accepted friends' wallets, so join/leave can refresh the
      right people without hitting the database. */
  private friendsOf = new Map<string, Set<string>>();
  private playerGrid = new SpatialGrid<PlayerState>();
  private vehicleChains = new Map<string, WalletChainId>();
  private vehicleSavedAt = new Map<string, number>();

  onCreate() {
    if (liveWorlds > 0) {
      // Surfaces to the client as a matchmaking failure, which it renders as
      // "the world is full" rather than dropping the player into a copy.
      throw new Error("WORLD_FULL");
    }
    liveWorlds++;
    this.setState(new WorldState());
    this.clock.start();
    void this.restoreAuctions();
    void this.restoreVehicles();

    SEED_VEHICLES.forEach((spec, i) => {
      const v = new VehicleState();
      v.id = `veh-${i}`;
      v.city = spec.city;
      v.x = spec.x;
      v.y = 0.55;
      v.z = spec.z;
      v.rotY = spec.rotY;
      v.color = spec.color;
      v.kind = spec.kind;
      this.state.vehicles.set(v.id, v);
    });

    this.onMessage("move", (client, data: { x: number; y: number; z: number; rotY: number; sitting?: boolean; lying?: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inVehicle) return;
      if ((this.knockedUntil.get(client.sessionId) ?? 0) > Date.now()) return;

      const zone = cityAtPosition(data.x, data.z);
      if (zone === "void") return;

      // Movement is otherwise client-authoritative: without this you can walk
      // as fast as you like, including straight through a tier gate.
      const now = Date.now();
      if (now > (this.moveGraceUntil.get(client.sessionId) ?? 0)) {
        const tracked = this.moveBudget.get(client.sessionId) ?? { budget: MOVE_BURST, at: now };
        const elapsed = Math.max(0, Math.min(1, (now - tracked.at) / 1000));
        const budget = Math.min(MOVE_BURST, tracked.budget + PLAYER_MAX_SPEED * elapsed);
        const travelled = Math.hypot(data.x - player.x, data.z - player.z);
        if (travelled > budget) {
          this.moveBudget.set(client.sessionId, { budget, at: now });
          client.send("move-correction", { x: player.x, y: player.y, z: player.z });
          return;
        }
        this.moveBudget.set(client.sessionId, { budget: budget - travelled, at: now });
      }
      if (!player.inBuilding && this.vehicleBlocksPlayerMove(player.x, player.z, data.x, data.z, player.city)) return;

      // Gating applies at the wall line, matching the client. The ring road
      // between the wall and the district edge is open to everyone, and the
      // test is on crossing in - never on where you already are.
      const entering = cityEntered(player.x, player.z, data.x, data.z);
      if (entering && !this.mayEnter(player, entering)) {
        client.send("gate-denied", {
          city: entering,
          requiredTier: CITIES[entering].tier,
          yourTier: player.accessTier,
          requiredTribute: tributeThresholds().find((t) => t.city === entering)?.min ?? 0,
          yourTribute: player.tribute,
        });
        return;
      }
      if (zone !== "gate") player.city = zone;

      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.rotY = data.rotY;
      player.sitting = Boolean(data.sitting);
      // Lying only ever accompanies sitting; on its own it would leave a body
      // flat on the floor wherever they happened to stop.
      player.lying = player.sitting && Boolean(data.lying);
    });

    // An explicit save from the pause menu. The position is already written on
    // leave and on the holdings tick, so this exists to be *sure* before
    // closing the tab - and, unlike those, it reports back.
    this.onMessage("save-spot", (client) => {
      void this.rememberSpot(client.sessionId).then((result) => {
        client.send("spot-saved", result);
      });
    });

    this.onMessage("vehicle-move", (client, data: { id: string; x: number; z: number; rotY: number; speed?: number }) => {
      const player = this.state.players.get(client.sessionId);
      const vehicle = this.state.vehicles.get(data.id);
      if (!player || !vehicle || vehicle.driver !== client.sessionId) return;

      const x = Number(data.x);
      const z = Number(data.z);
      const rotY = Number(data.rotY);
      if (![x, z, rotY].every(Number.isFinite)) return;

      const zone = cityAtPosition(x, z);
      if (zone === "void") return;
      const entering = cityEntered(vehicle.x, vehicle.z, x, z);
      if (entering && !this.mayEnter(player, entering)) return;
      if (this.vehicleIntersectsVehicle(vehicle.id, x, z, rotY, vehicle.kind)) {
        client.send("vehicle-correction", { id: vehicle.id, x: vehicle.x, z: vehicle.z, rotY: vehicle.rotY });
        this.vehicleMotion.set(vehicle.id, { x: vehicle.x, z: vehicle.z, at: Date.now() });
        return;
      }

      const now = Date.now();
      const previous = this.vehicleMotion.get(vehicle.id) ?? { x: vehicle.x, z: vehicle.z, at: now - 50 };
      const elapsed = Math.max(0.015, Math.min(0.25, (now - previous.at) / 1000));
      const traveled = Math.hypot(x - previous.x, z - previous.z);
      if (traveled > VEHICLE_MAX_SPEED * elapsed + 1.25) return;
      const measuredSpeed = Math.min(VEHICLE_MAX_SPEED, traveled / elapsed);
      const claimedSpeed = Math.min(VEHICLE_MAX_SPEED, Math.abs(Number(data.speed) || 0));
      const impactSpeed = Math.min(measuredSpeed + 1.5, claimedSpeed || measuredSpeed);

      vehicle.x = x;
      vehicle.z = z;
      vehicle.rotY = rotY;
      player.x = x;
      player.z = z;
      player.rotY = rotY;
      this.vehicleMotion.set(vehicle.id, { x, z, at: now });
      // Checkpoint while driving, not only on exit. A crash, a deploy or a dev
      // reload never runs onLeave, and the car would come back at wherever it
      // was last parked - losing the whole drive.
      if (vehicle.owner && now - (this.vehicleSavedAt.get(vehicle.id) ?? 0) > VEHICLE_SAVE_MS) {
        this.vehicleSavedAt.set(vehicle.id, now);
        void savePlayerVehicle(this.vehicleRow(vehicle));
      }
      if (zone !== "gate") {
        player.city = zone;
        vehicle.city = zone;
      }
      if (impactSpeed >= VEHICLE_HIT_MIN_SPEED) {
        this.applyVehicleImpacts(client.sessionId, vehicle.id, x, z, rotY, impactSpeed, previous.x, previous.z, now);
      }
    });

    this.onMessage("enter-vehicle", (client, data: { id: string }) => {
      const player = this.state.players.get(client.sessionId);
      const vehicle = this.state.vehicles.get(data.id);
      if (!player || !vehicle) return;
      if (vehicle.owner && vehicle.locked && vehicle.owner !== player.wallet) {
        // Tell them to get out: the client lets you in optimistically.
        client.send("entry-denied", { id: vehicle.id, kind: "car", reason: "That car is locked." });
        return;
      }
      if (vehicle.driver && vehicle.driver !== client.sessionId) {
        // Was a silent return. The client has already put the player behind the
        // wheel optimistically, so saying nothing leaves it driving a car the
        // server does not think it owns - every move rejected, and the car
        // dragged back to wherever the server last saw it.
        client.send("entry-denied", { id: vehicle.id, kind: "car", reason: "Someone else is driving that." });
        return;
      }
      this.allowTeleport(client.sessionId);
      vehicle.driver = client.sessionId;
      player.inVehicle = true;
      player.vehicleId = vehicle.id;
    });

    this.onMessage("exit-vehicle", (client) => {
      this.releaseVehicle(client.sessionId);
    });

    this.onMessage("enter-building", (client, data: { id: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inVehicle) return;
      const id = String(data.id ?? "");

      // Ownership alone does not bar the door - the owner's lock does. An
      // unlocked home is open to anyone, and stays the owner's either way.
      const home = this.state.homes.get(id);
      if (home?.owner && home.locked && home.owner !== player.wallet) {
        client.send("entry-denied", {
          id,
          kind: "home",
          reason: `${home.ownerName || "Someone"} has this home locked.`,
        });
        return;
      }

      this.allowTeleport(client.sessionId);
      player.inBuilding = true;
      player.buildingId = id;
      if (isHospital(id)) player.health = 100;
    });

    this.onMessage("exit-building", (client) => {
      this.allowTeleport(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.inBuilding = false;
      player.buildingId = "";
    });

    this.onMessage("chat", (client, data: { text: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const text = String(data.text ?? "").slice(0, 180).trim();
      if (!text) return;

      const line = new ChatLine();
      line.id = `${Date.now()}-${client.sessionId}`;
      line.from = client.sessionId;
      line.name = player.name;
      line.text = text;
      line.city = player.city;
      line.at = Date.now();
      this.state.chat.set(line.id, line);

      if (this.state.chat.size > 40) {
        const oldest = [...this.state.chat.keys()][0];
        if (oldest) this.state.chat.delete(oldest);
      }
    });

    this.onMessage("whisper", (client, data: { toSession?: string; text?: string; id?: string }) => {
      const from = this.state.players.get(client.sessionId);
      const toSession = String(data.toSession ?? "");
      const to = this.state.players.get(toSession);
      if (!from || !to || toSession === client.sessionId) return;

      const text = String(data.text ?? "").slice(0, 180).trim();
      if (!text) return;

      const dist = Math.hypot(from.x - to.x, from.z - to.z);
      if (dist > 16) {
        client.send("whisper-denied", { toSession, reason: "too-far" });
        return;
      }

      const payload = {
        id: String(data.id ?? `${Date.now()}-${client.sessionId}`).slice(0, 48),
        fromSession: client.sessionId,
        fromName: from.name,
        toSession,
        text,
        at: Date.now(),
      };
      client.send("whisper", payload);
      this.clients.find((c) => c.sessionId === toSession)?.send("whisper", payload);
    });

    this.onMessage("voice-ready", (client) => {
      this.sendToNearbyVoiceClients(client, "voice-ready", { sessionId: client.sessionId });
    });

    this.onMessage("voice-left", (client) => {
      this.sendToNearbyVoiceClients(client, "voice-left", { sessionId: client.sessionId });
    });

    this.onMessage(
      "voice-signal",
      (client, data: { toSession?: string; description?: unknown; candidate?: unknown }) => {
        const toSession = String(data?.toSession ?? "");
        if (!toSession || toSession === client.sessionId || !this.canVoice(client.sessionId, toSession)) return;
        const payload = {
          fromSession: client.sessionId,
          ...(data.description ? { description: data.description } : {}),
          ...(data.candidate ? { candidate: data.candidate } : {}),
        };
        if ((!data.description && !data.candidate) || JSON.stringify(payload).length > 12_000) return;
        this.clients.find((other) => other.sessionId === toSession)?.send("voice-signal", payload);
      },
    );

    // Both sides of the blotter are gated on actually standing in a station.
    // The check is server-side because "inside the police station" is the whole
    // access rule - a client that simply did not open the door could otherwise
    // read and write the board from anywhere in the city.
    this.onMessage("crime-report", (client, data: { offence?: string; accused?: string; note?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!player.inBuilding || !isStation(player.buildingId)) {
        client.send("crime-result", { ok: false, reason: "You have to be in a police station." });
        return;
      }
      void fileReport({
        city: player.city,
        offence: String(data.offence ?? ""),
        accusedName: String(data.accused ?? ""),
        note: String(data.note ?? ""),
        reporterWallet: player.wallet,
        reporterChain: this.chainFor(client.sessionId),
        reporterName: player.name,
      }).then((result) => {
        if (!result.ok) {
          client.send("crime-result", { ok: false, reason: result.reason });
          return;
        }
        client.send("crime-result", { ok: true });
        // Everyone currently at a station in this city sees it arrive, rather
        // than finding it on their next manual refresh.
        this.broadcastBlotter(player.city);
      });
    });

    this.onMessage("crime-list", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!player.inBuilding || !isStation(player.buildingId)) return;
      void recentReports(player.city).then((reports) => {
        client.send("crime-list", { reports });
      });
    });

    // An invitation carries no items. What each side stakes is decided inside
    // the session, where both can see the other's offer before committing.
    this.onMessage("trade-invite", (client, data: { toSession: string }) => {
      const from = this.state.players.get(client.sessionId);
      const toSession = String(data.toSession ?? "");
      const to = this.state.players.get(toSession);
      if (!from || !to || toSession === client.sessionId) return;
      if (Math.hypot(from.x - to.x, from.z - to.z) > TRADE_RANGE) return;
      if (this.tradeOf.has(client.sessionId)) {
        client.send("trade-closed", { reason: "You are already trading." });
        return;
      }
      if (this.tradeOf.has(toSession)) {
        client.send("trade-closed", { reason: `${to.name} is already trading.` });
        return;
      }
      this.clients
        .find((c) => c.sessionId === toSession)
        ?.send("trade-invite", { fromSession: client.sessionId, fromName: from.name });
    });

    this.onMessage("trade-accept", (client, data: { fromSession: string; accept: boolean }) => {
      const fromSession = String(data.fromSession ?? "");
      const from = this.state.players.get(fromSession);
      const to = this.state.players.get(client.sessionId);
      const inviter = this.clients.find((c) => c.sessionId === fromSession);
      if (!from || !to) return;
      if (!data.accept) {
        inviter?.send("trade-closed", { reason: `${to.name} declined.` });
        return;
      }
      if (this.tradeOf.has(fromSession) || this.tradeOf.has(client.sessionId)) {
        client.send("trade-closed", { reason: "That trade is no longer open." });
        return;
      }
      if (Math.hypot(from.x - to.x, from.z - to.z) > TRADE_RANGE) {
        client.send("trade-closed", { reason: "Too far apart to trade." });
        return;
      }
      const session: TradeSession = {
        id: `${fromSession}:${client.sessionId}`,
        a: { sessionId: fromSession, items: [], locked: false },
        b: { sessionId: client.sessionId, items: [], locked: false },
        touchedAt: Date.now(),
      };
      this.trades.set(session.id, session);
      this.tradeOf.set(fromSession, session.id);
      this.tradeOf.set(client.sessionId, session.id);
      this.sendTradeState(session);
    });

    this.onMessage("trade-offer", (client, data: { items?: unknown }) => {
      const session = this.tradeFor(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!session || !player) return;
      const mine = ownSide(session, client.sessionId);
      if (!mine) return;
      mine.items = sanitizeStake(data.items, player.inventory);
      // Any change to either stake drops both locks. Without this, locking in
      // against an offer is meaningless: the other side could swap theirs out
      // underneath a commitment already made.
      session.a.locked = false;
      session.b.locked = false;
      session.touchedAt = Date.now();
      this.sendTradeState(session);
    });

    this.onMessage("trade-lock", (client, data: { locked?: boolean }) => {
      const session = this.tradeFor(client.sessionId);
      if (!session) return;
      const mine = ownSide(session, client.sessionId);
      if (!mine) return;
      mine.locked = Boolean(data.locked);
      session.touchedAt = Date.now();
      if (session.a.locked && session.b.locked) this.settleTradeSession(session);
      else this.sendTradeState(session);
    });

    this.onMessage("trade-cancel", (client) => {
      const session = this.tradeFor(client.sessionId);
      if (!session) return;
      const name = this.state.players.get(client.sessionId)?.name ?? "They";
      this.closeTrade(session, `${name} cancelled the trade.`);
    });

    this.onMessage("loadout", (client, data: { inventory?: string; tribute?: number; gun?: string; pet?: string; accessories?: string; outfit?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // data.inventory is deliberately ignored. What a wallet owns is decided
      // by purchases and trades the server itself performed, not by what the
      // browser reports holding - accepting it was how paid items ended up
      // living in localStorage, and how a crafted client could mint them.
      // The balance is never taken from the client. Tribute is a real token held
      // as a deposited float, so a client-supplied figure is a mint instruction
      // from an untrusted source. Every change runs through the server: purchases
      // below, auction escrow, and deposits. `data.tribute` is read and dropped.
      if (typeof data.gun === "string") player.gun = data.gun.slice(0, 24);
      if (typeof data.pet === "string") player.pet = data.pet.slice(0, 24);
      if (typeof data.accessories === "string") player.accessories = data.accessories.slice(0, 120);
      // Outfits are checked rather than taken on trust: a paid one has to be in
      // the inventory the server holds. Unlike a gun or a pet, which are only
      // worn if the client also equips them locally, an unowned outfit claimed
      // here would be visible on that player to everyone in the city - a free
      // Valhalla Gold for anyone willing to edit a message.
      if (typeof data.outfit === "string" && isOutfitId(data.outfit)) {
        if (ownsOutfit(decodeInventory(player.inventory), data.outfit)) player.outfit = data.outfit;
      }
      // Equipment is a preference rather than ownership, but it still belongs
      // on the server so it survives a different browser.
      this.persistGoods(client.sessionId, player);
    });

    this.onMessage("shoot", (client, data: { toSession?: string }) => {
      const from = this.state.players.get(client.sessionId);
      const toSession = String(data.toSession ?? "");
      const to = this.state.players.get(toSession);
      if (!from || !to || toSession === client.sessionId) return;
      if (from.inVehicle || to.inVehicle) return;
      if (from.health <= 0) return;
      if (to.inBuilding && isHospital(to.buildingId)) return;

      // Damage, range and rate of fire come from the equipped weapon, checked
      // here rather than taken from the client.
      const spec = gunSpec(from.gun);
      if (!spec?.ranged) return;

      const now = Date.now();
      if (now - (this.punchAt.get(client.sessionId) ?? 0) < spec.cooldownMs) return;
      this.punchAt.set(client.sessionId, now);

      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > spec.range) return;

      // Same corridor test the client aims with, widened a little because
      // rotY here is the last synced value and lags the shooter's view.
      const fx = Math.sin(from.rotY);
      const fz = Math.cos(from.rotY);
      if (dx * fx + dz * fz <= 0) return;
      if (Math.abs(dx * fz - dz * fx) > spec.spread + 0.8) return;

      // You cannot shoot through a wall into a building, or out of one.
      if (from.inBuilding !== to.inBuilding) return;
      if (from.inBuilding && from.buildingId !== to.buildingId) return;

      to.health = Math.max(0, to.health - spec.damage);
      to.sitting = false;
      to.lying = false;

      this.broadcast("gunshot", {
        fromSession: client.sessionId,
        toSession,
        gun: spec.id,
        health: to.health,
        x: to.x,
        z: to.z,
      });
    });

    this.onMessage("punch", (client, data: { toSession?: string }) => {
      const from = this.state.players.get(client.sessionId);
      const toSession = String(data.toSession ?? "");
      const to = this.state.players.get(toSession);
      if (!from || !to || toSession === client.sessionId) return;
      if (from.inVehicle || to.inVehicle) return;
      if (from.health <= 0) return;
      if (to.inBuilding && isHospital(to.buildingId)) return;

      const now = Date.now();
      if (now - (this.punchAt.get(client.sessionId) ?? 0) < PUNCH_COOLDOWN_MS) return;
      this.punchAt.set(client.sessionId, now);

      const dist = Math.hypot(from.x - to.x, from.z - to.z);
      if (dist > PUNCH_RANGE) return;

      const melee = gunSpec(from.gun);
      to.health = Math.max(0, to.health - (melee && !melee.ranged ? melee.damage : 18));
      to.sitting = false;
      to.lying = false;
      if (dist > 0.05) {
        const nx = (to.x - from.x) / dist;
        const nz = (to.z - from.z) / dist;
        to.x += nx * 1.05;
        to.z += nz * 1.05;
      }

      this.broadcast("melee", {
        fromSession: client.sessionId,
        toSession,
        health: to.health,
        x: to.x,
        z: to.z,
      });
    });

    this.onMessage("set-lock", (client, data: { kind?: string; id?: string; locked?: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.wallet) return;
      const locked = data.locked !== false;
      const id = String(data.id ?? "");

      if (data.kind === "car") {
        const vehicle = this.state.vehicles.get(id);
        if (!vehicle || vehicle.owner !== player.wallet) return;
        vehicle.locked = locked;
        void savePlayerVehicle(this.vehicleRow(vehicle));
        client.send("lock-result", { kind: "car", id, locked, name: vehicle.kind });
        return;
      }

      const home = this.state.homes.get(id);
      if (!home || home.owner !== player.wallet) return;
      home.locked = locked;
      void saveHomeAuction(this.toRow(home));
      client.send("lock-result", { kind: "home", id, locked, name: `home in ${home.city}` });
    });

this.onMessage("car-list", (client, data: { id?: string; list?: boolean; price?: number }) => {
      const player = this.state.players.get(client.sessionId);
      const vehicle = this.state.vehicles.get(String(data.id ?? ""));
      if (!player || !vehicle) return;
      const fail = (reason: string) => client.send("car-result", { id: vehicle.id, ok: false, reason });
      if (!player.wallet || vehicle.owner !== player.wallet) return fail("You do not own that car.");
      // Somebody behind the wheel would have the car move out from under them.
      if (vehicle.driver) return fail("Get out of it first.");

      if (data.list === false) {
        vehicle.forSale = false;
        vehicle.askingPrice = 0;
        void savePlayerVehicle(this.vehicleRow(vehicle));
        return client.send("car-result", { id: vehicle.id, ok: true, reason: "Listing withdrawn" });
      }
      const asking = clampAskingPrice(data.price);
      if (asking == null) return fail(`Set an asking price of at least ${MIN_ASKING_PRICE} ${CURRENCY}.`);
      vehicle.forSale = true;
      vehicle.askingPrice = asking;
      void savePlayerVehicle(this.vehicleRow(vehicle));
      client.send("car-result", {
        id: vehicle.id,
        ok: true,
        reason: `Listed at ${asking} ${CURRENCY} — first buyer takes it`,
      });
    });

    this.onMessage("car-buy", (client, data: { id?: string; txHash?: string }) => {
      void this.buyListedCar(client, String(data.id ?? ""), String(data.txHash ?? ""));
    });

        this.onMessage("buy-item", (client, data: { id?: string; txHash?: string }) => {
      void this.buyItem(client, String(data.id ?? ""), String(data.txHash ?? ""));
    });

    this.onMessage("buy-vehicle", (client, data: { kind?: string; city?: CityId; txHash?: string }) => {
      void this.buyVehicle(client, String(data.kind ?? ""), data.city, String(data.txHash ?? ""));
    });

this.onMessage("home-buy", (client, data: { id?: string; city?: CityId; txHash?: string }) => {
      void this.buyHome(client, String(data.id ?? ""), String(data.txHash ?? ""), data.city);
    });

    this.onMessage("home-list", (client, data: { id?: string; list?: boolean; price?: number; duration?: number }) => {
      this.setListing(client, String(data.id ?? ""), data.list !== false, data.price, data.duration);
    });

this.onMessage("home-name", (client, data: { id?: string; name?: string }) => {
      const player = this.state.players.get(client.sessionId);
      const home = this.state.homes.get(String(data.id ?? ""));
      if (!player || !home) return;
      if (!player.wallet || home.owner !== player.wallet) {
        client.send("home-result", { id: home.id, ok: false, reason: "You do not own this home." });
        return;
      }
      home.name = cleanHomeName(String(data.name ?? ""));
      void saveHomeAuction(this.toRow(home));
      client.send("home-result", { id: home.id, ok: true, name: home.name });
    });

        this.onMessage("friend-request", (client, data: { toSession?: string }) => {
      void this.sendFriendRequest(client, String(data.toSession ?? ""));
    });

    this.onMessage("friend-respond", (client, data: { wallet?: string; accept?: boolean }) => {
      void this.answerFriendRequest(client, String(data.wallet ?? ""), data.accept !== false);
    });

    this.onMessage("friend-remove", (client, data: { wallet?: string }) => {
      void this.dropFriend(client, String(data.wallet ?? ""));
    });

    // The world map shows the whole city, but interest management means the
    // client only holds nearby players. Send a snapshot on demand rather than
    // streaming 500 positions to everyone continuously.
    this.onMessage("request-roster", (client) => {
      const roster: { sessionId: string; name: string; wallet: string; x: number; z: number; city: string; indoors: boolean }[] = [];
      this.state.players.forEach((p, sessionId) => {
        roster.push({
          sessionId,
          name: p.name,
          wallet: p.wallet,
          x: p.x,
          z: p.z,
          city: p.city,
          indoors: p.inBuilding,
        });
      });
      client.send("roster", { roster, at: Date.now() });
    });

    this.onMessage("messages-read", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.wallet) void markMessagesRead(player.wallet, this.chainFor(client.sessionId));
    });

    this.setSimulationInterval(() => {
      this.state.players.forEach((player) => {
        if (player.inBuilding && isHospital(player.buildingId)) player.health = 100;
      });
    }, 200);

    // 5Hz is plenty: AOI_OUT sits 25 units beyond AOI_IN, which is far more
    // than anyone covers in 200ms, so nobody pops in late.
    if (INTEREST_MANAGEMENT) this.clock.setInterval(() => this.syncViews(), 200);
    // One RPC per distinct wallet per cycle, matching the holdings cache so a
    // refresh never re-reads something still fresh.
    this.clock.setInterval(() => void this.refreshHoldings(), HOLDINGS_CACHE_MS);
    this.clock.setInterval(() => this.sweepTrades(), 2000);

  }

  /**
   * Recomputes what each client can see. Every client gets its own player
   * unconditionally — a view-filtered map shows nothing that is not added, so
   * forgetting this would leave people unable to see themselves.
   */
  private syncViews() {
    if (this.state.players.size === 0) return;
    this.playerGrid.rebuild(this.state.players.values());
    for (const client of this.clients) this.syncViewFor(client);
  }

  /**
   * Recomputes what one client can see. Every client gets its own player
   * unconditionally — a view-filtered map shows nothing that is not added, so
   * forgetting this would leave people unable to see themselves.
   *
   * Called synchronously on join as well as on the timer: a client whose view
   * is still empty when the first patch goes out can receive a reference to an
   * entity it was never told about, and the decoder rejects the whole patch.
   */
  private syncViewFor(client: Client) {
    const me = this.state.players.get(client.sessionId);
    if (!me) return;
    const view = client.view ?? (client.view = new StateView());

    // Only add once. Re-adding a visible ref every tick queues duplicate ADD
    // operations and the client decoder trips over them.
    if (!view.has(me)) view.add(me);

    for (const other of this.playerGrid.near(me.x, me.z, AOI_IN)) {
      if (other === me) continue;
      const d = Math.hypot(other.x - me.x, other.z - me.z);
      const visible = view.has(other);
      if (shouldSee(d, visible)) {
        if (!visible) view.add(other);
      } else if (visible) {
        view.remove(other);
      }
    }

  }

  private sendBag(sessionId: string, player: PlayerState) {
    this.clients.find((c) => c.sessionId === sessionId)?.send("bag-sync", {
      inventory: player.inventory,
      tribute: player.tribute,
      gun: player.gun,
      pet: player.pet,
      accessories: player.accessories,
      // The client gates movement locally to keep walking responsive, so it
      // needs the tier the server is actually using. Without this it kept the
      // value it joined with: a balance that fell mid-session left the client
      // predicting "allowed" on every step while the server refused them, and
      // the player rubber-banded instead of being told why.
      accessTier: player.accessTier,
    });
  }

  private async syncFriends(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!player?.wallet || !client) return;
    const friends = await loadFriends(player.wallet, this.chainFor(sessionId));
    this.friendsOf.set(
      player.wallet,
      new Set(friends.filter((f) => f.status === "friend").map((f) => f.wallet)),
    );
    // Presence comes from the server: interest management means the client can
    // only see nearby players, so it cannot work this out for itself.
    client.send("friend-sync", {
      friends: friends.map((f) => ({ ...f, online: Boolean(this.playerByWallet(f.wallet)) })),
    });
  }

  private async sendFriendRequest(client: Client, toSession: string) {
    const from = this.state.players.get(client.sessionId);
    const to = this.state.players.get(toSession);
    if (!from || !to || toSession === client.sessionId) return;
    if (!from.wallet || !to.wallet) {
      client.send("friend-result", { ok: false, reason: "Both players need a connected wallet." });
      return;
    }

    const fromChain = this.chainFor(client.sessionId);
    const toChain = this.chainFor(toSession);
    const result = await createRequest(
      { wallet: from.wallet, chain: fromChain, name: from.name },
      { wallet: to.wallet, chain: toChain, name: to.name },
    );
    if (!result.ok) {
      client.send("friend-result", { ok: false, reason: result.reason });
      return;
    }

    // They had already asked you, so this closed the loop instead.
    const accepted = "accepted" in result && result.accepted;
    client.send("friend-result", {
      ok: true,
      reason: accepted ? `You and ${to.name} are now friends.` : `Friend request sent to ${to.name}.`,
    });
    await this.notify(to.wallet, toChain, {
      kind: accepted ? "friend" : "friend-request",
      body: accepted ? `You and ${from.name} are now friends.` : `${from.name} sent you a friend request.`,
    });
    await this.syncFriends(client.sessionId);
    await this.syncFriends(toSession);
  }

  private async answerFriendRequest(client: Client, requesterWallet: string, accept: boolean) {
    const me = this.state.players.get(client.sessionId);
    if (!me?.wallet || !requesterWallet) return;
    const myChain = this.chainFor(client.sessionId);

    const links = await loadFriends(me.wallet, myChain);
    const link = links.find((l) => l.wallet === requesterWallet && l.status === "incoming");
    if (!link) {
      client.send("friend-result", { ok: false, reason: "That request is no longer open." });
      return;
    }

    const result = await respondToRequest(
      { wallet: requesterWallet, chain: link.chain },
      { wallet: me.wallet, chain: myChain },
      accept,
    );
    if (!result.ok) {
      client.send("friend-result", { ok: false, reason: result.reason });
      return;
    }

    client.send("friend-result", {
      ok: true,
      reason: accept ? `You and ${link.name} are now friends.` : `Turned down ${link.name}.`,
    });
    if (accept) {
      await this.notify(requesterWallet, link.chain, {
        kind: "friend",
        body: `${me.name} accepted your friend request.`,
      });
    }
    await this.syncFriends(client.sessionId);
    const theirSession = this.playerByWallet(requesterWallet);
    if (theirSession) await this.syncFriends(theirSession.sessionId);
  }

  private async dropFriend(client: Client, wallet: string) {
    const me = this.state.players.get(client.sessionId);
    if (!me?.wallet || !wallet) return;
    const myChain = this.chainFor(client.sessionId);
    const links = await loadFriends(me.wallet, myChain);
    const link = links.find((l) => l.wallet === wallet);
    if (!link) return;
    await removeFriend({ wallet: me.wallet, chain: myChain }, { wallet, chain: link.chain });
    client.send("friend-result", { ok: true, reason: `Removed ${link.name}.` });
    await this.syncFriends(client.sessionId);
    const theirSession = this.playerByWallet(wallet);
    if (theirSession) await this.syncFriends(theirSession.sessionId);
  }

  /** Refresh presence for everyone online who counts this wallet as a friend. */
  private refreshFriendsOf(wallet: string) {
    if (!wallet) return;
    this.state.players.forEach((other, sessionId) => {
      if (!other.wallet || other.wallet === wallet) return;
      if (this.friendsOf.get(other.wallet)?.has(wallet)) void this.syncFriends(sessionId);
    });
  }

  private async deliverInbox(client: Client, player: PlayerState) {
    if (!player.wallet) return;
    const messages = await loadMessages(player.wallet, this.chainFor(client.sessionId));
    client.send("message-sync", { messages });
  }

/**
   * Confirms a purchase was actually paid for on-chain.
   *
   * Returns a reason to refuse, or null to go ahead. The price is the server's
   * own figure - taking it from the client would let anyone buy a car for a
   * penny. Claiming the hash is what stops the same payment buying twice.
   */
  private async requirePayment(
    player: PlayerState,
    chain: WalletChainId,
    opts: { txHash?: string; price: number; purpose: string; itemId?: string },
  ): Promise<string | null> {
    // No token configured: the game runs on the dev balance and nothing is paid.
    if (!tokenConfigured() || !paymentsConfigured()) return null;
    if (!player.wallet) return "Connect a wallet to buy anything.";
    if (!opts.txHash) return "That purchase was not paid for.";

    const check = await verifyPayment(opts.txHash, player.wallet, toBaseUnits(String(opts.price)));
    if (!check.ok) return check.reason;

    const claimed = await claimPayment({
      txHash: opts.txHash,
      address: player.wallet,
      chain,
      amount: check.amount,
      purpose: opts.purpose,
      itemId: opts.itemId,
    });
    if (!claimed) return "That payment has already been used.";
    return null;
  }

  private async adoptStoredTribute(client: Client, player: PlayerState) {
    if (!player.wallet) return;
    const stored = await fetchTribute(player.wallet, this.chainFor(client.sessionId));
    if (stored == null || stored === player.tribute) return;
    player.tribute = Math.max(0, Math.min(TRIBUTE_CAP, stored));
    this.sendBag(client.sessionId, player);
  }

  private static describeDuration(seconds: number) {
    if (seconds < 60) return `${seconds} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
    return `${Math.round(seconds / 86400)} days`;
  }

  private chainFor(sessionId: string): WalletChainId {
    return this.chains.get(sessionId) ?? DEFAULT_CHAIN;
  }

  /**
   * Disconnects any other session already signed in on this wallet. Called
   * before the joining player is added to state, so it can never evict itself.
   */
  private evictOtherSessions(wallet: string, keepSessionId: string) {
    if (!wallet) return;
    const stale: string[] = [];
    this.state.players.forEach((existing, sessionId) => {
      if (sessionId !== keepSessionId && existing.wallet === wallet) stale.push(sessionId);
    });
    for (const sessionId of stale) {
      const client = this.clients.find((c) => c.sessionId === sessionId);
      // Say why before the socket closes; onLeave alone gives the client no reason.
      client?.send("session-replaced", {});
      this.endTradeFor(sessionId, "The other citizen signed in elsewhere.");
      // Before the state entry goes, not after: onLeave fires once the socket
      // closes, and by then this lookup would find nothing and save nothing.
      // A page refresh always lands here rather than in a clean leave - the
      // browser opens the new socket before closing the old one - so without
      // this the position was thrown away on every single refresh.
      void this.rememberSpot(sessionId);
      this.releaseVehicle(sessionId);
      this.punchAt.delete(sessionId);
      this.knockedUntil.delete(sessionId);
      this.chains.delete(sessionId);
      this.state.players.delete(sessionId);
      client?.leave(SESSION_REPLACED);
      console.log(`[world] wallet ${wallet} signed in again — dropped session ${sessionId}`);
    }
  }

  /**
   * Whether this player may cross into a district.
   *
   * Holdings are the usual key, but owning property there is a second one that
   * does not expire with the token price. A player who qualified for Gas City,
   * bought a home and then watched their balance fall still owns that home -
   * locking them out would strand an asset they paid for behind a door they
   * cannot open, and they would have no way to reach it even to sell it.
   *
   * Ownership is read from live room state rather than the database: homes are
   * replicated in full to every client, so this is the same information the
   * client gates on, and the two cannot drift.
   */
  private mayEnter(player: PlayerState, city: CityId): boolean {
    return this.mayEnterAs(player.wallet, player.tribute, city);
  }

  /** The same rule during onJoin, before there is a PlayerState to ask. */
  private mayEnterAs(wallet: string, tribute: number, city: CityId): boolean {
    const required = tributeThresholds().find((row) => row.city === city)?.min ?? 0;
    if (tribute >= required) return true;
    return this.ownsHomeIn(wallet, city);
  }

  private ownsHomeIn(wallet: string, city: CityId): boolean {
    if (!wallet) return false;
    for (const home of this.state.homes.values()) {
      if (home.city === city && home.owner === wallet) return true;
    }
    return false;
  }

  /**
   * Closes sessions nobody is touching, and ones where the two have walked
   * apart. Without it a player who opened a trade and wandered off stays
   * flagged as trading and cannot start another one.
   */
  private sweepTrades() {
    const now = Date.now();
    for (const session of [...this.trades.values()]) {
      const a = this.state.players.get(session.a.sessionId);
      const b = this.state.players.get(session.b.sessionId);
      if (!a || !b) {
        this.closeTrade(session, "The other citizen left.");
        continue;
      }
      if (Math.hypot(a.x - b.x, a.z - b.z) > TRADE_RANGE) {
        this.closeTrade(session, "You walked too far apart.");
        continue;
      }
      if (now - session.touchedAt > TRADE_IDLE_MS) {
        this.closeTrade(session, "Trade timed out.");
      }
    }
  }

  /** Pushes the board to everyone standing in a station in that city. */
  private broadcastBlotter(city: string) {
    void recentReports(city).then((reports) => {
      for (const [sessionId, player] of this.state.players) {
        if (player.city !== city || !player.inBuilding || !isStation(player.buildingId)) continue;
        this.clients.find((c) => c.sessionId === sessionId)?.send("crime-list", { reports });
      }
    });
  }

  private tradeFor(sessionId: string): TradeSession | null {
    const id = this.tradeOf.get(sessionId);
    return id ? this.trades.get(id) ?? null : null;
  }

  /**
   * Each side is told its own stake and the other's, from its own point of
   * view, so neither client has to work out which half of the session it is.
   */
  private sendTradeState(session: TradeSession) {
    for (const side of [session.a, session.b]) {
      const them = otherSide(session, side.sessionId);
      const themPlayer = them ? this.state.players.get(them.sessionId) : null;
      if (!them) continue;
      this.clients.find((c) => c.sessionId === side.sessionId)?.send("trade-state", {
        withSession: them.sessionId,
        withName: themPlayer?.name ?? "citizen",
        yourItems: side.items,
        theirItems: them.items,
        youLocked: side.locked,
        theyLocked: them.locked,
      });
    }
  }

  /**
   * Moves both stakes at once, or moves nothing.
   *
   * Everything is validated against live inventories before a single item is
   * written, because the stakes were chosen earlier and a player may have sold
   * or traded one of them in between.
   */
  private settleTradeSession(session: TradeSession) {
    const a = this.state.players.get(session.a.sessionId);
    const b = this.state.players.get(session.b.sessionId);
    if (!a || !b) {
      this.closeTrade(session, "The other citizen left.");
      return;
    }
    if (Math.hypot(a.x - b.x, a.z - b.z) > TRADE_RANGE) {
      this.closeTrade(session, "Too far apart to trade.");
      return;
    }

    const result = settleTrade(a.inventory, session.a.items, b.inventory, session.b.items);
    if (!result.ok) {
      this.closeTrade(session, result.reason);
      return;
    }

    a.inventory = encodeInventory(result.aInventory);
    b.inventory = encodeInventory(result.bInventory);
    // Anything handed over cannot stay equipped on the player who gave it up.
    for (const [player, given] of [
      [a, session.a.items],
      [b, session.b.items],
    ] as const) {
      for (const id of given) {
        if (player.gun === id && !hasItem(decodeInventory(player.inventory), id)) player.gun = "";
        if (player.pet === id && !hasItem(decodeInventory(player.inventory), id)) player.pet = "";
      }
    }

    this.persistGoods(session.a.sessionId, a);
    this.persistGoods(session.b.sessionId, b);
    this.sendBag(session.a.sessionId, a);
    this.sendBag(session.b.sessionId, b);
    const names = { [session.a.sessionId]: b.name, [session.b.sessionId]: a.name };
    for (const side of [session.a, session.b]) {
      this.clients
        .find((c) => c.sessionId === side.sessionId)
        ?.send("trade-closed", { reason: `Traded with ${names[side.sessionId]}.`, done: true });
    }
    this.forgetTrade(session);
  }

  private closeTrade(session: TradeSession, reason: string) {
    for (const side of [session.a, session.b]) {
      this.clients.find((c) => c.sessionId === side.sessionId)?.send("trade-closed", { reason });
    }
    this.forgetTrade(session);
  }

  private forgetTrade(session: TradeSession) {
    this.trades.delete(session.id);
    this.tradeOf.delete(session.a.sessionId);
    this.tradeOf.delete(session.b.sessionId);
  }

  /** Called when a player leaves or is evicted; a half-open trade helps nobody. */
  private endTradeFor(sessionId: string, reason: string) {
    const session = this.tradeFor(sessionId);
    if (session) this.closeTrade(session, reason);
  }

  /**
   * What this wallet owns, from the server's own records.
   *
   * The stored inventory, merged with every item the payment receipts say was
   * paid for. The merge exists because inventory was previously kept in the
   * browser: a wallet can have receipts for a pistol and a cat while its
   * character row still shows only the accessories picked on the day it was
   * created. Receipts are the stronger evidence - nothing is written there
   * until a transfer has been verified on chain.
   *
   * Writes the reconciled result straight back, so this is self-healing: after
   * one join the character row is correct and the merge is a no-op.
   */
  private async ownedInventory(
    wallet: string,
    chain: WalletChainId,
    stored: CharacterRecord | null,
  ): Promise<InventoryStack[]> {
    if (!wallet) return [];
    const inventory = stored?.inventory ? [...stored.inventory] : [];
    let added = false;
    for (const id of await purchasedItemIds(wallet, chain)) {
      if (!isItemId(id)) continue;
      if (hasItem(inventory, id)) continue;
      inventory.push({ id, qty: 1 });
      added = true;
    }
    if (added || (stored && stored.inventory.length !== inventory.length)) {
      void saveCharacterState(wallet, chain, { inventory });
    }
    return inventory;
  }

  /** Persists a player's goods. Called wherever the server changes them. */
  private persistGoods(sessionId: string, player: PlayerState) {
    if (!player.wallet) return;
    void saveCharacterState(player.wallet, this.chainFor(sessionId), {
      inventory: decodeInventory(player.inventory),
      equippedGun: player.gun || null,
      equippedPet: player.pet || null,
      outfit: player.outfit || undefined,
      accessories: player.accessories ? player.accessories.split(",").filter(Boolean) : [],
    });
  }

  /** Exactly one session per wallet is live, so this is unambiguous. */
  private playerByWallet(wallet: string): { sessionId: string; player: PlayerState } | null {
    let found: { sessionId: string; player: PlayerState } | null = null;
    this.state.players.forEach((player, sessionId) => {
      if (!found && wallet && player.wallet === wallet) found = { sessionId, player };
    });
    return found;
  }

  /**
   * Tribute the server moves itself (escrow in, refund out) are written to the
   * character row as well as the live player, so they survive a refresh. The
   * wallet may not be connected, which is why the write is keyed by wallet.
   */
  private async moveTribute(wallet: string, chain: WalletChainId, delta: number) {
    if (!wallet) return;
    const online = this.playerByWallet(wallet);
    if (online) {
      online.player.tribute = Math.max(0, Math.min(TRIBUTE_CAP, online.player.tribute + delta));
      this.sendBag(online.sessionId, online.player);
      await writeTribute(wallet, chain, online.player.tribute);
      return;
    }
    const stored = await fetchTribute(wallet, chain);
    if (stored == null) return;
    await writeTribute(wallet, chain, Math.max(0, stored + delta));
  }

  private toRow(home: HomeState) {
    const lot = parseHomeId(home.id);
    return {
      lotGx: lot ? lot.gx : null,
      lotGz: lot ? lot.gz : null,
      homeId: home.id,
      city: home.city as CityId,
      ownerWallet: home.owner,
      ownerChain: (home.ownerChain || null) as WalletChainId | null,
      ownerName: home.ownerName,
      name: home.name,
      forSale: home.forSale,
      lastPrice: home.lastPrice,
      askingPrice: home.askingPrice,
      durationSeconds: home.durationSeconds,
      locked: home.locked,
      awaitingSeller: home.awaitingSeller,
      decideBy: home.decideBy,
      highBid: home.highBid,
      highBidderWallet: home.highBidderWallet,
      highBidderChain: (home.highBidderChain || null) as WalletChainId | null,
      highBidderName: home.highBidderName,
      endsAt: home.endsAt,
    };
  }

  /** Rows for a car we own, ready to persist. */
  private vehicleRow(vehicle: VehicleState) {
    return {
      id: vehicle.id,
      ownerWallet: vehicle.owner,
      ownerChain: (this.vehicleChains.get(vehicle.id) ?? DEFAULT_CHAIN) as WalletChainId,
      city: vehicle.city as CityId,
      kind: vehicle.kind,
      color: vehicle.color,
      x: vehicle.x,
      z: vehicle.z,
      rotY: vehicle.rotY,
      locked: vehicle.locked,
      forSale: vehicle.forSale,
      askingPrice: vehicle.askingPrice,
    };
  }

  private async restoreVehicles() {
    const rows = await loadPlayerVehicles();
    for (const row of rows) {
      const vehicle = new VehicleState();
      vehicle.id = row.id;
      vehicle.city = row.city;
      vehicle.x = row.x;
      vehicle.y = 0.55;
      vehicle.z = row.z;
      vehicle.rotY = row.rotY;
      vehicle.color = row.color;
      vehicle.kind = row.kind;
      vehicle.owner = row.ownerWallet;
      vehicle.locked = row.locked;
      vehicle.forSale = row.forSale;
      vehicle.askingPrice = row.askingPrice;
      // Nobody is behind the wheel after a restart.
      vehicle.driver = "";
      this.vehicleChains.set(row.id, row.ownerChain);
      this.state.vehicles.set(row.id, vehicle);
    }
    if (rows.length) console.log(`[tribe] restored ${rows.length} owned vehicle(s)`);
  }

  private async restoreAuctions() {
    const rows = await loadHomeAuctions();
    for (const row of rows) {
      const home = new HomeState();
      home.id = row.homeId;
      home.city = row.city;
      home.owner = row.ownerWallet;
      home.ownerChain = row.ownerChain ?? "";
      home.ownerName = row.ownerName;
      home.name = row.name ?? "";
      home.forSale = row.forSale;
      home.lastPrice = row.lastPrice;
      home.askingPrice = row.askingPrice;
      home.durationSeconds = row.durationSeconds;
      home.locked = row.locked;
      home.awaitingSeller = row.awaitingSeller;
      home.decideBy = row.decideBy;
      home.highBid = row.highBid;
      home.highBidderWallet = row.highBidderWallet;
      home.highBidderChain = row.highBidderChain ?? "";
      home.highBidderName = row.highBidderName;
      home.endsAt = row.endsAt;
      this.state.homes.set(home.id, home);
    }
    if (rows.length) console.log(`[tribe] restored ${rows.length} home auction(s)`);
    this.reportDriftedHomes(rows.map((row) => row.homeId));
    // Anything that ran out while the server was down closes on the next tick.
  }

  private setListing(client: Client, id: string, list: boolean, price?: number, duration?: number) {
    const player = this.state.players.get(client.sessionId);
    const home = this.state.homes.get(id);
    if (!player || !home || !isHomeId(id)) return;
    if (!player.wallet || home.owner !== player.wallet) {
      client.send("home-result", { id, ok: false, reason: "You do not own this home." });
      return;
    }
    if (list) {
      // The seller names the price; there is no automatic opening bid for a
      // home that already has an owner.
      const asking = clampAskingPrice(price);
      if (asking == null) {
        client.send("home-result", {
          id,
          ok: false,
          reason: `Set an asking price of at least ${MIN_ASKING_PRICE} ${CURRENCY}.`,
        });
        return;
      }
      // No duration: a listing is an asking price that stands until someone
      // pays it or the owner withdraws.
      home.askingPrice = asking;
    } else {
      home.askingPrice = 0;
    }
    home.forSale = list;
    void saveHomeAuction(this.toRow(home));
    void this.notify(player.wallet, this.chainFor(client.sessionId), {
      kind: "listed",
      homeId: id,
      body: list
        ? `You listed your ${CITIES[home.city as CityId]?.name ?? home.city} home at ${home.askingPrice} ${CURRENCY}. It sells to the first buyer who pays.`
        : `You withdrew your listing in ${CITIES[home.city as CityId]?.name ?? home.city}.`,
    });
    client.send("home-result", {
      id,
      ok: true,
      listed: list,
      reason: list
        ? `Listed at ${home.askingPrice} ${CURRENCY} — first buyer takes it`
        : "Listing withdrawn",
    });
  }

  /**
   * Stored auctions whose home no longer exists in world generation. Silent
   * drift here means someone owns a house that is not on the map any more, so
   * it is worth saying loudly rather than letting a player discover it.
   */
  private reportDriftedHomes(storedIds: string[]) {
    if (storedIds.length === 0) return;
    const live = new Set(allHomeIds());
    const orphans = storedIds.filter((id) => !live.has(id));
    if (orphans.length === 0) {
      console.log(`[tribe] home auctions verified — all ${storedIds.length} match a generated home`);
      return;
    }
    console.warn(
      `[tribe] WARNING: ${orphans.length} of ${storedIds.length} stored home auction(s) no longer match a generated home.`,
    );
    console.warn(`[tribe] orphaned ids: ${orphans.slice(0, 20).join(", ")}${orphans.length > 20 ? " …" : ""}`);
    console.warn("[tribe] re-match them by lot_gx/lot_gz in home_auctions before players notice.");
  }

/**
   * Buys a catalog item.
   *
   * The whole purchase is decided here: the price, the tier gate, whether they
   * already own a unique item, and whether it was paid for. The client used to
   * do all of this itself and simply report the result, which meant the store
   * was free to anyone willing to edit a number.
   */
  private async buyItem(client: Client, id: string, txHash: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const fail = (reason: string) => client.send("buy-item-result", { ok: false, reason });

    const item = catalogItem(id);
    if (!item) return fail("No such item.");
    // Retired stock is hidden from the store, but the id is still valid - it
    // has to be, or existing owners would lose theirs - so the sale is refused
    // here rather than relying on the client not to ask.
    if (item.listed === false) return fail(`${item.name} is no longer sold.`);
    // Clothes are exempt: the fashion house prices its stock, it does not gate
    // it by district. Everything else still needs the tier that sells it.
    if (isTierGated(item) && item.tier > player.accessTier) {
      return fail(`${item.name} needs tier ${item.tier}.`);
    }

    const inventory = decodeInventory(player.inventory);
    if (item.unique && hasItem(inventory, item.id)) return fail("You already own that.");
    if (player.tribute < item.price) {
      return fail(`${item.name} costs ${item.price} ${CURRENCY}. You have ${player.tribute}.`);
    }

    const chain = this.chainFor(client.sessionId);
    const unpaid = await this.requirePayment(player, chain, {
      txHash,
      price: item.price,
      purpose: "item",
      itemId: item.id,
    });
    if (unpaid) return fail(unpaid);

    if (!tokenConfigured()) {
      // Dev path with no token: bill the bookkeeping balance instead.
      await this.moveTribute(player.wallet, chain, -item.price);
      if (!player.wallet) player.tribute = Math.max(0, player.tribute - item.price);
    }

    player.inventory = encodeInventory(addItem(inventory, item.id));
    // Written before the player is told, so a crash between the two costs a
    // notification rather than the thing they just paid for.
    this.persistGoods(client.sessionId, player);
    this.sendBag(client.sessionId, player);
    client.send("buy-item-result", { ok: true, name: item.name });
    // Every purchase leaves a receipt, so the inbox is a full record of what a
    // wallet has spent - the on-screen notice is gone in a couple of seconds.
    void this.notify(player.wallet, chain, {
      kind: "bought",
      body: `You bought ${item.name} for ${item.price} ${CURRENCY}.`,
    });
  }

/** How many cars are owned and how many may ever be, for the car lot sign. */
  private broadcastFleet() {
    let sold = 0;
    this.state.vehicles.forEach((vehicle) => {
      if (vehicle.owner) sold++;
    });
    this.broadcast("fleet", { sold, cap: MAX_PLAYER_VEHICLES });
  }

/**
   * Buys a car another player has listed.
   *
   * Ownership moves, the fleet does not grow, so the world cap is untouched -
   * but the one-car rule still applies to the buyer, and the seller is freed to
   * buy again.
   */
  private async buyListedCar(client: Client, id: string, txHash: string) {
    const player = this.state.players.get(client.sessionId);
    const vehicle = this.state.vehicles.get(id);
    if (!player || !vehicle) return;
    const fail = (reason: string) => client.send("car-result", { id, ok: false, reason });

    if (!player.wallet) return fail("Connect a wallet to buy a car.");
    if (!vehicle.owner || !vehicle.forSale) return fail("That car is not for sale.");
    if (vehicle.owner === player.wallet) return fail("You already own it.");
    if (vehicle.driver) return fail("Somebody is driving it.");

    let owned = 0;
    this.state.vehicles.forEach((v) => {
      if (v.owner && v.owner === player.wallet) owned++;
    });
    if (owned > 0) return fail("You already own a car. One each.");

    const price = vehicle.askingPrice;
    if (player.tribute < price) {
      return fail(`That car costs ${price} ${CURRENCY}. You have ${player.tribute}.`);
    }

    const chain = this.chainFor(client.sessionId);
    const unpaid = await this.requirePayment(player, chain, {
      txHash,
      price,
      purpose: "car-resale",
      itemId: vehicle.id,
    });
    if (unpaid) return fail(unpaid);

    const seller = vehicle.owner;
    const sellerChain = this.vehicleChains.get(vehicle.id) ?? DEFAULT_CHAIN;
    vehicle.owner = player.wallet;
    vehicle.forSale = false;
    vehicle.askingPrice = 0;
    vehicle.locked = true;
    this.vehicleChains.set(vehicle.id, chain);
    await savePlayerVehicle(this.vehicleRow(vehicle));

    if (!tokenConfigured()) {
      await this.moveTribute(player.wallet, chain, -price);
      if (seller) await this.moveTribute(seller, sellerChain, price);
    }

    client.send("car-result", { id, ok: true, reason: `Bought for ${price} ${CURRENCY}.` });
    await this.notify(player.wallet, chain, {
      kind: "bought",
      body: `You bought a ${vehicle.kind} for ${price} ${CURRENCY}.`,
    });
    if (seller) {
      await this.notify(seller, sellerChain, {
        kind: "sold",
        body: `${player.name} bought your ${vehicle.kind} for ${price} ${CURRENCY}.`,
      });
    }
  }

  private async buyVehicle(client: Client, kind: string, city?: CityId, txHash?: string) {
    const player = this.state.players.get(client.sessionId);
    const spec = carSpec(kind);
    const lot = landmarkLot("dealer");
    if (!player || !spec || !lot) return;

    const where = (city && CITY_BOUNDS[city] ? city : player.city) as CityId;
    // You have to actually be standing on the forecourt.
    const centre = lotCentre(where, lot.gx, lot.gz);
    if (Math.hypot(player.x - centre.x, player.z - centre.z) > 26) {
      client.send("buy-result", { ok: false, reason: "Go to a car lot to buy a car." });
      return;
    }
    // One car per wallet. Owned vehicles are all restored into state on boot, so
    // counting state is counting everything that exists.
    let owned = 0;
    let fleet = 0;
    this.state.vehicles.forEach((vehicle) => {
      if (!vehicle.owner) return;
      fleet++;
      if (player.wallet && vehicle.owner === player.wallet) owned++;
    });
    if (owned > 0) {
      client.send("buy-result", { ok: false, reason: "You already own a car. One each." });
      return;
    }
    if (fleet >= MAX_PLAYER_VEHICLES) {
      client.send("buy-result", {
        ok: false,
        reason: `Every car in the city is spoken for - ${MAX_PLAYER_VEHICLES} of ${MAX_PLAYER_VEHICLES} sold.`,
      });
      return;
    }
    if (player.tribute < spec.price) {
      client.send("buy-result", {
        ok: false,
        reason: `A ${spec.name} costs ${spec.price} ${CURRENCY}. You have ${player.tribute}.`,
      });
      return;
    }

    const chain = this.chainFor(client.sessionId);
    const unpaid = await this.requirePayment(player, chain, {
      txHash,
      price: spec.price,
      purpose: "vehicle",
      itemId: spec.kind,
    });
    if (unpaid) {
      client.send("buy-result", { ok: false, reason: unpaid });
      return;
    }

    if (!tokenConfigured()) {
      // Dev path with no token: bill the bookkeeping balance instead.
      await this.moveTribute(player.wallet, chain, -spec.price);
      if (!player.wallet) {
        player.tribute = Math.max(0, player.tribute - spec.price);
        this.sendBag(client.sessionId, player);
      }
    }

    // Park it on the street at the front of the lot, nudged along so consecutive
    // purchases do not land on top of each other. Offset by the size of the
    // fleet, not by what this player owns: one car each means they never have a
    // second, but two different buyers still need parking beside one another.
    const vehicle = new VehicleState();
    vehicle.id = `veh-${client.sessionId}-${Date.now().toString(36)}`;
    vehicle.city = where;
    vehicle.x = centre.x + ((fleet % 3) - 1) * 4.2;
    vehicle.y = 0.55;
    vehicle.z = centre.z + 14.5;
    vehicle.rotY = 0;
    vehicle.color = spec.color;
    vehicle.kind = spec.kind;
    vehicle.owner = player.wallet;
    vehicle.locked = true;
    this.vehicleChains.set(vehicle.id, this.chainFor(client.sessionId));
    this.state.vehicles.set(vehicle.id, vehicle);
    await savePlayerVehicle(this.vehicleRow(vehicle));

    client.send("buy-result", { ok: true, name: spec.name, price: spec.price });
    this.broadcastFleet();
    void this.notify(player.wallet, this.chainFor(client.sessionId), {
      kind: "bought",
      body: `You bought a ${spec.name} in ${CITIES[where].name} for ${spec.price} ${CURRENCY}.`,
    });
  }

  /**
   * Buys a home outright.
   *
   * There is no auction. A home the city still owns has a fixed price derived
   * from its district and how big the building is, the buyer signs one transfer,
   * and ownership moves the moment that payment is verified. Bidding needed
   * escrow, a clock, outbid refunds and a seller decision - all of which existed
   * to discover a price that is now simply known.
   */
  private async buyHome(client: Client, id: string, txHash: string, city?: CityId) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isHomeId(id)) return;
    const fail = (reason: string) => client.send("home-result", { id, ok: false, reason });

    const wallet = player.wallet;
    if (!wallet) return fail("Connect a wallet to buy a home.");
    const chain = this.chainFor(client.sessionId);

    const home = this.state.homes.get(id);
    if (home?.owner === wallet) return fail("You already own this home.");
    if (home?.owner && !home.forSale) return fail(`This home belongs to ${home.ownerName}.`);

    const lot = parseHomeId(id);
    if (!lot) return fail("No such home.");
    // An owner's asking price when it is listed, otherwise the city's price for
    // a home of that size in that district. Never a figure from the client.
    const price = home?.owner && home.forSale && home.askingPrice > 0 ? home.askingPrice : homePrice(lot.city, lot.gx, lot.gz);

    if (player.tribute < price) {
      return fail(`That home costs ${price} ${CURRENCY}. You have ${player.tribute}.`);
    }

    const unpaid = await this.requirePayment(player, chain, {
      txHash,
      price,
      purpose: "home",
      itemId: id,
    });
    if (unpaid) return fail(unpaid);

    const seller = home?.owner ?? "";
    const sellerChain = (home?.ownerChain || DEFAULT_CHAIN) as WalletChainId;
    const record = home ?? new HomeState();
    record.id = id;
    record.city = (city && CITY_BOUNDS[city] ? city : lot.city) as string;
    record.owner = wallet;
    record.ownerChain = chain;
    record.ownerName = player.name;
    record.lastPrice = price;
    record.forSale = false;
    record.askingPrice = 0;
    record.locked = true;
    if (!home) this.state.homes.set(id, record);

    if (!tokenConfigured()) {
      // Dev path with no token: move the bookkeeping balance instead.
      await this.moveTribute(wallet, chain, -price);
      if (seller) await this.moveTribute(seller, sellerChain, price);
    }

    await saveHomeAuction(this.toRow(record));
    this.broadcast("home-sold", { id, owner: wallet, ownerName: player.name, price });

    await this.notify(wallet, chain, {
      kind: "bought",
      homeId: id,
      body: `You bought a home in ${CITIES[record.city as CityId]?.name ?? record.city} for ${price} ${CURRENCY}.`,
    });
    if (seller && seller !== wallet) {
      await this.notify(seller, sellerChain, {
        kind: "sold",
        homeId: id,
        body: `${player.name} bought your ${CITIES[record.city as CityId]?.name ?? record.city} home for ${price} ${CURRENCY}.`,
      });
    }
    client.send("home-result", { id, ok: true, price });
  }

  /** Push a message to a wallet: stored for later, and delivered now if online. */
  private async notify(
    wallet: string,
    chain: WalletChainId,
    message: { kind: MessageKind; body: string; homeId?: string },
  ) {
    if (!wallet) return;
    const saved = await saveMessage(wallet, chain, message);
    const online = this.playerByWallet(wallet);
    if (online) {
      this.clients.find((c) => c.sessionId === online.sessionId)?.send("message-new", saved);
    }
  }


  private completeSale(home: HomeState, seller: string) {
    const sellerChain = (home.ownerChain || DEFAULT_CHAIN) as WalletChainId;
    const price = home.highBid;
    const buyerWallet = home.highBidderWallet;
    const buyerChain = (home.highBidderChain || DEFAULT_CHAIN) as WalletChainId;
    const buyerName = home.highBidderName;

    home.owner = buyerWallet;
    home.ownerChain = home.highBidderChain;
    home.ownerName = buyerName;
    home.forSale = false;
    home.lastPrice = price;
    home.askingPrice = 0;
    // Hand it over secured; the new owner can open it up if they want.
    home.locked = true;
    home.durationSeconds = 0;
    home.awaitingSeller = false;
    home.decideBy = 0;
    home.endsAt = 0;
    home.highBid = 0;
    home.highBidderWallet = "";
    home.highBidderChain = "";
    home.highBidderName = "";

    if (seller && seller !== buyerWallet) {
      void this.moveTribute(seller, sellerChain, price);
      void this.notify(seller, sellerChain, {
        kind: "sold",
        homeId: home.id,
        body: `You sold your ${home.city} home to ${buyerName} for ${price} ${CURRENCY}.`,
      });
    }
    void this.notify(buyerWallet, buyerChain, {
      kind: "bought",
      homeId: home.id,
      body: `You bought a home in ${CITIES[home.city as CityId]?.name ?? home.city} for ${price} ${CURRENCY}.`,
    });
    void saveHomeAuction(this.toRow(home));
    this.broadcast("home-sold", {
      id: home.id,
      city: home.city,
      owner: home.owner,
      ownerName: home.ownerName,
      name: home.name,
      seller,
      bid: price,
    });
  }


  /**
   * Access tier from $TRIBE held, cached briefly so a join rush does not turn
   * into one RPC round trip per player.
   *
   * Fails closed: any lookup error is tier 1, never the tier the client asked
   * for. This gate is the only thing standing between a wallet with no tokens
   * and the top district.
   */
  private async resolveHoldings(wallet: string, chain: WalletChainId): Promise<Holdings> {
    if (!wallet) return { tier: 1, balance: 0 };
    const key = `${chain}:${wallet.toLowerCase()}`;
    const cached = this.holdingsCache.get(key);
    if (cached && cached.at > Date.now() - HOLDINGS_CACHE_MS) return cached;
    let holdings: Holdings = { tier: 1, balance: 0 };
    try {
      const lookup = await startingCityForWallet(wallet, chain);
      holdings = { tier: CITIES[lookup.city].tier, balance: lookup.balance };
    } catch (error) {
      console.warn("[tribe] holdings lookup failed, defaulting to tier 1", error);
    }
    this.holdingsCache.set(key, { ...holdings, at: Date.now() });
    return holdings;
  }

  /**
   * Re-reads every connected wallet and pushes any change to that client.
   *
   * Tribute is the token in the player's own wallet, so the balance moves
   * without the game doing anything - they can buy or send $TRIBE in another
   * tab. Polling keeps the HUD honest, and a tier change is applied too, so
   * buying your way into a district takes effect without reconnecting.
   */
  private async refreshHoldings() {
    if (!tokenConfigured()) return;
    const seen = new Set<string>();
    for (const [sessionId, player] of this.state.players) {
      if (!player.wallet || seen.has(player.wallet)) continue;
      seen.add(player.wallet);
      const chain = this.chainFor(sessionId);
      this.holdingsCache.delete(`${chain}:${player.wallet.toLowerCase()}`);
      const { tier, balance } = await this.resolveHoldings(player.wallet, chain);
      const tierChanged = player.accessTier !== tier;
      const balanceChanged = player.tribute !== balance;
      player.accessTier = tier;
      // Same cadence as the holdings read: a killed process never runs onLeave.
      void this.rememberSpot(sessionId);
      player.tribute = balance;
      // A live gate-threshold change can move the player to another tier while
      // their wallet balance stays exactly the same. The client predicts gate
      // access locally, so it must receive either kind of holdings change.
      if (tierChanged || balanceChanged) this.sendBag(sessionId, player);
    }
  }

  async onJoin(client: Client, options: JoinOptions = {}) {
    const chain = options.chain ?? DEFAULT_CHAIN;
    // Never options.accessTier. The client asks to spawn somewhere; holdings decide.
    const { tier: accessTier, balance } = await this.resolveHoldings(options.wallet ?? "", chain);
    const requested = (options.city && CITY_BOUNDS[options.city] ? options.city : "trench") as CityId;
    const wallet = options.wallet ?? "";
    const city = this.mayEnterAs(wallet, balance, requested) ? requested : "trench";

    // Back where they left off, if they can still stand there. Holdings may have
    // fallen since, so a saved spot inside a district they no longer reach falls
    // back to the spawn rather than dropping them somewhere they cannot leave.
    // The previous session is usually still live at this point, because a page
    // refresh opens the new socket before the old one closes. Its in-memory
    // position is both exact and available now; the save it is about to make
    // lands after this read, so going to the database first would return the
    // spot from the session before last.
    const stored = wallet ? await fetchCharacter(wallet, chain) : null;
    const live = options.wallet ? this.playerByWallet(options.wallet) : null;
    const saved: LastSpot | null =
      live && !live.player.inBuilding
        ? { city: live.player.city as CityId, x: live.player.x, z: live.player.z }
        : options.wallet
          ? await fetchLastSpot(options.wallet, chain)
          : null;
    const savedCity = saved ? cityAtPosition(saved.x, saved.z) : "void";
    const canStand =
      saved !== null &&
      savedCity !== "void" &&
      (savedCity === "gate" || this.mayEnterAs(wallet, balance, savedCity as CityId));
    const spawn = canStand ? ([saved.x, CITY_BOUNDS[city].spawn[1], saved.z] as const) : CITY_BOUNDS[city].spawn;
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.name = (options.name || "citizen").slice(0, 16);
    player.wallet = options.wallet ?? "";
    // The district they are actually standing in, which is not always the one
    // they asked to spawn in once a saved spot is restored.
    player.city = canStand && savedCity !== "gate" ? (savedCity as CityId) : city;
    player.accessTier = accessTier;
    player.x = spawn[0];
    player.y = spawn[1];
    player.z = spawn[2];
    // Owned goods come from the server, never from the joining client.
    //
    // This used to be `options.inventory` - whatever the browser sent. Items
    // bought with real $TRIBE therefore lived in localStorage: invisible on
    // another machine, gone when site data was cleared, and forgeable by a
    // crafted client. The database is the record now, reconciled once against
    // the payment receipts so nothing bought before this change is lost.
    const owned = await this.ownedInventory(wallet, chain, stored);
    player.inventory = encodeInventory(owned);
    player.bodyType = options.bodyType ?? "regular";
    player.skinTone = options.skinTone ?? "#F6D7B0";
    // Free outfits need no receipt; paid ones do. Character creation lets you
    // pick any of them, so without this a Valhalla Gold jacket cost nothing.
    const wanted = options.outfit ?? "hi-vis";
    player.outfit = isOutfitId(wanted) && ownsOutfit(owned, wanted) ? wanted : "hi-vis";
    player.pantsColor = options.pantsColor ?? "#3A3A3A";
    player.shoe = options.shoe ?? "sneakers";
    player.shoeColor = options.shoeColor ?? "#111111";
    player.headwear = options.headwear ?? "hardhat";
    player.accessories = (options.accessories ?? "")
      .split(",")
      .filter((id) => id && hasItem(owned, id as never))
      .join(",");
    const health = Number(options.health ?? options.brokemeter);
    player.health = Number.isFinite(health) ? Math.max(0, Math.min(100, health)) : 100;
    // Tribute IS the token in the player's wallet, so the balance is read from
    // the chain rather than granted or stored. The dev grant only stands in when
    // no token is configured, so the game is still playable without one.
    player.tribute = tokenConfigured() ? balance : TRIBUTE_DEV_GRANT;
    // What you carry is checked against what you own, for the same reason the
    // inventory is: a gun, a pet, an accessory and half the outfits are all
    // bought with $TRIBE, and every one of these used to be taken on the
    // client's word. A rifle claimed here shoots with a rifle's range.
    player.gun = hasItem(owned, (options.gun ?? "") as never) ? options.gun ?? "" : "";
    player.pet = hasItem(owned, (options.pet ?? "") as never) ? options.pet ?? "" : "";
    this.chains.set(client.sessionId, chain);
    this.allowTeleport(client.sessionId);
    // One live session per wallet. Two tabs on the same wallet would each hold
    // their own copy of the Tribute balance, so escrow taken from one would be
    // invisible to the other and the stale tab could spend it twice.
    this.evictOtherSessions(player.wallet, client.sessionId);
    this.state.players.set(client.sessionId, player);
    if (INTEREST_MANAGEMENT) {
      client.view = new StateView();
      // Build the full view before the first patch, not on the next 200ms tick.
      this.playerGrid.rebuild(this.state.players.values());
      this.syncViewFor(client);
    }
    console.log(`[world] ${player.name} joined ${city} (tier ${player.accessTier})`);

    // The gate thresholds the server actually enforces. The client keeps its own
    // copy from VITE_CITY_MIN_TRIBE_*, but that is a separate env that can drift
    // from this one - and a gate message quoting a figure nobody is enforcing is
    // worse than no figure at all.
    client.send("gates", { thresholds: tributeThresholds() });

    // Always push the balance: the client seeds one from its local character
    // record, and nothing else would correct it.
    this.sendBag(client.sessionId, player);
    this.broadcastFleet();
    if (!tokenConfigured()) void this.adoptStoredTribute(client, player);
    void this.deliverInbox(client, player);
    void this.syncFriends(client.sessionId);
    this.refreshFriendsOf(player.wallet);

    const supabase = getSupabase();
    if (supabase) {
      void supabase.from("presence").upsert({
        session_id: client.sessionId,
        wallet: player.wallet,
        city,
        updated_at: new Date().toISOString(),
      });
    }
  }

/**
   * Writes down where a player is standing, so signing back in returns them
   * there rather than to the district spawn.
   *
   * Indoors is skipped: interiors live far above the map, and saving that would
   * put them inside a building they may no longer own. The last outdoor spot is
   * the useful one.
   */
  private rememberSpot(sessionId: string): Promise<SpotSave> {
    const player = this.state.players.get(sessionId);
    if (!player?.wallet) return Promise.resolve({ ok: false, reason: "no-wallet" });
    if (player.inBuilding) return Promise.resolve({ ok: false, reason: "indoors" });
    const city = cityAtPosition(player.x, player.z);
    if (city === "void") return Promise.resolve({ ok: false, reason: "nowhere" });
    const where = (city === "gate" ? player.city : city) as CityId;
    return saveLastSpot(player.wallet, this.chainFor(sessionId), {
      city: where,
      x: player.x,
      z: player.z,
    }).then((ok) => (ok ? { ok: true, city: where } : { ok: false, reason: "offline" }));
  }

  onLeave(client: Client) {
    this.sendToNearbyVoiceClients(client, "voice-left", { sessionId: client.sessionId });
    this.endTradeFor(client.sessionId, "The other citizen left.");
    void this.rememberSpot(client.sessionId);
    this.releaseVehicle(client.sessionId);
    this.punchAt.delete(client.sessionId);
    this.knockedUntil.delete(client.sessionId);
    this.chains.delete(client.sessionId);
    this.moveBudget.delete(client.sessionId);
    this.moveGraceUntil.delete(client.sessionId);
    const leaving = this.state.players.get(client.sessionId);
    const leavingWallet = leaving?.wallet ?? "";
    // Drop them from every view that still holds them, so no client is left
    // referencing an entity that no longer exists.
    if (leaving && INTEREST_MANAGEMENT) {
      for (const other of this.clients) other.view?.remove(leaving);
    }
    this.state.players.delete(client.sessionId);
    this.friendsOf.delete(leavingWallet);
    this.refreshFriendsOf(leavingWallet);
  }

  onDispose() {
    liveWorlds = Math.max(0, liveWorlds - 1);
  }

  /** Suspends the speed check briefly, for movement the server itself causes. */
  private allowTeleport(sessionId: string) {
    this.moveGraceUntil.set(sessionId, Date.now() + MOVE_GRACE_MS);
    this.moveBudget.delete(sessionId);
  }

  private releaseVehicle(sessionId: string) {
    this.allowTeleport(sessionId);
    const player = this.state.players.get(sessionId);
    if (player) {
      player.inVehicle = false;
      player.vehicleId = "";
    }
    this.state.vehicles.forEach((vehicle) => {
      if (vehicle.driver === sessionId) {
        vehicle.driver = "";
        this.vehicleMotion.delete(vehicle.id);
        this.vehicleSavedAt.delete(vehicle.id);
        // Remember where it was parked, not where it was bought.
        if (vehicle.owner) void savePlayerVehicle(this.vehicleRow(vehicle));
      }
    });
  }

  private applyVehicleImpacts(
    driverSession: string,
    vehicleId: string,
    x: number,
    z: number,
    rotY: number,
    speed: number,
    previousX: number,
    previousZ: number,
    now: number,
  ) {
    const moveX = x - previousX;
    const moveZ = z - previousZ;
    const moveLength = Math.hypot(moveX, moveZ);
    const dirX = moveLength > 0.01 ? moveX / moveLength : Math.sin(rotY);
    const dirZ = moveLength > 0.01 ? moveZ / moveLength : Math.cos(rotY);
    this.state.players.forEach((target, targetSession) => {
      if (
        targetSession === driverSession ||
        target.inVehicle ||
        target.inBuilding ||
        target.health <= 0 ||
        (this.knockedUntil.get(targetSession) ?? 0) > now
      )
        return;
      const dx = target.x - x;
      const dz = target.z - z;
      const across = dx * Math.cos(rotY) - dz * Math.sin(rotY);
      const along = dx * Math.sin(rotY) + dz * Math.cos(rotY);
      if (Math.abs(across) > 1.65 || Math.abs(along) > 3.15) return;

      const impactKey = `${vehicleId}:${targetSession}`;
      if (now - (this.vehicleImpactAt.get(impactKey) ?? 0) < 1400) return;
      this.vehicleImpactAt.set(impactKey, now);
      const damage = Math.round(Math.min(55, 8 + (speed - VEHICLE_HIT_MIN_SPEED) * 3.5));
      const knockDistance = Math.min(4.5, 1.4 + speed * 0.14);
      const knockedMs = Math.round(Math.min(2900, 1650 + speed * 55));
      this.knockedUntil.set(targetSession, now + knockedMs);
      target.health = Math.max(0, target.health - damage);
      target.sitting = false;
      target.lying = false;
      target.x += dirX * knockDistance;
      target.z += dirZ * knockDistance;
      this.broadcast("vehicle-hit", {
        vehicleId,
        driverSession,
        targetSession,
        health: target.health,
        damage,
        speed,
        x: target.x,
        z: target.z,
        knockedMs,
      });
    });
  }

  private vehicleBlocksPlayerMove(fromX: number, fromZ: number, toX: number, toZ: number, city?: string) {
    let blocked = false;
    this.state.vehicles.forEach((vehicle) => {
      if (blocked) return;
      // Cars in another district cannot be in your way, and this runs on every
      // move message, so skipping them early is the whole optimisation.
      if (city && vehicle.city !== city) return;
      const depthAt = (x: number, z: number) => {
        const dx = x - vehicle.x;
        const dz = z - vehicle.z;
        const across = Math.abs(dx * Math.cos(vehicle.rotY) - dz * Math.sin(vehicle.rotY));
        const along = Math.abs(dx * Math.sin(vehicle.rotY) + dz * Math.cos(vehicle.rotY));
        return Math.min(1.6 - across, 3.15 - along);
      };
      const nextDepth = depthAt(toX, toZ);
      if (nextDepth <= 0) return;
      const currentDepth = depthAt(fromX, fromZ);
      if (currentDepth <= 0 || nextDepth >= currentDepth) blocked = true;
    });
    return blocked;
  }

  private vehicleIntersectsVehicle(movingId: string, x: number, z: number, rotY: number, kind: string) {
    const moving = this.state.vehicles.get(movingId);
    let blocked = false;
    this.state.vehicles.forEach((other, otherId) => {
      if (blocked || otherId === movingId) return;
      if (!vehiclesOverlap(x, z, rotY, kind, other.x, other.z, other.rotY, other.kind)) return;
      if (moving && vehiclesOverlap(moving.x, moving.z, moving.rotY, kind, other.x, other.z, other.rotY, other.kind)) {
        const oldDistance = Math.hypot(moving.x - other.x, moving.z - other.z);
        const newDistance = Math.hypot(x - other.x, z - other.z);
        if (newDistance > oldDistance) return;
      }
      blocked = true;
    });
    return blocked;
  }

  private canVoice(fromSession: string, toSession: string) {
    const from = this.state.players.get(fromSession);
    const to = this.state.players.get(toSession);
    if (!from || !to) return false;
    if (from.inBuilding !== to.inBuilding) return false;
    if (from.inBuilding && from.buildingId !== to.buildingId) return false;
    return Math.hypot(from.x - to.x, from.z - to.z) <= VOICE_SIGNAL_RANGE;
  }

  private sendToNearbyVoiceClients(client: Client, type: "voice-ready" | "voice-left", payload: object) {
    for (const other of this.clients) {
      if (other.sessionId !== client.sessionId && this.canVoice(client.sessionId, other.sessionId)) {
        other.send(type, payload);
      }
    }
  }
}
