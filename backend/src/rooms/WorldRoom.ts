import { Room, type Client } from "@colyseus/core";
import {
  CITY_BOUNDS,
  CITIES,
  canEnterCity,
  DEFAULT_CHAIN,
  cityAtPosition,
  gunSpec,
  insideCityWalls,
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
} from "@the-block/shared";
import { PlayerState, VehicleState, ChatLine, HomeState, WorldState } from "../schema/index";
import {
  auctionSeconds,
  bidIncrement,
  clampAskingPrice,
  isHomeId,
  MIN_ASKING_PRICE,
  minAuctionSeconds,
  MAX_AUCTION_SECONDS,
  acceptWindowSeconds,
  clampDuration,
  nextBidFor,
  openingBid,
} from "../services/homeAuctions";
import { getSupabase } from "../services/supabase";
import {
  fetchCredits,
  loadHomeAuctions,
  loadPlayerVehicles,
  saveHomeAuction,
  savePlayerVehicle,
  writeCredits,
} from "../services/db";
import { CREDIT_CAP } from "../services/liveEnv";
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
  credits?: number;
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

function isHospital(buildingId: string) {
  return buildingId.includes("hospital");
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

export class WorldRoom extends Room<WorldState> {
  maxClients = 80;
  patchRate = 50;
  private punchAt = new Map<string, number>();
  private vehicleMotion = new Map<string, { x: number; z: number; at: number }>();
  private vehicleImpactAt = new Map<string, number>();
  private knockedUntil = new Map<string, number>();
  private chains = new Map<string, WalletChainId>();
  private vehicleChains = new Map<string, WalletChainId>();

  onCreate() {
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

    this.onMessage("move", (client, data: { x: number; y: number; z: number; rotY: number; sitting?: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inVehicle) return;
      if ((this.knockedUntil.get(client.sessionId) ?? 0) > Date.now()) return;

      const zone = cityAtPosition(data.x, data.z);
      const walled = insideCityWalls(data.x, data.z);
      if (zone === "void") return;
      if (!player.inBuilding && this.vehicleBlocksPlayerMove(player.x, player.z, data.x, data.z)) return;

      // Gating applies at the wall line, matching the client. The ring road
      // between the wall and the district edge is open to everyone.
      if (walled && !canEnterCity(player.accessTier, walled)) {
        client.send("gate-denied", {
          city: walled,
          requiredTier: CITIES[walled].tier,
          yourTier: player.accessTier,
        });
        return;
      }
      if (zone !== "gate") player.city = zone;

      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.rotY = data.rotY;
      player.sitting = Boolean(data.sitting);
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
      const walledZone = insideCityWalls(x, z);
      if (walledZone && !canEnterCity(player.accessTier, walledZone)) return;
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
      if (vehicle.driver) return;
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

      player.inBuilding = true;
      player.buildingId = id;
      if (isHospital(id)) player.health = 100;
    });

    this.onMessage("exit-building", (client) => {
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

    this.onMessage("trade-request", (client, data: { toSession: string; item: string }) => {
      const from = this.state.players.get(client.sessionId);
      const toSession = String(data.toSession ?? "");
      const to = this.state.players.get(toSession);
      const item = String(data.item ?? "");
      if (!from || !to || toSession === client.sessionId || !isItemId(item)) return;
      if (!hasItem(decodeInventory(from.inventory), item)) return;
      const dist = Math.hypot(from.x - to.x, from.z - to.z);
      if (dist > 16) return;
      this.clients.find((c) => c.sessionId === toSession)?.send("trade-request", {
        fromSession: client.sessionId,
        fromName: from.name,
        item,
      });
    });

    this.onMessage("trade-respond", (client, data: { fromSession: string; accept: boolean; item?: string }) => {
      const to = this.state.players.get(client.sessionId);
      const fromSession = String(data.fromSession ?? "");
      const from = this.state.players.get(fromSession);
      const item = String(data.item ?? "");
      if (!from || !to) return;
      if (!data.accept || !isItemId(item)) {
        this.clients.find((c) => c.sessionId === fromSession)?.send("trade-result", {
          toSession: client.sessionId,
          accept: false,
          item,
        });
        return;
      }
      const taken = takeItem(decodeInventory(from.inventory), item);
      if (!taken) {
        client.send("trade-result", { toSession: fromSession, accept: false, item, reason: "gone" });
        return;
      }
      from.inventory = encodeInventory(taken);
      to.inventory = encodeInventory(addItem(decodeInventory(to.inventory), item));
      if (from.gun === item) from.gun = "";
      if (from.pet === item) from.pet = "";
      const bagFrom = { inventory: from.inventory, credits: from.credits, gun: from.gun, pet: from.pet, accessories: from.accessories };
      const bagTo = { inventory: to.inventory, credits: to.credits, gun: to.gun, pet: to.pet, accessories: to.accessories };
      this.clients.find((c) => c.sessionId === fromSession)?.send("bag-sync", bagFrom);
      client.send("bag-sync", bagTo);
      this.clients.find((c) => c.sessionId === fromSession)?.send("trade-result", {
        toSession: client.sessionId,
        accept: true,
        item,
      });
    });

    this.onMessage("loadout", (client, data: { inventory?: string; credits?: number; gun?: string; pet?: string; accessories?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof data.inventory === "string") player.inventory = data.inventory.slice(0, 4000);
      // Only ever accept a decrease. A reconnecting client replays whatever
      // credits it had cached, which would otherwise undo auction escrow.
      if (typeof data.credits === "number" && data.credits <= player.credits) {
        player.credits = Math.max(0, Math.min(CREDIT_CAP, data.credits));
        // Mirror spending to the character row so the stored balance stays the
        // authoritative one for adoptStoredCredits on the next join.
        if (player.wallet) void writeCredits(player.wallet, this.chainFor(client.sessionId), player.credits);
      }
      if (typeof data.gun === "string") player.gun = data.gun.slice(0, 24);
      if (typeof data.pet === "string") player.pet = data.pet.slice(0, 24);
      if (typeof data.accessories === "string") player.accessories = data.accessories.slice(0, 120);
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

    this.onMessage("buy-vehicle", (client, data: { kind?: string; city?: CityId }) => {
      void this.buyVehicle(client, String(data.kind ?? ""), data.city);
    });

    this.onMessage("home-bid", (client, data: { id?: string; city?: CityId }) => {
      void this.placeBid(client, String(data.id ?? ""), data.city);
    });

    this.onMessage("home-list", (client, data: { id?: string; list?: boolean; price?: number; duration?: number }) => {
      this.setListing(client, String(data.id ?? ""), data.list !== false, data.price, data.duration);
    });

    this.onMessage("home-decide", (client, data: { id?: string; accept?: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      const home = this.state.homes.get(String(data.id ?? ""));
      if (!player || !home) return;
      if (!player.wallet || home.owner !== player.wallet) {
        client.send("home-result", { id: home.id, ok: false, reason: "You do not own this home." });
        return;
      }
      if (!home.awaitingSeller) {
        client.send("home-result", { id: home.id, ok: false, reason: "There is no offer to answer." });
        return;
      }
      void this.resolveOffer(home, data.accept !== false, "seller");
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

    this.onMessage("messages-read", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.wallet) void markMessagesRead(player.wallet, this.chainFor(client.sessionId));
    });

    this.setSimulationInterval(() => {
      this.state.players.forEach((player) => {
        if (player.inBuilding && isHospital(player.buildingId)) player.health = 100;
      });
    }, 200);

    this.clock.setInterval(() => {
      // Re-read each tick so .env edits take effect without a restart.
      this.state.homeOpeningBid = openingBid();
      this.state.homeBidIncrement = bidIncrement();
      this.settleAuctions();
    }, 1000);
  }

  private sendBag(sessionId: string, player: PlayerState) {
    this.clients.find((c) => c.sessionId === sessionId)?.send("bag-sync", {
      inventory: player.inventory,
      credits: player.credits,
      gun: player.gun,
      pet: player.pet,
      accessories: player.accessories,
    });
  }

  private async syncFriends(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!player?.wallet || !client) return;
    const friends = await loadFriends(player.wallet, this.chainFor(sessionId));
    client.send("friend-sync", { friends });
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

  private async deliverInbox(client: Client, player: PlayerState) {
    if (!player.wallet) return;
    const messages = await loadMessages(player.wallet, this.chainFor(client.sessionId));
    client.send("message-sync", { messages });
  }

  private async adoptStoredCredits(client: Client, player: PlayerState) {
    if (!player.wallet) return;
    const stored = await fetchCredits(player.wallet, this.chainFor(client.sessionId));
    if (stored == null || stored === player.credits) return;
    player.credits = Math.max(0, Math.min(CREDIT_CAP, stored));
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
      this.releaseVehicle(sessionId);
      this.punchAt.delete(sessionId);
      this.knockedUntil.delete(sessionId);
      this.chains.delete(sessionId);
      this.state.players.delete(sessionId);
      client?.leave(SESSION_REPLACED);
      console.log(`[world] wallet ${wallet} signed in again — dropped session ${sessionId}`);
    }
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
   * Credits the server moves itself (escrow in, refund out) are written to the
   * character row as well as the live player, so they survive a refresh. The
   * wallet may not be connected, which is why the write is keyed by wallet.
   */
  private async moveCredits(wallet: string, chain: WalletChainId, delta: number) {
    if (!wallet) return;
    const online = this.playerByWallet(wallet);
    if (online) {
      online.player.credits = Math.max(0, Math.min(CREDIT_CAP, online.player.credits + delta));
      this.sendBag(online.sessionId, online.player);
      await writeCredits(wallet, chain, online.player.credits);
      return;
    }
    const stored = await fetchCredits(wallet, chain);
    if (stored == null) return;
    await writeCredits(wallet, chain, Math.max(0, stored + delta));
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
      // Nobody is behind the wheel after a restart.
      vehicle.driver = "";
      this.vehicleChains.set(row.id, row.ownerChain);
      this.state.vehicles.set(row.id, vehicle);
    }
    if (rows.length) console.log(`[the-block] restored ${rows.length} owned vehicle(s)`);
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
    if (rows.length) console.log(`[the-block] restored ${rows.length} home auction(s)`);
    this.reportDriftedHomes(rows.map((row) => row.homeId));
    // Anything that ran out while the server was down closes on the next tick.
    this.settleAuctions();
  }

  private setListing(client: Client, id: string, list: boolean, price?: number, duration?: number) {
    const player = this.state.players.get(client.sessionId);
    const home = this.state.homes.get(id);
    if (!player || !home || !isHomeId(id)) return;
    if (!player.wallet || home.owner !== player.wallet) {
      client.send("home-result", { id, ok: false, reason: "You do not own this home." });
      return;
    }
    // Pulling a listing once people have money on the table would strand their
    // escrow, so a listing is only cancellable before the first bid lands.
    if (!list && home.endsAt > 0) {
      client.send("home-result", { id, ok: false, reason: "Bidding has started — you cannot delist now." });
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
          reason: `Set an asking price of at least ${MIN_ASKING_PRICE} credit.`,
        });
        return;
      }
      const seconds = clampDuration(duration);
      if (seconds == null) {
        client.send("home-result", {
          id,
          ok: false,
          reason: `Auction length must be between ${minAuctionSeconds()} seconds and ${MAX_AUCTION_SECONDS / 86400} days.`,
        });
        return;
      }
      home.askingPrice = asking;
      home.durationSeconds = seconds;
    } else {
      home.askingPrice = 0;
      home.durationSeconds = 0;
    }
    home.forSale = list;
    void saveHomeAuction(this.toRow(home));
    void this.notify(player.wallet, this.chainFor(client.sessionId), {
      kind: "listed",
      homeId: id,
      body: list
        ? `You listed a home in ${home.city} at ${home.askingPrice} cr for ${WorldRoom.describeDuration(home.durationSeconds)}.`
        : `You withdrew your listing in ${home.city}.`,
    });
    client.send("home-result", {
      id,
      ok: true,
      listed: list,
      reason: list
        ? `Listed — bidding opens at ${home.askingPrice} credits`
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
      console.log(`[the-block] home auctions verified — all ${storedIds.length} match a generated home`);
      return;
    }
    console.warn(
      `[the-block] WARNING: ${orphans.length} of ${storedIds.length} stored home auction(s) no longer match a generated home.`,
    );
    console.warn(`[the-block] orphaned ids: ${orphans.slice(0, 20).join(", ")}${orphans.length > 20 ? " …" : ""}`);
    console.warn("[the-block] re-match them by lot_gx/lot_gz in home_auctions before players notice.");
  }

  private async buyVehicle(client: Client, kind: string, city?: CityId) {
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
    if (player.credits < spec.price) {
      client.send("buy-result", {
        ok: false,
        reason: `A ${spec.name} costs ${spec.price} cr. You have ${player.credits}.`,
      });
      return;
    }

    await this.moveCredits(player.wallet, this.chainFor(client.sessionId), -spec.price);
    if (!player.wallet) {
      // No wallet means moveCredits could not bill them; charge the session copy.
      player.credits = Math.max(0, player.credits - spec.price);
      this.sendBag(client.sessionId, player);
    }

    // Park it on the street at the front of the lot, nudged along so a second
    // purchase does not land on top of the first.
    const owned = [...this.state.vehicles.values()].filter((v) => v.owner === player.wallet).length;
    const vehicle = new VehicleState();
    vehicle.id = `veh-${client.sessionId}-${Date.now().toString(36)}`;
    vehicle.city = where;
    vehicle.x = centre.x + ((owned % 3) - 1) * 4.2;
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
    void this.notify(player.wallet, this.chainFor(client.sessionId), {
      kind: "bought",
      body: `You bought a ${spec.name} in ${where} for ${spec.price} cr.`,
    });
  }

  private async placeBid(client: Client, id: string, city?: CityId) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isHomeId(id)) return;
    const wallet = player.wallet;
    if (!wallet) {
      client.send("home-result", { id, ok: false, reason: "Connect a wallet to bid on a home." });
      return;
    }
    const chain = this.chainFor(client.sessionId);

    const home = this.state.homes.get(id);
    const live = Boolean(home && home.endsAt > 0);
    if (home?.owner === wallet) {
      client.send("home-result", { id, ok: false, reason: "You already own this home." });
      return;
    }
    if (home?.awaitingSeller) {
      client.send("home-result", { id, ok: false, reason: "Bidding has closed on this home." });
      return;
    }
    if (home?.owner && !home.forSale) {
      client.send("home-result", { id, ok: false, reason: `This home belongs to ${home.ownerName}.` });
      return;
    }
    // Identity is the wallet, not the session, so reconnecting does not let you
    // bid against yourself and does not orphan the escrow you are already holding.
    if (home && home.highBidderWallet === wallet) {
      client.send("home-result", { id, ok: false, reason: "You are already the highest bidder." });
      return;
    }

    const amount = nextBidFor(home?.highBid ?? 0, live, home?.askingPrice ?? 0);
    if (player.credits < amount) {
      client.send("home-result", {
        id,
        ok: false,
        reason: `You need ${amount} credits to bid. You have ${player.credits}.`,
      });
      return;
    }

    const record = home ?? new HomeState();
    const refundWallet = home?.highBidderWallet ?? "";
    const refundChain = (home?.highBidderChain || DEFAULT_CHAIN) as WalletChainId;
    const refundAmount = home?.highBid ?? 0;

    record.id = id;
    record.city = (city && CITY_BOUNDS[city] ? city : player.city) as string;
    record.highBid = amount;
    record.highBidderWallet = wallet;
    record.highBidderChain = chain;
    record.highBidderName = player.name;
    // The first bid opens the window; later bids raise the price, not the clock.
    if (!live) {
      const seconds = record.durationSeconds > 0 ? record.durationSeconds : auctionSeconds();
      record.endsAt = Date.now() + seconds * 1000;
    }
    if (!home) this.state.homes.set(id, record);

    await this.moveCredits(wallet, chain, -amount);
    if (refundWallet) {
      await this.moveCredits(refundWallet, refundChain, refundAmount);
      const outbid = this.playerByWallet(refundWallet);
      if (outbid) {
        this.clients
          .find((c) => c.sessionId === outbid.sessionId)
          ?.send("home-outbid", { id, name: player.name, bid: amount });
      }
    }
    await saveHomeAuction(this.toRow(record));

    if (record.owner && record.owner !== wallet) {
      await this.notify(record.owner, (record.ownerChain || DEFAULT_CHAIN) as WalletChainId, {
        kind: "bid",
        homeId: id,
        body: `${player.name} bid ${amount} cr on your ${record.city} home.`,
      });
    }
    if (refundWallet) {
      await this.notify(refundWallet, refundChain, {
        kind: "outbid",
        homeId: id,
        body: `${player.name} outbid you at ${amount} cr. Your ${refundAmount} cr was refunded.`,
      });
    }
    client.send("home-result", { id, ok: true, bid: amount, endsAt: record.endsAt });
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

  private settleAuctions() {
    const now = Date.now();
    this.state.homes.forEach((home) => {
      if (home.awaitingSeller) {
        // The seller ran out of time to answer. Accepting on their behalf is
        // the safe default: the winner's credits are already escrowed and
        // holding them indefinitely is worse than completing the sale.
        if (home.decideBy > 0 && now >= home.decideBy) void this.resolveOffer(home, true, "deadline");
        return;
      }
      if (home.endsAt === 0 || now < home.endsAt || !home.highBidderWallet) return;

      if (home.owner) {
        // A player's home does not change hands automatically — the seller gets
        // to accept or reject the winning bid.
        home.awaitingSeller = true;
        home.decideBy = now + acceptWindowSeconds() * 1000;
        home.endsAt = 0;
        void saveHomeAuction(this.toRow(home));
        void this.notify(home.owner, (home.ownerChain || DEFAULT_CHAIN) as WalletChainId, {
          kind: "offer",
          homeId: home.id,
          body: `Auction closed on your ${home.city} home. ${home.highBidderName} bid ${home.highBid} cr — accept or reject it.`,
        });
        void this.notify(home.highBidderWallet, (home.highBidderChain || DEFAULT_CHAIN) as WalletChainId, {
          kind: "bid",
          homeId: home.id,
          body: `You won the bidding on a ${home.city} home at ${home.highBid} cr. Waiting on the seller to accept.`,
        });
        this.broadcast("home-offer", { id: home.id, owner: home.owner, bid: home.highBid });
        return;
      }

      // Nobody owns it, so there is no seller to consult — the city just sells.
      this.completeSale(home, "");
    });
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
      void this.moveCredits(seller, sellerChain, price);
      void this.notify(seller, sellerChain, {
        kind: "sold",
        homeId: home.id,
        body: `You sold your ${home.city} home to ${buyerName} for ${price} cr.`,
      });
    }
    void this.notify(buyerWallet, buyerChain, {
      kind: "bought",
      homeId: home.id,
      body: `You bought a home in ${home.city} for ${price} cr.`,
    });
    void saveHomeAuction(this.toRow(home));
    this.broadcast("home-sold", {
      id: home.id,
      city: home.city,
      owner: home.owner,
      ownerName: home.ownerName,
      seller,
      bid: price,
    });
  }

  private async resolveOffer(home: HomeState, accept: boolean, reason: "seller" | "deadline") {
    if (!home.awaitingSeller || !home.highBidderWallet) return;
    if (accept) {
      this.completeSale(home, home.owner);
      return;
    }

    // Rejected: hand the escrow straight back and take the home off the market.
    const buyerWallet = home.highBidderWallet;
    const buyerChain = (home.highBidderChain || DEFAULT_CHAIN) as WalletChainId;
    const refund = home.highBid;
    const city = home.city;
    const sellerName = home.ownerName || "The seller";

    home.awaitingSeller = false;
    home.decideBy = 0;
    home.forSale = false;
    home.askingPrice = 0;
    home.durationSeconds = 0;
    home.highBid = 0;
    home.highBidderWallet = "";
    home.highBidderChain = "";
    home.highBidderName = "";

    await this.moveCredits(buyerWallet, buyerChain, refund);
    await this.notify(buyerWallet, buyerChain, {
      kind: "expired",
      homeId: home.id,
      body:
        reason === "deadline"
          ? `Your ${refund} cr bid on a ${city} home lapsed unanswered. Credits refunded.`
          : `${sellerName} rejected your ${refund} cr bid on a ${city} home. Credits refunded.`,
    });
    await this.notify(home.owner, (home.ownerChain || DEFAULT_CHAIN) as WalletChainId, {
      kind: "expired",
      homeId: home.id,
      body: `You rejected the ${refund} cr offer on your ${city} home. It is no longer listed.`,
    });
    void saveHomeAuction(this.toRow(home));
    this.broadcast("home-rejected", { id: home.id, bid: refund });
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const city = (options.city && CITY_BOUNDS[options.city] ? options.city : "trench") as CityId;
    const spawn = CITY_BOUNDS[city].spawn;
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.name = (options.name || "citizen").slice(0, 16);
    player.wallet = options.wallet ?? "";
    player.city = city;
    player.accessTier = options.accessTier ?? CITIES[city].tier;
    player.x = spawn[0];
    player.y = spawn[1];
    player.z = spawn[2];
    player.bodyType = options.bodyType ?? "regular";
    player.skinTone = options.skinTone ?? "#F6D7B0";
    player.outfit = options.outfit ?? "hi-vis";
    player.pantsColor = options.pantsColor ?? "#3A3A3A";
    player.shoe = options.shoe ?? "sneakers";
    player.shoeColor = options.shoeColor ?? "#111111";
    player.headwear = options.headwear ?? "hardhat";
    player.accessories = options.accessories ?? "";
    const health = Number(options.health ?? options.brokemeter);
    player.health = Number.isFinite(health) ? Math.max(0, Math.min(100, health)) : 100;
    player.credits = options.credits ?? 500;
    player.inventory = options.inventory ?? "[]";
    player.gun = options.gun ?? "";
    player.pet = options.pet ?? "";
    this.chains.set(client.sessionId, options.chain ?? DEFAULT_CHAIN);
    // One live session per wallet. Two tabs on the same wallet would each hold
    // their own copy of the credit balance, so escrow taken from one would be
    // invisible to the other and the stale tab could spend it twice.
    this.evictOtherSessions(player.wallet, client.sessionId);
    this.state.players.set(client.sessionId, player);
    console.log(`[world] ${player.name} joined ${city} (tier ${player.accessTier})`);

    // The stored balance is authoritative: it already has any auction escrow
    // taken out of it, which the client's cached copy does not.
    void this.adoptStoredCredits(client, player);
    void this.deliverInbox(client, player);
    void this.syncFriends(client.sessionId);

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

  onLeave(client: Client) {
    this.sendToNearbyVoiceClients(client, "voice-left", { sessionId: client.sessionId });
    this.releaseVehicle(client.sessionId);
    this.punchAt.delete(client.sessionId);
    this.knockedUntil.delete(client.sessionId);
    this.chains.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private releaseVehicle(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (player) {
      player.inVehicle = false;
      player.vehicleId = "";
    }
    this.state.vehicles.forEach((vehicle) => {
      if (vehicle.driver === sessionId) {
        vehicle.driver = "";
        this.vehicleMotion.delete(vehicle.id);
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

  private vehicleBlocksPlayerMove(fromX: number, fromZ: number, toX: number, toZ: number) {
    let blocked = false;
    this.state.vehicles.forEach((vehicle) => {
      if (blocked) return;
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
