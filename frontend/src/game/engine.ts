import * as pc from "playcanvas";
import { getStateCallbacks, type Room } from "@colyseus/sdk";
import {
  CITIES,
  CITY_BOUNDS,
  addItem,
  canEnterCity,
  catalogItem,
  DEFAULT_CHAIN,
  cityAtPosition,
  insideCityWalls,
  decodeInventory,
  encodeInventory,
  hasItem,
  isGunId,
  gunSpec,
  UNARMED,
  isItemId,
  isPetId,
  parseAccessories,
  parseHexColor,
  parseShoe,
  seedInventory,
  type AccessoryId,
  type CharacterRecord,
  type CityId,
  type GameSettings,
  type GunId,
  type InventoryStack,
  type ItemId,
  type PetId,
} from "@the-block/shared";
import { joinWorld, type JoinFailure } from "../lib/colyseus";
import { loadCharacter, saveCharacter } from "../lib/storage";
import { loadWallet } from "../lib/wallet";
import { VoiceChat } from "../lib/voiceChat";
import { createPcApp, destroyPcApp, hitsAabb, material, setCycleGlow } from "./pcApp";
import { createCitizen, type Appearance } from "./character";
import { createVehicle } from "./vehicles";
import { applyAimPose, applyCitizenMotion } from "./motion";
import { applySkyCycle, dayFactor } from "./skyCycle";
import { buildWorld, tickNpcs, WALK_Y, type Interactable, type NpcAgent, type Seat, type WorldObjects } from "./world";
import { createPet, createPetWalker, tickPetWalker, type PetWalker } from "./pets";

const TALK_RANGE = 8;
const VOICE_RANGE = 22;
const NAMETAG_RANGE = 48;
const HOME_BID_RANGE = 13;
/** Past this, a remote player is not drawn at all. */
const REMOTE_RENDER_RANGE = 70;
const HOME_SALE_LABEL_RANGE = 26;
const PUNCH_RANGE = 2.45;
const PUNCH_MS = 320;
/** How long the recoil kick lasts after a shot. */
const RECOIL_MS = 160;
const HIT_MS = 280;

const MOVE_KEYS: Record<string, string> = {
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Space: " ",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  KeyE: "e",
  KeyC: "c",
  KeyF: "f",
};

export type Nametag = {
  sessionId: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  inRange: boolean;
  bubble: string | null;
  kind?: "player" | "building" | "home";
  detail?: string | null;
  tone?: "sale" | "auction" | "sold";
};

export type PlayerMessage = {
  id: string;
  kind: "bid" | "outbid" | "sold" | "bought" | "offer" | "listed" | "expired";
  body: string;
  homeId: string;
  read: boolean;
  at: number;
};

export type Friend = {
  wallet: string;
  name: string;
  status: "friend" | "incoming" | "outgoing";
  online: boolean;
  sessionId: string | null;
  city: string | null;
};

export type OwnedCar = { id: string; kind: string; color: string; city: string; locked: boolean; x: number; z: number };

export type OwnedHome = {
  id: string;
  city: string;
  lastPrice: number;
  forSale: boolean;
  askingPrice: number;
  highBid: number;
  awaitingSeller: boolean;
  locked: boolean;
};

export type HomeInfo = {
  id: string;
  city: string;
  owner: string;
  ownerName: string;
  forSale: boolean;
  lastPrice: number;
  askingPrice: number;
  durationSeconds: number;
  locked: boolean;
  awaitingSeller: boolean;
  decideBy: number;
  highBid: number;
  highBidderWallet: string;
  highBidderName: string;
  endsAt: number;
};

export type WhisperLine = {
  id: string;
  fromSession: string;
  fromName: string;
  toSession: string;
  text: string;
  at: number;
};

export type RosterEntry = {
  sessionId: string;
  name: string;
  wallet: string;
  x: number;
  z: number;
  city: string;
  indoors: boolean;
};

export type MapCitizen = {
  sessionId: string;
  name: string;
  x: number;
  z: number;
  you: boolean;
  indoors: boolean;
  friend: boolean;
};

export type HudState = {
  city: CityId;
  prompt: string | null;
  fps: number;
  x: number;
  z: number;
  block: string;
  health: number;
  nearbyPlayer: { sessionId: string; name: string } | null;
  nametags: Nametag[];
  whispers: WhisperLine[];
  lastWhisper: WhisperLine | null;
  gateMessage: string | null;
  chat: { name: string; text: string }[];
  citizens: MapCitizen[];
  connected: boolean;
  credits: number;
  inventory: InventoryStack[];
  inStore: boolean;
  gun: GunId | null;
  pet: PetId | null;
  accessories: string[];
  pendingTrade: { fromSession: string; fromName: string; item: string } | null;
  voiceLevel: number;
  notice: string | null;
  listPrompt: { id: string; suggested: number; suggestedMinutes: number } | null;
  offerPrompt: { id: string; bid: number; bidder: string; decideBy: number } | null;
  messages: PlayerMessage[];
  unreadMessages: number;
  sessionEnded: string | null;
  /** "full" means the world is at capacity; "offline" means no backend. */
  joinFailure: JoinFailure | null;
  /** Whole-world snapshot for the map, refreshed on demand. */
  roster: MapCitizen[];
  ownedHomes: OwnedHome[];
  ownedCars: OwnedCar[];
  friends: Friend[];
  friendRequests: number;
  /** Player yaw in radians, for orienting the minimap marker. */
  heading: number;
  accessTier: number;
  /** Who a shot would hit right now, for the crosshair lock. */
  aimTarget: string | null;
};

type VehicleHandle = {
  id: string;
  entity: pc.Entity;
  driver: string;
  kind: string;
};

type KnockdownState = {
  startedAt: number;
  fallEndsAt: number;
  lieEndsAt: number;
  endsAt: number;
};

const LOCAL_VEHICLES = [
  { id: "veh-0", city: "trench", x: -48, z: 58, rotY: 0, color: "#F4F4F4", kind: "hatch" },
  { id: "veh-1", city: "trench", x: -62, z: 42, rotY: Math.PI / 2, color: "#EEEEEE", kind: "hatch" },
  { id: "veh-2", city: "gas", x: 46, z: 62, rotY: 0, color: "#5B8FCF", kind: "sedan" },
  { id: "veh-3", city: "realworld", x: -42, z: -58, rotY: Math.PI, color: "#D9772C", kind: "sedan" },
  { id: "veh-4", city: "valhalla", x: 44, z: -40, rotY: 0, color: "#FF8A1F", kind: "sport" },
  { id: "veh-5", city: "valhalla", x: 62, z: -56, rotY: Math.PI / 2, color: "#2B4C9B", kind: "sedan" },
];

export class GameEngine {
  private app: pc.AppBase | null = null;
  private player: pc.Entity | null = null;
  private camera: pc.Entity | null = null;
  private world: WorldObjects | null = null;
  private vehicles = new Map<string, VehicleHandle>();
  private remotes = new Map<string, pc.Entity>();
  private remoteState = new Map<string, RemotePlayer>();
  private remoteNames = new Map<string, string>();
  private remoteWallets = new Map<string, string>();
  private nametags: Nametag[] = [];
  private whispers: WhisperLine[] = [];
  private lastWhisper: WhisperLine | null = null;
  private speech = new Map<string, { text: string; until: number }>();
  private tmpWorld = new pc.Vec3();
  private tmpScreen = new pc.Vec3();
  private room: Room | null = null;
  private voice: VoiceChat | null = null;
  private voiceSyncAt = 0;
  private keys = new Set<string>();
  private pad = { x: 0, z: 0 };
  private yaw = 0;
  private pitch = 0.38;
  private looking = false;
  private canvas: HTMLCanvasElement | null = null;
  private snapCamera = false;
  private inVehicle: string | null = null;
  private inBuilding: Interactable | null = null;
  private sitting = false;
  private sitSeat: Seat | null = null;
  private speed = 9;
  private vehicleSpeed = 0;
  private driving = false;
  private accessTier = 1;
  private city: CityId = "trench";
  private health = 100;
  private lastHealth = 100;
  private punchReady = 0;
  private punchUntil = 0;
  private hitUntil = 0;
  private meleePunch = new Map<string, number>();
  private meleeHit = new Map<string, number>();
  private settings: GameSettings | null = null;
  private lastCycle = -1;
  private lastCycleKey = "";
  private lastDt = 0.016;
  private lastHud = 0;
  private lastMoveSync = 0;
  private gateUntil = 0;
  private gateMessage: string | null = null;
  private chat: { name: string; text: string }[] = [];
  private onHud: ((s: HudState) => void) | null = null;
  private unbind: Array<() => void> = [];
  private animT = 0;
  private vy = 0;
  private grounded = true;
  private remoteLast = new Map<string, { x: number; z: number }>();
  private localName = "citizen";
  private look: Appearance | null = null;
  private credits = 500;
  private homes = new Map<string, HomeInfo>();
  private homeOpeningBid = 250;
  private homeBidIncrement = 50;
  private wallet = "";
  private joinFailure: JoinFailure | null = null;
  private roster: MapCitizen[] = [];
  private pendingListing: { id: string; suggested: number; suggestedMinutes: number } | null = null;
  private pendingOffer: { id: string; bid: number; bidder: string; decideBy: number } | null = null;
  private messages: PlayerMessage[] = [];
  private ownedCars = new Map<string, OwnedCar>();
  private friends: { wallet: string; name: string; status: Friend["status"]; online?: boolean }[] = [];
  private vehicleOwners = new Map<string, string>();
  private vehicleLocks = new Map<string, boolean>();
  private sessionEnded: string | null = null;
  private notice: string | null = null;
  private noticeUntil = 0;
  private inventory: InventoryStack[] = [];
  private gun: GunId | null = null;
  private petKind: PetId | null = null;
  private petEntity: pc.Entity | null = null;
  private petWalk: PetWalker | null = null;
  private remotePets = new Map<string, pc.Entity>();
  private remotePetWalk = new Map<string, PetWalker>();
  private remoteLookKey = new Map<string, string>();
  private pendingTrade: { fromSession: string; fromName: string; item: string } | null = null;
  private knockdown: KnockdownState | null = null;
  private remoteKnockdowns = new Map<string, KnockdownState>();

  async start(
    canvas: HTMLCanvasElement,
    character: CharacterRecord,
    settings: GameSettings,
    onHud: (s: HudState) => void,
  ) {
    this.settings = settings;
    this.onHud = onHud;
    this.accessTier = character.accessTier;
    this.city = character.homeCity;
    this.health = clampHealth(character.brokemeter);
    this.lastHealth = this.health;
    this.localName = character.displayName || "citizen";
    this.look = { ...appearanceOf(character), gun: character.equippedGun };
    this.credits = Number.isFinite(character.credits) ? character.credits : 500;
    this.inventory = seedInventory(character.accessories, character.inventory);
    this.gun = character.equippedGun ?? null;
    this.petKind = character.equippedPet ?? null;
    this.app = await createPcApp(canvas);
    this.canvas = canvas;
    this.world = buildWorld(this.app);

    const spawn = CITY_BOUNDS[character.homeCity].spawn;
    this.player = createCitizen(this.app.root, this.look, "local-player");
    this.player.setPosition(spawn[0], WALK_Y, spawn[2]);
    this.yaw = Math.PI;
    this.syncPet();

    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", {
      clearColor: new pc.Color(...CITIES[character.homeCity].sky),
      farClip: 70 + settings.renderDistance * 2.6,
      fov: 42,
    });
    this.app.root.addChild(this.camera);

    for (const spec of LOCAL_VEHICLES) {
      const entity = createVehicle(this.app.root, spec);
      this.vehicles.set(spec.id, { id: spec.id, entity, driver: "", kind: spec.kind });
      this.world.interactables.push({
        kind: "vehicle",
        id: spec.id,
        x: spec.x,
        z: spec.z,
        radius: 4.4,
        city: spec.city as CityId,
      });
    }

    this.bindInput();
    this.app.on("update", (dt: number) => this.update(dt));

    this.wallet = character.wallet;
    const joined = await joinWorld({
      name: character.displayName,
      wallet: character.wallet,
      chain: loadWallet()?.chain ?? DEFAULT_CHAIN,
      city: character.homeCity,
      accessTier: character.accessTier,
      bodyType: character.bodyType,
      skinTone: character.skinTone,
      outfit: character.outfit,
      pantsColor: character.pantsColor,
      shoe: character.shoe,
      shoeColor: character.shoeColor,
      headwear: character.headwear,
      accessories: (character.accessories ?? []).join(","),
      health: this.health,
      brokemeter: this.health,
      credits: this.credits,
      inventory: encodeInventory(this.inventory),
      gun: this.gun ?? "",
      pet: this.petKind ?? "",
    });
    this.room = joined.room;
    this.joinFailure = joined.reason ?? null;
    if (this.room) this.voice = new VoiceChat(this.room);
    this.bindRoom();
    this.emitHud();
  }

  setPad(x: number, z: number) {
    this.pad = { x, z };
  }

  setSettings(settings: GameSettings) {
    this.settings = settings;
    this.lastCycle = -1;
    if (this.camera?.camera) this.camera.camera.farClip = 70 + settings.renderDistance * 2.6;
  }

  sendChat(text: string) {
    this.room?.send("chat", { text });
    if (!this.room) this.chat.push({ name: "You", text });
  }

  sendWhisper(toSession: string, text: string) {
    const trimmed = text.trim().slice(0, 180);
    if (!trimmed) return;
    const id = `${Date.now()}-${this.room?.sessionId ?? "local"}`;
    const mine: WhisperLine = {
      id,
      fromSession: this.room?.sessionId ?? "local",
      fromName: "You",
      toSession,
      text: trimmed,
      at: Date.now(),
    };
    this.pushWhisper(mine);
    this.speech.set(this.room?.sessionId ?? "local", { text: trimmed, until: performance.now() + 3800 });
    this.room?.send("whisper", { toSession, text: trimmed, id });
  }

  nearbyTalkTarget() {
    return this.findNearbyRemote();
  }

  async enableVoice() {
    if (!this.voice) throw new Error("Voice chat needs a multiplayer connection.");
    await this.voice.enable();
  }

  disableVoice() {
    this.voice?.disable();
  }

  sendTrade(toSession: string, item: string) {
    if (!isItemId(item) || !hasItem(this.inventory, item)) return;
    this.room?.send("trade-request", { toSession, item });
    this.gateMessage = "Trade offer sent.";
    this.gateUntil = performance.now() + 1800;
  }

  respondTrade(accept: boolean) {
    const pending = this.pendingTrade;
    if (!pending) return;
    this.room?.send("trade-respond", { fromSession: pending.fromSession, accept, item: pending.item });
    this.pendingTrade = null;
  }

  buyItem(id: ItemId) {
    if (this.inBuilding?.interiorKind !== "store") return "Walk into a Store to buy.";
    const item = catalogItem(id);
    if (!item) return "Unknown item.";
    if (item.tier > this.accessTier) return `Needs tier ${item.tier}.`;
    if (this.credits < item.price) return "Not enough credits.";
    if (item.unique && hasItem(this.inventory, item.id)) return "You already own that.";
    this.credits -= item.price;
    this.inventory = addItem(this.inventory, item.id);
    this.persistBag();
    this.gateMessage = `Bought ${item.name}.`;
    this.gateUntil = performance.now() + 2200;
    return null;
  }

  equipItem(id: ItemId) {
    if (!hasItem(this.inventory, id)) return;
    const item = catalogItem(id);
    if (!item || item.kind === "crate") return;
    if (item.kind === "accessory") {
      const current = this.look?.accessories ?? [];
      const aid = id as AccessoryId;
      const next = current.includes(aid) ? current.filter((a) => a !== aid) : [...current, aid];
      if (this.look) this.look.accessories = next;
      this.refreshLook();
      return;
    }
    if (item.kind === "gun") {
      this.gun = this.gun === id ? null : (id as GunId);
      if (this.look) this.look.gun = this.gun;
      this.refreshLook();
      return;
    }
    this.petKind = this.petKind === id ? null : (id as PetId);
    this.syncPet();
    this.persistBag();
  }

  interact() {
    this.clearSit(true);
    if (this.inVehicle) {
      this.exitVehicle();
      return;
    }
    if (this.inBuilding) {
      this.exitBuilding();
      return;
    }
    const near = this.nearestInteractable();
    if (!near || !this.player) return;
    if (near.kind === "vehicle") this.enterVehicle(near.id);
    if (near.kind === "door") this.enterBuilding(near);
    if (near.kind === "buy-car") this.buyCar(near);
  }

  dispose() {
    this.unbind.forEach((fn) => fn());
    this.unbind = [];
    this.voice?.dispose();
    this.voice = null;
    void this.room?.leave();
    if (this.canvas && document.pointerLockElement === this.canvas) document.exitPointerLock();
    if (this.app) destroyPcApp(this.app);
    this.app = null;
    this.canvas = null;
  }

  private bindInput() {
    const canvas = this.canvas;
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      const mapped = MOVE_KEYS[e.code] ?? e.key.toLowerCase();
      if (!typing) {
        this.keys.add(mapped);
        if (mapped === "e" && !e.repeat) this.interact();
        if (mapped === "c" && !e.repeat) this.toggleSit();
        if (mapped === "f" && !e.repeat) this.tryPunch();
        if (mapped === "b" && !e.repeat) this.tryBid();
        if (mapped === "l" && !e.repeat) this.toggleLock();
        if (mapped === "g" && !e.repeat) this.addFriend();
        if (mapped in { w: 1, a: 1, s: 1, d: 1, " ": 1, shift: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1 }) {
          e.preventDefault();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(MOVE_KEYS[e.code] ?? e.key.toLowerCase());
    };
    const onContext = (e: Event) => e.preventDefault();
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (e.target === canvas) this.tryPunch();
        return;
      }
      if (e.button !== 2) return;
      e.preventDefault();
      this.looking = true;
      void canvas?.requestPointerLock();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      this.looking = false;
      if (canvas && document.pointerLockElement === canvas) document.exitPointerLock();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.looking) return;
      this.yaw -= e.movementX * 0.0024;
      const lo = this.inBuilding ? -0.28 : -0.32;
      const hi = this.inBuilding ? 0.48 : 1.2;
      this.pitch = Math.max(lo, Math.min(hi, this.pitch - e.movementY * 0.002));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas?.addEventListener("contextmenu", onContext);
    canvas?.addEventListener("mousedown", onMouseDown);
    this.unbind.push(() => window.removeEventListener("keydown", down));
    this.unbind.push(() => window.removeEventListener("keyup", up));
    this.unbind.push(() => window.removeEventListener("mouseup", onMouseUp));
    this.unbind.push(() => window.removeEventListener("mousemove", onMouseMove));
    this.unbind.push(() => canvas?.removeEventListener("contextmenu", onContext));
    this.unbind.push(() => canvas?.removeEventListener("mousedown", onMouseDown));
  }

  private bindRoom() {
    const room = this.room;
    if (!room) return;
    const $ = getStateCallbacks(room);

    room.onMessage("gate-denied", (msg: { city: CityId }) => {
      this.gateMessage = `${CITIES[msg.city].name} is gated. Work your way up — you cannot buy in.`;
      this.gateUntil = performance.now() + 2800;
    });
    room.onMessage("whisper", (msg: WhisperLine) => {
      this.pushWhisper(msg);
      this.speech.set(msg.fromSession, { text: msg.text, until: performance.now() + 3800 });
    });
    room.onMessage("whisper-denied", () => {
      this.gateMessage = "They're too far to hear you. Walk closer.";
      this.gateUntil = performance.now() + 2400;
    });
    room.onMessage("melee", (msg: { fromSession: string; toSession: string; health: number; x: number; z: number }) => {
      this.onMelee(msg);
    });
    room.onMessage(
      "vehicle-hit",
      (msg: { targetSession: string; health: number; damage: number; speed: number; x: number; z: number; knockedMs: number }) => {
        this.onVehicleHit(msg);
      },
    );
    room.onMessage(
      "vehicle-correction",
      (msg: { id: string; x: number; z: number; rotY: number }) => {
        const handle = this.vehicles.get(msg.id);
        if (!handle || this.inVehicle !== msg.id) return;
        handle.entity.setPosition(msg.x, WALK_Y, msg.z);
        handle.entity.setEulerAngles(0, (msg.rotY * 180) / Math.PI, 0);
        this.player?.setPosition(msg.x, WALK_Y, msg.z);
        this.yaw = msg.rotY;
        this.vehicleSpeed = 0;
      },
    );
    room.onMessage("trade-request", (msg: { fromSession: string; fromName: string; item: string }) => {
      this.pendingTrade = msg;
      this.gateMessage = `${msg.fromName} offered you ${catalogItem(msg.item)?.name ?? msg.item}.`;
      this.gateUntil = performance.now() + 4000;
    });
    room.onMessage("trade-result", (msg: { accept: boolean; item?: string }) => {
      this.gateMessage = msg.accept ? "Trade completed." : "Trade declined.";
      this.gateUntil = performance.now() + 2200;
    });
    room.onMessage("bag-sync", (msg: { inventory?: string; credits?: number; gun?: string; pet?: string; accessories?: string }) => {
      this.applyBag(msg);
    });

    $(room.state).chat.onAdd((line) => {
      this.chat = [...this.chat.slice(-20), { name: line.name, text: line.text }];
    });

    $(room.state).players.onAdd((player, sessionId) => {
      if (sessionId === room.sessionId) {
        const incoming = (player as { health?: number }).health;
        if (typeof incoming === "number" && Number.isFinite(incoming)) this.health = clampHealth(incoming);
        $(player).listen("health", (value) => {
          if (typeof value === "number") this.health = clampHealth(value);
        });
        return;
      }
      this.spawnRemote(player as RemotePlayer, sessionId);
      $(player).onChange(() => this.applyRemote(sessionId));
    });

    $(room.state).players.onRemove((_player, sessionId) => {
      this.dropRemote(sessionId);
    });

    $(room.state).vehicles.onAdd((vehicle, vehicleId) => {
      this.applyNetworkVehicle(vehicle as RemoteVehicle, vehicleId);
      $(vehicle).onChange(() => this.applyNetworkVehicle(vehicle as RemoteVehicle, vehicleId));
    });

    $(room.state).vehicles.onRemove((_vehicle, vehicleId) => {
      this.vehicles.get(vehicleId)?.entity.destroy();
      this.vehicles.delete(vehicleId);
      this.ownedCars.delete(vehicleId);
      this.vehicleOwners.delete(vehicleId);
      this.vehicleLocks.delete(vehicleId);
    });

    room.onMessage("home-result", (msg: { ok?: boolean; reason?: string; bid?: number; listed?: boolean }) => {
      // Rejections are transient feedback; the successes arrive as inbox messages.
      if (!msg.ok) this.setNotice(msg.reason ?? "Rejected");
      else if (typeof msg.bid === "number") this.setNotice(`Bid placed — ${msg.bid} credits`);
    });

    room.onMessage("session-replaced", () => {
      this.sessionEnded = "This wallet signed in somewhere else. Only one session can be open at a time.";
    });
    room.onLeave((code) => {
      // 4100 is our own displaced-session code; anything else is a real drop.
      if (code === 4100 && !this.sessionEnded) {
        this.sessionEnded = "This wallet signed in somewhere else. Only one session can be open at a time.";
      }
      this.room = null;
    });

    room.onMessage("roster", (msg: { roster?: RosterEntry[] }) => {
      const friendWallets = new Set(
        this.friends.filter((f) => f.status === "friend").map((f) => f.wallet),
      );
      this.roster = (msg.roster ?? []).map((r) => ({
        sessionId: r.sessionId,
        name: r.name,
        x: r.x,
        z: r.z,
        you: r.sessionId === this.room?.sessionId,
        indoors: r.indoors,
        friend: friendWallets.has(r.wallet),
      }));
    });

    room.onMessage("friend-sync", (msg: { friends?: { wallet: string; name: string; status: Friend["status"]; online?: boolean }[] }) => {
      this.friends = msg.friends ?? [];
    });
    room.onMessage("friend-result", (msg: { ok?: boolean; reason?: string }) => {
      if (msg.reason) this.setNotice(msg.reason);
    });

    room.onMessage("gunshot", (msg: { fromSession?: string; toSession?: string; health?: number; x?: number; z?: number }) => {
      const shooter = this.remotes.get(String(msg.fromSession))?.getPosition();
      const hit = msg.toSession === room.sessionId ? this.player?.getPosition() : this.remotes.get(String(msg.toSession))?.getPosition();
      if (shooter && hit) {
        this.drawTracer(shooter.x, shooter.y + 1.35, shooter.z, hit.x, hit.y + 1.2, hit.z);
      }
      const now = performance.now();
      if (msg.toSession === room.sessionId) {
        if (typeof msg.health === "number") this.health = clampHealth(msg.health);
        this.hitUntil = now + HIT_MS;
      } else if (msg.toSession) {
        this.meleeHit.set(String(msg.toSession), now + HIT_MS);
      }
    });

    room.onMessage("lock-result", (msg: { locked?: boolean; name?: string }) => {
      this.setNotice(`${msg.locked ? "Locked" : "Unlocked"} your ${msg.name ?? "property"}.`);
    });

    room.onMessage("entry-denied", (msg: { id?: string; kind?: string; reason?: string }) => {
      this.setNotice(msg.reason ?? "You cannot go in there.");
      if (msg.kind === "car" && this.inVehicle === msg.id) this.exitVehicle();
      if (msg.kind === "home" && this.inBuilding?.id === msg.id) this.exitBuilding();
    });

    room.onMessage("buy-result", (msg: { ok?: boolean; reason?: string; name?: string; price?: number }) => {
      this.setNotice(msg.ok ? `Bought a ${msg.name} for ${msg.price} cr - it is parked outside.` : msg.reason ?? "Could not buy that car");
    });

    room.onMessage("message-sync", (msg: { messages?: PlayerMessage[] }) => {
      this.messages = (msg.messages ?? []).slice(0, 60);
    });
    room.onMessage("message-new", (msg: PlayerMessage) => {
      if (!msg?.id || this.messages.some((m) => m.id === msg.id)) return;
      this.messages = [msg, ...this.messages].slice(0, 60);
      this.setNotice(msg.body);
    });

    $(room.state).homes.onAdd((home, id) => {
      this.applyHome(home as HomeInfo, id);
      $(home).onChange(() => this.applyHome(home as HomeInfo, id));
    });
    $(room.state).homes.onRemove((_home, id) => {
      this.homes.delete(id);
    });
    $(room.state).listen("homeOpeningBid", (value) => {
      if (typeof value === "number" && value > 0) this.homeOpeningBid = value;
    });
    $(room.state).listen("homeBidIncrement", (value) => {
      if (typeof value === "number" && value > 0) this.homeBidIncrement = value;
    });
  }

  private applyHome(home: HomeInfo, id: string) {
    this.homes.set(id, {
      id,
      city: home.city,
      owner: home.owner,
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
      highBidderName: home.highBidderName,
      endsAt: home.endsAt,
    });
  }

  private setNotice(text: string) {
    this.notice = text;
    this.noticeUntil = performance.now() + 4200;
  }

  /** What the next bid on this home has to be, mirroring the server rule. */
  private nextBid(info?: HomeInfo) {
    if (info && info.endsAt > 0) return info.highBid + this.homeBidIncrement;
    if (info && info.askingPrice > 0) return info.askingPrice;
    return this.homeOpeningBid;
  }

  listHome(price: number, minutes: number) {
    const pending = this.pendingListing;
    if (!pending) return;
    if (!Number.isFinite(price) || price < 1) {
      this.setNotice("Enter an asking price of at least 1 credit.");
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 43200) {
      this.setNotice("Auction length must be between 1 minute and 30 days.");
      return;
    }
    this.pendingListing = null;
    this.room?.send("home-list", {
      id: pending.id,
      list: true,
      price: Math.round(price),
      duration: Math.round(minutes * 60),
    });
  }

  openOffer(id: string) {
    const info = this.homes.get(id);
    if (!info?.awaitingSeller || info.owner !== this.wallet) return;
    this.pendingOffer = {
      id,
      bid: info.highBid,
      bidder: info.highBidderName,
      decideBy: info.decideBy,
    };
  }

  decideOffer(accept: boolean) {
    const pending = this.pendingOffer;
    this.pendingOffer = null;
    if (!pending) return;
    this.room?.send("home-decide", { id: pending.id, accept });
  }

  closeOffer() {
    this.pendingOffer = null;
  }

  /** Used by the full-world queue screen to try again without reloading. */
  async retryJoin(): Promise<boolean> {
    const character = loadCharacter();
    if (!character) return false;
    const joined = await joinWorld({
      name: character.displayName,
      wallet: character.wallet,
      chain: loadWallet()?.chain ?? DEFAULT_CHAIN,
      city: character.homeCity,
      accessTier: character.accessTier,
      bodyType: character.bodyType,
      skinTone: character.skinTone,
      outfit: character.outfit,
      pantsColor: character.pantsColor,
      shoe: character.shoe,
      shoeColor: character.shoeColor,
      headwear: character.headwear,
      accessories: (character.accessories ?? []).join(","),
      health: this.health,
      brokemeter: this.health,
      credits: this.credits,
      inventory: encodeInventory(this.inventory),
      gun: this.gun ?? "",
      pet: this.petKind ?? "",
    });
    this.room = joined.room;
    this.joinFailure = joined.reason ?? null;
    if (!this.room) return false;
    this.voice = new VoiceChat(this.room);
    this.bindRoom();
    return true;
  }

  /** Called when the world map opens; the snapshot arrives as a "roster" message. */
  requestRoster() {
    this.room?.send("request-roster", {});
  }

  markMessagesRead() {
    if (!this.messages.some((m) => !m.read)) return;
    this.messages = this.messages.map((m) => (m.read ? m : { ...m, read: true }));
    this.room?.send("messages-read", {});
  }

  cancelListing() {
    this.pendingListing = null;
  }

  private addFriend() {
    const near = this.findNearbyRemote();
    if (!near) {
      this.setNotice("Stand next to someone to add them.");
      return;
    }
    this.room?.send("friend-request", { toSession: near.sessionId });
  }

  respondToFriend(wallet: string, accept: boolean) {
    this.room?.send("friend-respond", { wallet, accept });
  }

  removeFriend(wallet: string) {
    this.room?.send("friend-remove", { wallet });
  }

  /** Lock or unlock whatever of yours you are in or standing next to. */
  private toggleLock() {
    if (this.inVehicle && this.vehicleOwners.get(this.inVehicle) === this.wallet) {
      this.room?.send("set-lock", { kind: "car", id: this.inVehicle, locked: !this.vehicleLocks.get(this.inVehicle) });
      return;
    }
    const inside = this.inBuilding;
    if (inside?.interiorKind === "home") {
      const info = this.homes.get(inside.id);
      if (info?.owner === this.wallet) {
        this.room?.send("set-lock", { kind: "home", id: inside.id, locked: !info.locked });
        return;
      }
    }
    const near = this.nearestInteractable();
    if (near?.kind === "vehicle" && this.vehicleOwners.get(near.id) === this.wallet) {
      this.room?.send("set-lock", { kind: "car", id: near.id, locked: !this.vehicleLocks.get(near.id) });
      return;
    }
    const home = this.nearestHome();
    const info = home ? this.homes.get(home.id) : null;
    if (home && info?.owner === this.wallet) {
      this.room?.send("set-lock", { kind: "home", id: home.id, locked: !info.locked });
      return;
    }
    this.setNotice("Nothing of yours to lock here.");
  }

  private buyCar(item: Interactable) {
    if (!item.carKind || item.carPrice == null) return;
    if (this.credits < item.carPrice) {
      this.setNotice(`${item.label ?? "That car"} costs ${item.carPrice} cr. You have ${this.credits}.`);
      return;
    }
    this.room?.send("buy-vehicle", { kind: item.carKind, city: item.city });
  }

  private nearestHome(): Interactable | null {
    if (!this.player || !this.world || this.inVehicle || this.inBuilding) return null;
    const p = this.player.getPosition();
    let best: Interactable | null = null;
    let bestD = HOME_BID_RANGE;
    for (const item of this.world.interactables) {
      if (item.interiorKind !== "home") continue;
      const d = Math.hypot(item.x - p.x, item.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  private vehiclePrompt(id: string) {
    const owner = this.vehicleOwners.get(id);
    if (!owner) return "Press E to enter vehicle";
    if (owner === this.wallet) {
      return `Press E to drive · L to ${this.vehicleLocks.get(id) ? "unlock" : "lock"}`;
    }
    return this.vehicleLocks.get(id) ? "Locked - this car is someone else's" : "Press E to borrow this car";
  }

  private doorPrompt(near: Interactable) {
    const base = `Press E to enter ${near.label ?? "building"}`;
    if (near.interiorKind !== "home") return base;
    const info = this.homes.get(near.id);
    if (info && info.owner === this.wallet) {
      const lock = info.locked ? "L to unlock" : "L to lock";
      if (info.awaitingSeller) return `${base} · B to answer ${info.highBid} cr offer · ${lock}`;
      if (info.endsAt > 0) return `${base} · your home · bidding at ${info.highBid} cr · ${lock}`;
      if (info.forSale) return `${base} · listed at ${info.askingPrice} cr · B to withdraw · ${lock}`;
      return `${base} · B to list for sale · ${lock}`;
    }
    if (info?.owner && info.owner !== this.wallet && !info.forSale) {
      return info.locked ? `${info.ownerName}'s home - locked` : `${base} · ${info.ownerName}'s home`;
    }
    if (info && info.highBidderWallet === this.wallet) return `${base} · you lead at ${info.highBid} cr`;
    return `${base} · B to bid ${this.nextBid(info)} cr`;
  }

  private tryBid() {
    const home = this.nearestHome();
    if (!home) return;
    const info = this.homes.get(home.id);

    // On your own doorstep B is the for-sale sign, not a bid.
    if (info && info.owner === this.wallet) {
      if (info.awaitingSeller) {
        this.openOffer(home.id);
        return;
      }
      if (info.forSale && info.endsAt > 0) {
        this.setNotice("Bidding has started — you cannot delist now.");
        return;
      }
      if (info.forSale) {
        this.room?.send("home-list", { id: home.id, list: false });
        return;
      }
      // Listing needs an asking price, so hand off to the HUD for the number.
      this.pendingListing = {
        id: home.id,
        suggested: info.lastPrice || this.homeOpeningBid,
        suggestedMinutes: 24 * 60,
      };
      return;
    }

    if (info?.owner && !info.forSale) {
      this.setNotice(`This home belongs to ${info.ownerName}`);
      return;
    }
    if (info && info.highBidderWallet === this.wallet) {
      this.setNotice("You are already the highest bidder.");
      return;
    }
    const amount = this.nextBid(info);
    if (this.credits < amount) {
      this.setNotice(`You need ${amount} credits to bid. You have ${this.credits}.`);
      return;
    }
    this.room?.send("home-bid", { id: home.id, city: home.city });
  }

  private applyNetworkVehicle(vehicle: RemoteVehicle, vehicleId: string) {
    if (!this.app) return;
    let handle = this.vehicles.get(vehicleId);
    if (!handle) {
      const entity = createVehicle(this.app.root, {
        id: vehicleId,
        x: vehicle.x,
        z: vehicle.z,
        rotY: vehicle.rotY,
        color: vehicle.color,
        kind: vehicle.kind,
      });
      handle = { id: vehicleId, entity, driver: "", kind: vehicle.kind };
      this.vehicles.set(vehicleId, handle);
    }
    handle.kind = vehicle.kind;
    if (vehicle.owner) this.vehicleOwners.set(vehicleId, vehicle.owner);
    else this.vehicleOwners.delete(vehicleId);
    this.vehicleLocks.set(vehicleId, Boolean(vehicle.locked));
    if (vehicle.owner && vehicle.owner === this.wallet) {
      this.ownedCars.set(vehicleId, {
        id: vehicleId,
        kind: vehicle.kind,
        color: vehicle.color,
        city: vehicle.city ?? this.city,
        locked: Boolean(vehicle.locked),
        x: vehicle.x,
        z: vehicle.z,
      });
    } else {
      this.ownedCars.delete(vehicleId);
    }
    const drivenHere = vehicle.driver === this.room?.sessionId && this.inVehicle === vehicleId;
    handle.driver = drivenHere ? "local" : vehicle.driver;
    if (!drivenHere) {
      handle.entity.setPosition(vehicle.x, WALK_Y, vehicle.z);
      handle.entity.setEulerAngles(0, (vehicle.rotY * 180) / Math.PI, 0);
    }
    const interactable = this.world?.interactables.find((item) => item.kind === "vehicle" && item.id === vehicleId);
    if (interactable) {
      interactable.x = vehicle.x;
      interactable.z = vehicle.z;
    }
  }

  private spawnRemote(player: RemotePlayer, sessionId: string) {
    if (!this.app || this.remotes.has(sessionId)) return;
    const entity = createCitizen(this.app.root, appearanceOf(player), `p-${sessionId}`);
    this.remotes.set(sessionId, entity);
    this.remoteState.set(sessionId, player);
    this.remoteNames.set(sessionId, player.name || "citizen");
    if (player.wallet) this.remoteWallets.set(sessionId, player.wallet);
    this.remoteLast.set(sessionId, { x: player.x, z: player.z });
    this.remoteLookKey.set(sessionId, `${player.accessories ?? ""}|${player.gun ?? ""}|${player.pet ?? ""}`);
    this.syncRemotePet(sessionId, player);
    this.applyRemote(sessionId);
  }

  private applyRemote(sessionId: string) {
    const player = this.remoteState.get(sessionId);
    const entity = this.remotes.get(sessionId);
    if (!player || !entity || !this.app) return;
    const key = `${player.accessories ?? ""}|${player.gun ?? ""}|${player.pet ?? ""}`;
    if (this.remoteLookKey.get(sessionId) !== key) {
      const pos = entity.getPosition();
      const enabled = entity.enabled;
      entity.destroy();
      const next = createCitizen(this.app.root, appearanceOf(player), `p-${sessionId}`);
      next.setPosition(pos.x, pos.y, pos.z);
      next.enabled = enabled;
      this.remotes.set(sessionId, next);
      this.remoteLookKey.set(sessionId, key);
      this.syncRemotePet(sessionId, player);
    }
    const body = this.remotes.get(sessionId)!;
    const groundedY = player.sitting || player.inBuilding ? player.y ?? WALK_Y : Math.max(player.y || 0, WALK_Y);
    body.setPosition(player.x, groundedY, player.z);
    body.setEulerAngles(0, (player.rotY * 180) / Math.PI, 0);
    // Distance cull: in a 452-unit world most players are nowhere near you,
    // and each one is 30-64 boxes with no batching.
    const here = this.player?.getPosition();
    const inRange = !here || Math.hypot(player.x - here.x, player.z - here.z) <= REMOTE_RENDER_RANGE;
    body.enabled = inRange && (!player.inBuilding || this.inBuilding?.id === player.buildingId);
    this.remoteNames.set(sessionId, player.name || "citizen");
    if (player.wallet) this.remoteWallets.set(sessionId, player.wallet);
    const pet = this.remotePets.get(sessionId);
    if (pet) pet.enabled = body.enabled;
  }

  private syncRemotes() {
    for (const id of this.remotes.keys()) this.applyRemote(id);
  }

  private dropRemote(sessionId: string) {
    this.remotes.get(sessionId)?.destroy();
    this.remotes.delete(sessionId);
    this.remoteState.delete(sessionId);
    this.remoteLast.delete(sessionId);
    this.remoteNames.delete(sessionId);
    this.remoteWallets.delete(sessionId);
    this.speech.delete(sessionId);
    this.remotePets.get(sessionId)?.destroy();
    this.remotePets.delete(sessionId);
    this.remotePetWalk.delete(sessionId);
    this.remoteLookKey.delete(sessionId);
    this.remoteKnockdowns.delete(sessionId);
  }

  private update(dt: number) {
    this.lastDt = dt;
    this.animT += dt;
    if (!this.player || !this.camera || !this.app) return;
    if (this.inVehicle) this.updateVehicle(dt);
    else this.updateWalk(dt);
    this.syncRemotes();
    this.animateCrowd();
    this.followCamera(dt);
    this.updateNametags();
    this.applyCityMood();
    this.followPet(dt);
    this.syncVoiceProximity();
    if (this.inBuilding?.interiorKind === "hospital") this.health = 100;
    this.warnHealth();
    // Match patchRate (20Hz). Anything faster is encoded and thrown away.
    this.lastMoveSync += dt;
    if (this.lastMoveSync >= 0.05) {
      this.lastMoveSync = 0;
      this.syncMove();
    }
    this.lastHud += dt;
    if (this.lastHud > 0.04) {
      this.lastHud = 0;
      this.emitHud();
    }
  }

  private syncVoiceProximity() {
    if (!this.voice || !this.player) return;
    const now = performance.now();
    if (now - this.voiceSyncAt < 250) return;
    this.voiceSyncAt = now;
    const origin = this.player.getPosition();
    const localBuilding = this.inBuilding?.id ?? null;
    const nearby = new Map<string, number>();
    for (const [sessionId, remote] of this.remoteState) {
      const remoteBuilding = remote.inBuilding ? remote.buildingId ?? null : null;
      if (Boolean(localBuilding) !== remote.inBuilding) continue;
      if (localBuilding && localBuilding !== remoteBuilding) continue;
      const distance = Math.hypot(remote.x - origin.x, remote.z - origin.z);
      if (distance <= VOICE_RANGE) nearby.set(sessionId, distance);
    }
    this.voice.syncNearby(nearby);
  }

  private toggleSit() {
    if (this.inVehicle || !this.player) return;
    if (this.sitting) {
      this.clearSit(true);
      return;
    }
    const seat = this.nearestSeat();
    if (!seat) return;
    this.sitOn(seat);
  }

  private sitOn(seat: Seat) {
    if (!this.player) return;
    this.sitSeat = seat;
    this.sitting = true;
    this.yaw = seat.yaw;
    this.grounded = true;
    this.vy = 0;
    this.player.setPosition(seat.x, seat.sitY, seat.z);
    this.player.setEulerAngles(0, (seat.yaw * 180) / Math.PI, 0);
  }

  private clearSit(snapToFloor = false) {
    this.sitting = false;
    this.sitSeat = null;
    if (snapToFloor && this.player) {
      const p = this.player.getPosition();
      const ground = this.inBuilding?.interior?.y ?? WALK_Y;
      this.player.setPosition(p.x, ground, p.z);
    }
  }

  private nearestSeat(): Seat | null {
    if (!this.player) return null;
    const p = this.player.getPosition();
    const indoor = Boolean(this.inBuilding);
    let best: Seat | null = null;
    let bestD = indoor ? 3.2 : 2.2;
    for (const seat of this.world?.seats ?? []) {
      const indoorSeat = seat.sitY > 40;
      if (indoor !== indoorSeat) continue;
      const d = Math.hypot(seat.x - p.x, seat.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = seat;
      }
    }
    return best;
  }

  private updateWalk(dt: number) {
    const player = this.player!;
    const turn =
      (this.keys.has("a") || this.keys.has("arrowleft") || this.pad.x < -0.3 ? 1 : 0) -
      (this.keys.has("d") || this.keys.has("arrowright") || this.pad.x > 0.3 ? 1 : 0);
    const forward =
      (this.keys.has("w") || this.keys.has("arrowup") || this.pad.z > 0.3 ? 1 : 0) -
      (this.keys.has("s") || this.keys.has("arrowdown") || this.pad.z < -0.3 ? 1 : 0);
    const sprint = this.keys.has("shift");
    const ground = this.inBuilding?.interior?.y ?? WALK_Y;

    const now = performance.now();
    if (this.knockdown) {
      if (now < this.knockdown.endsAt) {
        const p = player.getPosition();
        this.animateKnockdown(player, this.knockdown, this.yaw, ground);
        player.setPosition(p.x, ground + 0.16, p.z);
        return;
      }
      this.knockdown = null;
      player.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);
    }

    if (this.sitting) {
      if (forward || turn || this.keys.has(" ") || this.pad.x || this.pad.z) this.clearSit(true);
      else {
        applyCitizenMotion(player, "sit", this.animT);
        const seat = this.sitSeat;
        if (seat) {
          player.setPosition(seat.x, seat.sitY, seat.z);
          player.setEulerAngles(0, (seat.yaw * 180) / Math.PI, 0);
        }
        return;
      }
    }

    this.yaw += turn * dt * 2.4;
    const downed = this.health <= 0;
    const speed = (sprint && !downed ? this.speed * 1.55 : this.speed) * (downed ? 0.42 : 1);
    const pos = player.getPosition();
    let x = pos.x;
    let y = pos.y;
    let z = pos.z;
    const nx = x + Math.sin(this.yaw) * forward * speed * dt;
    const nz = z + Math.cos(this.yaw) * forward * speed * dt;

    if (this.inBuilding?.interior) {
      const cx = this.inBuilding.interior.x;
      const cz = this.inBuilding.interior.z;
      const hw = this.inBuilding.halfW ?? 4.2;
      const hd = this.inBuilding.halfD ?? 4.2;
      if (Math.abs(nx - cx) <= hw) x = nx;
      if (Math.abs(nz - cz) <= hd) z = nz;
    } else {
      if (!this.blocked(nx, z) && !this.vehicleBlocksMove(x, z, nx, z) && this.allowed(nx, z)) x = nx;
      if (!this.blocked(x, nz) && !this.vehicleBlocksMove(x, z, x, nz) && this.allowed(x, nz)) z = nz;
    }

    const moving = forward !== 0;
    const armed = Boolean(gunSpec(this.gun)?.ranged) && !downed;
    let bob = 0;
    // With a ranged weapon out the arms hold the aim; only a melee swing or a
    // hit reaction takes them back.
    if (this.punchUntil > now && !armed) bob = applyCitizenMotion(player, "punch", 1 - (this.punchUntil - now) / PUNCH_MS);
    else if (this.hitUntil > now) bob = applyCitizenMotion(player, "hit", 1 - (this.hitUntil - now) / HIT_MS);
    else bob = applyCitizenMotion(player, moving ? "walk" : "idle", this.animT * (sprint && moving ? 1.35 : 1));
    if (armed && this.hitUntil <= now) {
      applyAimPose(player, this.animT, Math.max(0, (this.punchUntil - now) / RECOIL_MS));
    }
    const floorY = ground + (this.grounded ? bob : 0);

    if (this.keys.has(" ") && this.grounded) {
      this.vy = this.inBuilding ? 4.2 : 7.4;
      this.grounded = false;
    }
    this.vy -= 24 * dt;
    y += this.vy * dt;
    if (y <= floorY) {
      y = floorY;
      this.vy = 0;
      this.grounded = true;
    }
    if (this.inBuilding?.ceiling) {
      const maxY = (this.inBuilding.interior?.y ?? y) + this.inBuilding.ceiling - 1.7;
      if (y > maxY) {
        y = maxY;
        this.vy = Math.min(this.vy, 0);
      }
    }

    player.setPosition(x, y, z);
    player.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);
  }

  private updateVehicle(dt: number) {
    const handle = this.vehicles.get(this.inVehicle ?? "");
    if (!handle || !this.player) return;
    const throttle =
      (this.keys.has("w") || this.keys.has("arrowup") || this.pad.z > 0.3 ? 1 : 0) -
      (this.keys.has("s") || this.keys.has("arrowdown") || this.pad.z < -0.3 ? 1 : 0);
    const steer =
      (this.keys.has("a") || this.keys.has("arrowleft") || this.pad.x < -0.3 ? 1 : 0) -
      (this.keys.has("d") || this.keys.has("arrowright") || this.pad.x > 0.3 ? 1 : 0);

    this.vehicleSpeed = pc.math.lerp(this.vehicleSpeed, throttle * 18, 1 - Math.pow(0.08, dt));
    // Hysteresis so the exit prompt does not flicker while creeping.
    const rolling = Math.abs(this.vehicleSpeed);
    if (rolling > 1.2) this.driving = true;
    else if (rolling < 0.4) this.driving = false;
    this.yaw += steer * dt * this.vehicleSpeed * 0.12;
    const pos = handle.entity.getPosition();
    const previousYaw = (handle.entity.getEulerAngles().y * Math.PI) / 180;
    const nx = pos.x + Math.sin(this.yaw) * this.vehicleSpeed * dt;
    const nz = pos.z + Math.cos(this.yaw) * this.vehicleSpeed * dt;
    const hitsVehicle = this.vehicleBlocksVehicleMove(handle.id, nx, nz, this.yaw, handle.kind);
    if (this.allowed(nx, nz) && !this.blocked(nx, nz, 2.1) && !hitsVehicle) {
      handle.entity.setPosition(nx, WALK_Y, nz);
      this.player.setPosition(nx, WALK_Y, nz);
    } else if (hitsVehicle) {
      this.vehicleSpeed = 0;
      this.yaw = previousYaw;
    }
    handle.entity.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);
    this.player.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);
    this.player.enabled = false;
    const roll = this.vehicleSpeed * dt * 36;
    for (const name of ["wheel-fl", "wheel-fr", "wheel-bl", "wheel-br"]) {
      handle.entity.findByName(name)?.rotateLocal(roll, 0, 0);
    }
    const actual = handle.entity.getPosition();
    this.room?.send("vehicle-move", {
      id: handle.id,
      x: actual.x,
      z: actual.z,
      rotY: this.yaw,
      speed: this.vehicleSpeed,
    });
  }

  private animateCrowd() {
    const now = performance.now();
    for (const [id, entity] of this.remotes) {
      const st = this.remoteState.get(id);
      const p = entity.getPosition();
      const x = st?.x ?? p.x;
      const z = st?.z ?? p.z;
      const punchUntil = this.meleePunch.get(id) ?? 0;
      const hitUntil = this.meleeHit.get(id) ?? 0;
      const knockdown = this.remoteKnockdowns.get(id);
      if (knockdown) {
        if (now < knockdown.endsAt) {
          this.animateKnockdown(entity, knockdown, st?.rotY ?? 0, st?.y ?? WALK_Y);
          entity.setPosition(x, (st?.y ?? WALK_Y) + 0.16, z);
          this.remoteLast.set(id, { x, z });
          continue;
        }
        this.remoteKnockdowns.delete(id);
      }
      const remoteArmed = Boolean(gunSpec(String(st?.gun ?? ""))?.ranged);
      if (punchUntil > now && !remoteArmed) {
        applyCitizenMotion(entity, "punch", 1 - (punchUntil - now) / PUNCH_MS);
        entity.setPosition(x, st?.y ?? p.y, z);
        continue;
      }
      if (st?.sitting) {
        applyCitizenMotion(entity, "sit", this.animT);
        entity.setPosition(x, st.y ?? p.y, z);
        this.remoteLast.set(id, { x, z });
        continue;
      }
      if (hitUntil > now) {
        applyCitizenMotion(entity, "hit", 1 - (hitUntil - now) / HIT_MS);
        entity.setPosition(x, st?.y ?? p.y, z);
        this.remoteLast.set(id, { x, z });
        continue;
      }
      const last = this.remoteLast.get(id);
      const moving = last ? Math.hypot(x - last.x, z - last.z) > 0.004 : false;
      const bob = applyCitizenMotion(entity, moving ? "walk" : "idle", this.animT);
      if (remoteArmed) applyAimPose(entity, this.animT, Math.max(0, (punchUntil - now) / RECOIL_MS));
      entity.setPosition(x, Math.max(p.y, WALK_Y + bob), z);
      this.remoteLast.set(id, { x, z });
    }
    if (this.world) {
      const obstacles = [...this.vehicles.values()].map((handle) => {
        const p = handle.entity.getPosition();
        return {
          id: handle.id,
          x: p.x,
          z: p.z,
          yaw: (handle.entity.getEulerAngles().y * Math.PI) / 180,
          kind: handle.kind,
        };
      });
      tickNpcs(this.world.npcs, this.lastDt, this.animT, obstacles);
    }
  }

  private followCamera(dt: number) {
    const player = this.player!;
    const cam = this.camera!;
    const pos = player.getPosition();
    const indoor = this.inBuilding;
    const kind = indoor?.interiorKind;
    const dist = indoor ? (kind === "townhall" ? 7.6 : kind === "home" ? 3.5 : kind === "store" ? 4.8 : 5.1) : 16;
    const elev = indoor ? Math.max(-0.28, Math.min(0.48, this.pitch)) : this.pitch;
    const planar = Math.cos(elev) * dist;
    let targetX = pos.x - Math.sin(this.yaw) * planar;
    let targetY = pos.y + (indoor ? 1.45 : 2.1) + Math.sin(elev) * (indoor ? dist * 0.5 : dist);
    let targetZ = pos.z - Math.cos(this.yaw) * planar;

    if (indoor?.interior) {
      const m = 0.9;
      const cx = indoor.interior.x;
      const cz = indoor.interior.z;
      const hw = indoor.halfW ?? 4;
      const hd = indoor.halfD ?? 4;
      targetX = Math.min(cx + hw - m, Math.max(cx - hw + m, targetX));
      targetZ = Math.min(cz + hd - m, Math.max(cz - hd + m, targetZ));
      const ceil = indoor.interior.y + (indoor.ceiling ?? 3.6) - 0.4;
      targetY = Math.min(ceil, Math.max(pos.y + 1.25, targetY));
    } else {
      targetY = Math.max(pos.y + 1.5, targetY);
    }

    const cur = cam.getPosition();
    const t = this.snapCamera ? 1 : 1 - Math.pow(indoor ? 0.0002 : 0.001, dt);
    this.snapCamera = false;
    cam.setPosition(
      cur.x + (targetX - cur.x) * t,
      cur.y + (targetY - cur.y) * t,
      cur.z + (targetZ - cur.z) * t,
    );
    const lookAhead = indoor ? 2.4 : 6;
    const lookHeight = indoor ? 1.35 : Math.max(0.4, 1.6 + (0.38 - elev) * 18);
    cam.lookAt(pos.x + Math.sin(this.yaw) * lookAhead, pos.y + lookHeight, pos.z + Math.cos(this.yaw) * lookAhead);
  }

  private applyCityMood() {
    if (!this.player || !this.app || !this.camera?.camera) return;
    const pos = this.player.getPosition();
    const zone = cityAtPosition(pos.x, pos.z);
    const day = dayFactor(this.settings?.timeOfDay);
    if (zone !== "gate" && zone !== "void") {
      this.city = zone;
      const theme = CITIES[zone];
      const pal = applySkyCycle(this.app, theme, day);
      this.camera.camera.clearColor = new pc.Color(pal.sky[0], pal.sky[1], pal.sky[2]);
      this.app.scene.fog.end = 90 + day * 80 + (1 - theme.fogDensity * 20) * 40;
    }
    const key = `${this.city}|${this.inBuilding ? 1 : 0}|${this.settings?.timeOfDay ?? "Local Time"}`;
    if (Math.abs(day - this.lastCycle) > 0.012 || key !== this.lastCycleKey) {
      this.lastCycle = day;
      this.lastCycleKey = key;
      setCycleGlow(1 - day);
      for (const wash of this.world?.nightWashes ?? []) wash.enabled = day < 0.42;
    }
    if (this.inBuilding) {
      const kind = this.inBuilding.interiorKind;
      this.app.scene.fog.start = 12;
      this.app.scene.fog.end = kind === "townhall" ? 48 : 32;
      this.camera.camera.fov = kind === "townhall" ? 50 : 56;
      this.camera.camera.farClip = 60;
      this.app.scene.ambientLight = new pc.Color(0.55, 0.52, 0.48);
    } else if (this.camera.camera.fov !== 42) {
      this.camera.camera.fov = 42;
      this.camera.camera.farClip = 70 + (this.settings?.renderDistance ?? 40) * 2.6;
      this.app.scene.fog.start = 50;
    }
  }

  private blocked(x: number, z: number, radius = 0.55) {
    return this.world?.colliders.some((a) => hitsAabb(x, z, radius, a)) ?? false;
  }

  private vehicleBlocksMove(fromX: number, fromZ: number, toX: number, toZ: number) {
    for (const [id, handle] of this.vehicles) {
      if (id === this.inVehicle || !handle.entity.enabled) continue;
      const position = handle.entity.getPosition();
      const yaw = (handle.entity.getEulerAngles().y * Math.PI) / 180;
      const depthAt = (x: number, z: number) => {
        const dx = x - position.x;
        const dz = z - position.z;
        const across = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
        const along = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw));
        return Math.min(1.6 - across, 3.15 - along);
      };
      const nextDepth = depthAt(toX, toZ);
      if (nextDepth <= 0) continue;
      const currentDepth = depthAt(fromX, fromZ);
      if (currentDepth <= 0 || nextDepth >= currentDepth) return true;
    }
    for (const npc of this.world?.npcs ?? []) {
      if (!npc.vehicle) continue;
      const position = npc.vehicle.getPosition();
      const yaw = (npc.vehicle.getEulerAngles().y * Math.PI) / 180;
      const depthAt = (x: number, z: number) => {
        const dx = x - position.x;
        const dz = z - position.z;
        const across = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
        const along = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw));
        return Math.min(1.6 - across, 3.15 - along);
      };
      const nextDepth = depthAt(toX, toZ);
      if (nextDepth <= 0) continue;
      const currentDepth = depthAt(fromX, fromZ);
      if (currentDepth <= 0 || nextDepth >= currentDepth) return true;
    }
    return false;
  }

  private vehicleBlocksVehicleMove(movingId: string, x: number, z: number, yaw: number, kind: string) {
    const moving = this.vehicles.get(movingId);
    for (const [id, other] of this.vehicles) {
      if (id === movingId || !other.entity.enabled) continue;
      const position = other.entity.getPosition();
      const otherYaw = (other.entity.getEulerAngles().y * Math.PI) / 180;
      if (!vehiclesOverlap(x, z, yaw, kind, position.x, position.z, otherYaw, other.kind)) continue;
      if (moving) {
        const current = moving.entity.getPosition();
        const currentYaw = (moving.entity.getEulerAngles().y * Math.PI) / 180;
        const alreadyOverlapping = vehiclesOverlap(
          current.x,
          current.z,
          currentYaw,
          kind,
          position.x,
          position.z,
          otherYaw,
          other.kind,
        );
        if (alreadyOverlapping && Math.hypot(x - position.x, z - position.z) > Math.hypot(current.x - position.x, current.z - position.z)) {
          continue;
        }
      }
      return true;
    }
    for (const npc of this.world?.npcs ?? []) {
      if (!npc.vehicle) continue;
      const position = npc.vehicle.getPosition();
      const otherYaw = (npc.vehicle.getEulerAngles().y * Math.PI) / 180;
      const otherKind = npc.vehicleKind ?? "sedan";
      if (!vehiclesOverlap(x, z, yaw, kind, position.x, position.z, otherYaw, otherKind)) continue;
      if (moving) {
        const current = moving.entity.getPosition();
        const currentYaw = (moving.entity.getEulerAngles().y * Math.PI) / 180;
        const alreadyOverlapping = vehiclesOverlap(
          current.x,
          current.z,
          currentYaw,
          kind,
          position.x,
          position.z,
          otherYaw,
          otherKind,
        );
        if (alreadyOverlapping && Math.hypot(x - position.x, z - position.z) > Math.hypot(current.x - position.x, current.z - position.z)) {
          continue;
        }
      }
      return true;
    }
    return false;
  }

  private allowed(x: number, z: number) {
    if (cityAtPosition(x, z) === "void") return false;
    // The ring road outside the walls is open to everyone; the gate is the gate.
    const inside = insideCityWalls(x, z);
    if (!inside) return true;
    if (!canEnterCity(this.accessTier, inside)) {
      this.gateMessage = `${CITIES[inside].name} is gated to Tier ${CITIES[inside].tier}+. Higher-city citizens can come down; you cannot go up yet.`;
      this.gateUntil = performance.now() + 2600;
      return false;
    }
    return true;
  }

  private nearestInteractable(): Interactable | null {
    if (!this.player || !this.world) return null;
    const p = this.player.getPosition();
    let best: Interactable | null = null;
    let bestD = 99;
    for (const item of this.world.interactables) {
      const d = Math.hypot(item.x - p.x, item.z - p.z);
      if (d < item.radius && d < bestD) {
        best = item;
        bestD = d;
      }
    }
    return best;
  }

  private enterVehicle(id: string) {
    const handle = this.vehicles.get(id);
    if (!handle || handle.driver) return;
    const owner = this.vehicleOwners.get(id);
    if (owner && owner !== this.wallet && this.vehicleLocks.get(id)) {
      this.setNotice("That car is locked.");
      return;
    }
    handle.driver = "local";
    this.inVehicle = id;
    this.vehicleSpeed = 0;
    this.driving = false;
    this.vy = 0;
    this.grounded = true;
    if (this.player) this.player.enabled = false;
    this.room?.send("enter-vehicle", { id });
  }

  private exitVehicle() {
    const handle = this.vehicles.get(this.inVehicle ?? "");
    if (handle) {
      handle.driver = "";
      const p = handle.entity.getPosition();
      this.player?.setPosition(p.x + 2.8, WALK_Y, p.z);
    }
    this.inVehicle = null;
    this.driving = false;
    this.vy = 0;
    this.grounded = true;
    if (this.player) this.player.enabled = true;
    this.room?.send("exit-vehicle");
  }

  private enterBuilding(door: Interactable) {
    if (!door.interior || !this.player) return;
    const home = door.interiorKind === "home" ? this.homes.get(door.id) : null;
    if (home?.owner && home.locked && home.owner !== this.wallet) {
      this.setNotice(`${home.ownerName || "Someone"} has this home locked.`);
      return;
    }
    const interior = this.world?.interiors.get(door.id);
    if (interior) interior.enabled = true;
    const spawnZ = door.spawnZ ?? (door.halfD ?? 3) - 0.4;
    this.player.setPosition(door.interior.x, door.interior.y, door.interior.z + spawnZ);
    this.yaw = Math.PI;
    this.pitch = 0.16;
    this.snapCamera = true;
    this.clearSit();
    this.vy = 0;
    this.grounded = true;
    this.inBuilding = door;
    if (door.interiorKind === "hospital") this.health = 100;
    this.syncRemotes();
    this.room?.send("enter-building", { id: door.id });
  }

  private exitBuilding() {
    const door = this.inBuilding;
    if (!door?.exterior || !this.player) return;
    const interior = this.world?.interiors.get(door.id);
    if (interior) interior.enabled = false;
    this.player.setPosition(door.exterior.x, WALK_Y, door.exterior.z);
    this.pitch = 0.38;
    this.snapCamera = true;
    this.vy = 0;
    this.grounded = true;
    this.inBuilding = null;
    this.clearSit();
    this.syncRemotes();
    this.room?.send("exit-building");
  }

  private syncMove() {
    if (!this.player || this.inVehicle) return;
    const p = this.player.getPosition();
    this.room?.send("move", { x: p.x, y: p.y, z: p.z, rotY: this.yaw, sitting: this.sitting });
  }

  private emitHud() {
    if (!this.player || !this.onHud) return;
    const p = this.player.getPosition();
    const near = this.nearestInteractable();
    let prompt: string | null = null;
    if (this.inVehicle) prompt = this.driving ? null : "Press E to exit vehicle";
    else if (this.inBuilding?.interiorKind === "store") prompt = "Store — press I to shop · E to exit";
    else if (this.inBuilding?.interiorKind === "hospital") prompt = "Hospital — health refilling · E to exit";
    else if (this.inBuilding && !this.sitting && !this.nearestSeat()) prompt = "Press E to exit building";
    else if (this.sitting) prompt = "Press C or WASD to stand";
    else if (this.nearestSeat()) prompt = "Press C to sit";
    else if (this.inBuilding) prompt = "Press E to exit building";
    else if (near?.kind === "vehicle") prompt = this.vehiclePrompt(near.id);
    else if (near?.kind === "door") prompt = this.doorPrompt(near);
    else if (near?.kind === "buy-car") prompt = `Press E to buy the ${near.label ?? "car"}`;

    const nearbyPlayer = this.findNearbyRemote();
    const reach = gunSpec(this.gun) ?? UNARMED;
    const punchTarget = this.findTarget(reach.range, reach.aim, reach.spread);
    if (!prompt && !this.inVehicle && punchTarget) {
      const verb = reach === UNARMED ? "punch" : "ranged" in reach && reach.ranged ? "shoot" : `hit with the ${gunSpec(this.gun)?.label}`;
      prompt = `F or click to ${verb} ${punchTarget.name}`;
    }
    if (!prompt && !this.inVehicle && nearbyPlayer)
      prompt = `Press Enter to message ${nearbyPlayer.name} · T to trade`;

    const online = new Map<string, { sessionId: string; city: string }>();
    for (const [id, wallet] of this.remoteWallets) {
      online.set(wallet, { sessionId: id, city: this.remoteState.get(id)?.city ?? "" });
    }
    const friendWallets = new Set(
      this.friends.filter((f) => f.status === "friend").map((f) => f.wallet),
    );
    const friendSessions = new Set(
      [...this.remoteWallets.entries()].filter(([, w]) => friendWallets.has(w)).map(([id]) => id),
    );

    const citizens: MapCitizen[] = [
      {
        sessionId: this.room?.sessionId ?? "local",
        name: this.localName,
        x: p.x,
        z: p.z,
        you: true,
        indoors: Boolean(this.inBuilding),
        friend: false,
      },
    ];
    for (const [id, entity] of this.remotes) {
      const q = entity.getPosition();
      citizens.push({
        sessionId: id,
        name: this.remoteNames.get(id) || "citizen",
        x: q.x,
        z: q.z,
        you: false,
        indoors: Boolean(this.remoteState.get(id)?.inBuilding),
        friend: friendSessions.has(id),
      });
    }

    this.onHud({
      city: this.city,
      prompt,
      fps: Math.round(1 / Math.max(this.lastDt, 0.008)),
      x: p.x,
      z: p.z,
      block: `BLK ${String(7).padStart(2, "0")} · ${Math.round(128 + p.x).toString().padStart(3, "0")}, ${Math.round(42 + p.z)
        .toString()
        .padStart(3, "0")}`,
      health: clampHealth(this.health),
      nearbyPlayer,
      nametags: this.nametags,
      whispers: this.whispers,
      lastWhisper: this.lastWhisper,
      gateMessage: performance.now() < this.gateUntil ? this.gateMessage : null,
      chat: this.chat,
      citizens,
      connected: Boolean(this.room),
      credits: this.credits,
      inventory: this.inventory,
      inStore: this.inBuilding?.interiorKind === "store",
      gun: this.gun,
      pet: this.petKind,
      accessories: this.look?.accessories ?? [],
      pendingTrade: this.pendingTrade,
      voiceLevel: this.voice?.sampleLevel() ?? 0,
      notice: performance.now() < this.noticeUntil ? this.notice : null,
      listPrompt: this.pendingListing,
      offerPrompt: this.pendingOffer,
      messages: this.messages,
      unreadMessages: this.messages.reduce((n, m) => n + (m.read ? 0 : 1), 0),
      sessionEnded: this.sessionEnded,
      joinFailure: this.joinFailure,
      roster: this.roster,
      ownedHomes: [...this.homes.values()]
        .filter((home) => home.owner === this.wallet)
        .map((home) => ({
          id: home.id,
          city: home.city,
          lastPrice: home.lastPrice,
          forSale: home.forSale,
          askingPrice: home.askingPrice,
          highBid: home.highBid,
          awaitingSeller: home.awaitingSeller,
          locked: home.locked,
        })),
      ownedCars: [...this.ownedCars.values()],
      friends: this.friends.map((f) => {
        // Presence is authoritative from the server; `here` only tells us
        // whether they are close enough to be in our view right now.
        const here = online.get(f.wallet);
        return {
          wallet: f.wallet,
          name: f.name,
          status: f.status,
          online: f.online ?? Boolean(here),
          sessionId: here?.sessionId ?? null,
          city: here?.city ?? null,
        };
      }),
      friendRequests: this.friends.reduce((n, f) => n + (f.status === "incoming" ? 1 : 0), 0),
      heading: this.yaw,
      accessTier: this.accessTier,
      aimTarget: reach.ranged && punchTarget ? punchTarget.name : null,
    });
  }

  private pushWhisper(line: WhisperLine) {
    if (this.whispers.some((w) => w.id === line.id)) return;
    this.whispers = [...this.whispers.slice(-80), line];
    this.lastWhisper = line;
  }

  private updateNametags() {
    const cam = this.camera;
    const player = this.player;
    const app = this.app;
    if (!cam?.camera || !player || !app) {
      this.nametags = [];
      return;
    }
    const now = performance.now();
    const origin = player.getPosition();
    const ox = origin.x;
    const oz = origin.z;
    const canvas = app.graphicsDevice.canvas;
    const tags: Nametag[] = [];
    for (const [id, entity] of this.remotes) {
      if (!entity.enabled) continue;
      const q = entity.getPosition();
      const dist = Math.hypot(q.x - ox, q.z - oz);
      if (dist > NAMETAG_RANGE) continue;
      const screen = this.projectToScreen(q.x, q.y + 2.35, q.z);
      if (!screen) continue;
      const speech = this.speech.get(id);
      tags.push({
        sessionId: id,
        name: this.remoteNames.get(id) || "citizen",
        x: (screen.x / app.graphicsDevice.width) * canvas.clientWidth,
        y: (screen.y / app.graphicsDevice.height) * canvas.clientHeight,
        visible: screen.x > -40 && screen.y > -20 && screen.x < app.graphicsDevice.width + 40 && screen.y < app.graphicsDevice.height + 20,
        inRange: dist < TALK_RANGE,
        bubble: speech && speech.until > now ? speech.text : null,
        kind: "player",
      });
    }
    const localId = this.room?.sessionId ?? "local";
    const localScreen = this.projectToScreen(ox, player.getPosition().y + 2.35, oz);
    if (localScreen) {
      const speech = this.speech.get(localId);
      tags.push({
        sessionId: localId,
        name: this.localName,
        x: (localScreen.x / app.graphicsDevice.width) * canvas.clientWidth,
        y: (localScreen.y / app.graphicsDevice.height) * canvas.clientHeight,
        visible:
          localScreen.x > -40 &&
          localScreen.y > -20 &&
          localScreen.x < app.graphicsDevice.width + 40 &&
          localScreen.y < app.graphicsDevice.height + 20,
        inRange: false,
        bubble: speech && speech.until > now ? speech.text : null,
        kind: "player",
      });
    }
    const BUILDING_LABEL_RANGE = 72;
    // Price tags on the forecourt cars are only useful once you are on the lot.
    // A building name is a landmark you navigate by; these are not.
    const CAR_LABEL_RANGE = 22;
    for (const item of this.world?.interactables ?? []) {
      if (!item.label) continue;
      const bx = item.interior?.x ?? item.x;
      const bz = item.interior?.z ?? item.z;
      const by = item.labelY ?? 8;
      const dist = Math.hypot(bx - ox, bz - oz);
      if (dist > (item.kind === "buy-car" ? CAR_LABEL_RANGE : BUILDING_LABEL_RANGE)) continue;
      const screen = this.projectToScreen(bx, by, bz);
      if (!screen) continue;
      tags.push({
        sessionId: `building:${item.id}`,
        name: item.label,
        x: (screen.x / app.graphicsDevice.width) * canvas.clientWidth,
        y: (screen.y / app.graphicsDevice.height) * canvas.clientHeight,
        visible: screen.x > -40 && screen.y > -20 && screen.x < app.graphicsDevice.width + 40 && screen.y < app.graphicsDevice.height + 20,
        inRange: false,
        bubble: null,
        kind: "building",
      });
    }

    const nowMs = Date.now();
    for (const item of this.world?.interactables ?? []) {
      if (item.interiorKind !== "home") continue;
      const info = this.homes.get(item.id);
      const live = Boolean(info && info.endsAt > nowMs);
      const owned = Boolean(info?.owner);
      const mine = Boolean(info && info.owner === this.wallet);
      // An unowned home is always on the market; an owned one only when relisted.
      const onMarket = !owned || Boolean(info?.forSale);
      const hx = item.interior?.x ?? item.x;
      const hz = item.interior?.z ?? item.z;
      const dist = Math.hypot(hx - ox, hz - oz);
      // A running auction is worth seeing from across the block; a plain
      // for-sale sign only shows once you walk up to the place.
      if (dist > (live || owned ? BUILDING_LABEL_RANGE : HOME_SALE_LABEL_RANGE)) continue;
      const screen = this.projectToScreen(hx, item.labelY ?? 9, hz);
      if (!screen) continue;

      let name: string;
      let detail: string | null;
      let tone: "sale" | "auction" | "sold";
      if (info?.awaitingSeller) {
        name = "OFFER PENDING";
        detail = mine ? `${info.highBid} cr · B to answer` : `${info.highBid} cr · awaiting seller`;
        tone = "auction";
      } else if (live && info) {
        name = formatCountdown(info.endsAt - nowMs);
        const leader = info.highBidderWallet === this.wallet ? "you" : info.highBidderName;
        detail = `${info.highBid} cr · ${leader}`;
        tone = "auction";
      } else if (onMarket) {
        name = "FOR SALE";
        const asking = this.nextBid(info);
        if (dist < HOME_BID_RANGE) {
          detail = mine ? `your listing at ${asking} cr · B to withdraw` : `Press B to bid ${asking} cr`;
        } else {
          detail = `${asking} cr${mine ? " · yours" : ""}`;
        }
        tone = "sale";
      } else if (info) {
        name = mine ? "YOUR HOME" : "SOLD";
        detail = mine
          ? dist < HOME_BID_RANGE
            ? "Press B to list for sale"
            : null
          : info.ownerName || null;
        tone = "sold";
      } else {
        continue;
      }

      tags.push({
        sessionId: `home:${item.id}`,
        name,
        x: (screen.x / app.graphicsDevice.width) * canvas.clientWidth,
        y: (screen.y / app.graphicsDevice.height) * canvas.clientHeight,
        visible:
          screen.x > -40 && screen.y > -20 && screen.x < app.graphicsDevice.width + 40 && screen.y < app.graphicsDevice.height + 20,
        inRange: dist < HOME_BID_RANGE,
        bubble: null,
        kind: "home",
        detail,
        tone,
      });
    }
    this.nametags = tags;
  }

  private projectToScreen(x: number, y: number, z: number) {
    const cam = this.camera;
    if (!cam?.camera) return null;
    this.tmpWorld.set(x, y, z);
    const toX = x - cam.getPosition().x;
    const toY = y - cam.getPosition().y;
    const toZ = z - cam.getPosition().z;
    const fwd = cam.forward;
    if (toX * fwd.x + toY * fwd.y + toZ * fwd.z <= 0.4) return null;
    cam.camera.worldToScreen(this.tmpWorld, this.tmpScreen);
    return this.tmpScreen;
  }

  private findNearbyRemote() {
    if (!this.player) return null;
    const p = this.player.getPosition();
    let best: { sessionId: string; name: string } | null = null;
    let bestD = TALK_RANGE;
    for (const [id, entity] of this.remotes) {
      if (!entity.enabled) continue;
      const q = entity.getPosition();
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = { sessionId: id, name: this.remoteNames.get(id) || "citizen" };
      }
    }
    return best;
  }

  tryPunch() {
    if (this.inVehicle || !this.player || this.health <= 0) return;
    const spec = gunSpec(this.gun);
    if (spec?.ranged) {
      this.shoot(spec);
      return;
    }

    const melee = spec ?? UNARMED;
    const now = performance.now();
    if (now < this.punchReady) return;
    this.punchReady = now + melee.cooldownMs;
    this.punchUntil = now + PUNCH_MS;
    this.clearSit(true);

    const target = this.findTarget(melee.range, melee.aim, melee.spread);
    if (!target) return;
    if (target.kind === "player") this.room?.send("punch", { toSession: target.id });
    else this.hitNpc(target.npc, melee.damage);
  }

  private shoot(spec: NonNullable<ReturnType<typeof gunSpec>>) {
    const now = performance.now();
    if (now < this.punchReady) return;
    this.punchReady = now + spec.cooldownMs;
    this.punchUntil = now + RECOIL_MS;
    this.clearSit(true);

    const target = this.findTarget(spec.range, spec.aim, spec.spread);
    const from = this.player!.getPosition();
    const hit = target
      ? target.kind === "player"
        ? this.remotes.get(target.id)?.getPosition()
        : target.npc.entity.getPosition()
      : null;

    // Always draw the shot, so a miss reads as a miss rather than as nothing.
    const dx = Math.sin(this.yaw);
    const dz = Math.cos(this.yaw);
    this.drawTracer(
      from.x + dx * 0.6,
      from.y + 1.35,
      from.z + dz * 0.6,
      hit ? hit.x : from.x + dx * spec.range,
      hit ? hit.y + 1.2 : from.y + 1.35,
      hit ? hit.z : from.z + dz * spec.range,
    );

    if (!target) return;
    if (target.kind === "player") this.room?.send("shoot", { toSession: target.id });
    else this.hitNpc(target.npc, spec.damage);
  }

  /** A thin emissive streak along the shot, cleaned up on a timer. */
  private drawTracer(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    if (!this.app) return;
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    if (len < 0.2) return;
    const tracer = new pc.Entity("tracer");
    tracer.addComponent("render", {
      type: "box",
      material: material("#FFE7A0", { emissive: "#FFF3C4", intensity: 8 }),
    });
    tracer.setLocalScale(0.055, 0.055, len);
    tracer.setPosition((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    tracer.lookAt(x2, y2, z2);
    this.app.root.addChild(tracer);
    window.setTimeout(() => tracer.destroy(), 70);
  }

  private findTarget(
    range: number,
    aim: number,
    spread = 0,
  ): { kind: "player"; id: string; name: string } | { kind: "npc"; npc: NpcAgent; name: string } | null {
    if (!this.player) return null;
    const p = this.player.getPosition();
    let bestD = range;
    let best: { kind: "player"; id: string; name: string } | { kind: "npc"; npc: NpcAgent; name: string } | null = null;
    for (const [id, entity] of this.remotes) {
      if (!entity.enabled) continue;
      const st = this.remoteState.get(id);
      if (st?.inBuilding && String(st.buildingId ?? "").includes("hospital")) continue;
      const q = entity.getPosition();
      if (!this.onTarget(p.x, p.z, q.x, q.z, bestD, aim, spread)) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      bestD = d;
      best = { kind: "player", id, name: this.remoteNames.get(id) || "citizen" };
    }
    if (best) return best;
    for (const npc of this.world?.npcs ?? []) {
      if (npc.health <= 0 || npc.vehicle) continue;
      const q = npc.entity.getPosition();
      if (!this.onTarget(p.x, p.z, q.x, q.z, bestD, aim, spread)) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      bestD = d;
      best = { kind: "npc", npc, name: "citizen" };
    }
    return best;
  }

  /**
   * Melee swings in a forward arc (`aim` is a cosine threshold). Ranged weapons
   * use a corridor of fixed width instead, so aiming feels the same whether the
   * target is two metres away or thirty.
   */
  private onTarget(px: number, pz: number, qx: number, qz: number, range: number, aim: number, spread: number) {
    const dx = qx - px;
    const dz = qz - pz;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 0.08) return false;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (spread > 0) {
      const along = dx * fx + dz * fz;
      if (along <= 0) return false;
      // Perpendicular distance from the aim line.
      return Math.abs(dx * fz - dz * fx) <= spread;
    }
    return (dx * fx + dz * fz) / d > aim;
  }

  private hitNpc(npc: NpcAgent, damage = 18) {
    const p = this.player!.getPosition();
    const q = npc.entity.getPosition();
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    npc.health = Math.max(0, npc.health - damage);
    npc.hitUntil = performance.now() + HIT_MS;
    npc.entity.setPosition(q.x + (dx / d) * 1.05, q.y, q.z + (dz / d) * 1.05);
    if (npc.health <= 0) {
      npc.wait = 4;
    }
  }

  private onMelee(msg: { fromSession: string; toSession: string; health: number; x: number; z: number }) {
    const now = performance.now();
    const me = this.room?.sessionId;
    if (msg.fromSession !== me) this.meleePunch.set(msg.fromSession, now + PUNCH_MS);
    if (msg.toSession === me && this.player) {
      this.health = msg.health;
      this.hitUntil = now + HIT_MS;
      this.clearSit(true);
      this.player.setPosition(msg.x, this.player.getPosition().y, msg.z);
      if (this.health <= 0) {
        this.gateMessage = "You're down. Get to a hospital.";
        this.gateUntil = now + 3200;
      }
    } else {
      this.meleeHit.set(msg.toSession, now + HIT_MS);
    }
  }

  private onVehicleHit(msg: {
    targetSession: string;
    health: number;
    damage: number;
    speed: number;
    x: number;
    z: number;
    knockedMs: number;
  }) {
    const now = performance.now();
    const state = this.makeKnockdown(now, msg.knockedMs);
    if (msg.targetSession === this.room?.sessionId && this.player) {
      this.health = msg.health;
      this.clearSit(true);
      this.knockdown = state;
      this.vy = 0;
      this.grounded = true;
      this.player.setPosition(msg.x, WALK_Y + 0.16, msg.z);
      this.gateMessage = `Hit by a car at ${Math.round(msg.speed)} speed · -${msg.damage} health`;
      this.gateUntil = now + 3000;
    } else {
      this.remoteKnockdowns.set(msg.targetSession, state);
    }
  }

  private makeKnockdown(startedAt: number, duration: number): KnockdownState {
    const total = Math.max(1500, duration);
    return {
      startedAt,
      fallEndsAt: startedAt + 340,
      lieEndsAt: startedAt + total - 650,
      endsAt: startedAt + total,
    };
  }

  private animateKnockdown(entity: pc.Entity, state: KnockdownState, yaw: number, ground: number) {
    const now = performance.now();
    let angle = 88;
    if (now < state.fallEndsAt) {
      const p = Math.max(0, Math.min(1, (now - state.startedAt) / (state.fallEndsAt - state.startedAt)));
      const eased = 1 - Math.pow(1 - p, 3);
      angle *= eased;
      applyCitizenMotion(entity, "fall", p);
    } else if (now < state.lieEndsAt) {
      applyCitizenMotion(entity, "down", 1);
    } else {
      const p = Math.max(0, Math.min(1, (now - state.lieEndsAt) / (state.endsAt - state.lieEndsAt)));
      const eased = p * p * (3 - 2 * p);
      angle *= 1 - eased;
      applyCitizenMotion(entity, "getup", p);
    }
    entity.setPosition(entity.getPosition().x, ground + 0.16, entity.getPosition().z);
    entity.setEulerAngles(0, (yaw * 180) / Math.PI, angle);
  }

  private warnHealth() {
    if (!this.settings?.healthWarnings) {
      this.lastHealth = this.health;
      return;
    }
    if (this.lastHealth >= 20 && this.health < 20 && this.health > 0) {
      this.gateMessage = "Health is low. Get to a hospital.";
      this.gateUntil = performance.now() + 2800;
    }
    this.lastHealth = this.health;
  }

  private persistBag() {
    const c = loadCharacter();
    if (c) {
      saveCharacter(
        {
          ...c,
          credits: this.credits,
          inventory: this.inventory,
          accessories: this.look?.accessories ?? c.accessories,
          equippedGun: this.gun,
          equippedPet: this.petKind,
          brokemeter: clampHealth(this.health),
        },
        loadWallet()?.chain,
      );
    }
    this.room?.send("loadout", {
      inventory: encodeInventory(this.inventory),
      credits: this.credits,
      gun: this.gun ?? "",
      pet: this.petKind ?? "",
      accessories: (this.look?.accessories ?? []).join(","),
    });
  }

  private refreshLook() {
    if (!this.app || !this.player || !this.look) return;
    const pos = this.player.getPosition();
    const enabled = this.player.enabled;
    this.player.destroy();
    this.player = createCitizen(this.app.root, { ...this.look, gun: this.gun }, "local-player");
    this.player.setPosition(pos.x, pos.y, pos.z);
    this.player.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);
    this.player.enabled = enabled;
    this.persistBag();
  }

  private syncPet() {
    this.petEntity?.destroy();
    this.petEntity = null;
    this.petWalk = null;
    if (this.petKind && this.app) {
      this.petEntity = createPet(this.app.root, this.petKind, "local-pet");
      this.petWalk = createPetWalker(this.petEntity, this.petKind);
    }
  }

  private syncRemotePet(sessionId: string, player: RemotePlayer) {
    this.remotePets.get(sessionId)?.destroy();
    this.remotePets.delete(sessionId);
    this.remotePetWalk.delete(sessionId);
    if (!this.app || !isPetId(String(player.pet ?? ""))) return;
    const kind = player.pet as PetId;
    const entity = createPet(this.app.root, kind, `pet-${sessionId}`);
    this.remotePets.set(sessionId, entity);
    this.remotePetWalk.set(sessionId, createPetWalker(entity, kind));
  }

  private followPet(dt: number) {
    const ground = this.inBuilding?.interior?.y ?? WALK_Y;
    if (this.petWalk && this.petEntity && this.player && !this.inVehicle) {
      const p = this.player.getPosition();
      tickPetWalker(this.petWalk, p.x, p.z, this.yaw, ground, dt);
      this.petEntity.enabled = true;
    } else if (this.petEntity) this.petEntity.enabled = false;

    for (const [id, walker] of this.remotePetWalk) {
      const st = this.remoteState.get(id);
      const body = this.remotes.get(id);
      const pet = walker.entity;
      if (!st || !body?.enabled) {
        pet.enabled = false;
        continue;
      }
      pet.enabled = true;
      const floor = st.inBuilding ? (st.y ?? WALK_Y) : WALK_Y;
      tickPetWalker(walker, st.x, st.z, st.rotY, floor, dt);
    }
  }

  private applyBag(msg: { inventory?: string; credits?: number; gun?: string; pet?: string; accessories?: string }) {
    if (typeof msg.inventory === "string") this.inventory = decodeInventory(msg.inventory);
    if (typeof msg.credits === "number") this.credits = msg.credits;
    this.gun = isGunId(String(msg.gun ?? "")) ? (msg.gun as GunId) : null;
    const nextPet = isPetId(String(msg.pet ?? "")) ? (msg.pet as PetId) : null;
    if (typeof msg.accessories === "string" && this.look) this.look.accessories = parseAccessories(msg.accessories);
    if (this.look) this.look.gun = this.gun;
    if (nextPet !== this.petKind) {
      this.petKind = nextPet;
      this.syncPet();
    }
    this.refreshLook();
  }
}

type RemotePlayer = Appearance & {
  x: number;
  y?: number;
  z: number;
  rotY: number;
  inBuilding: boolean;
  buildingId?: string;
  sitting?: boolean;
  name: string;
  wallet?: string;
  city?: string;
  gun?: string;
  pet?: string;
  accessories?: Appearance["accessories"] | string;
};

type RemoteVehicle = {
  x: number;
  y?: number;
  z: number;
  rotY: number;
  color: string;
  kind: string;
  driver: string;
  owner?: string;
  city?: string;
  locked?: boolean;
};

function clampHealth(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 100;
  return Math.max(0, Math.min(100, v));
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

function appearanceOf(
  c: Appearance & { accessories?: Appearance["accessories"] | string; gun?: string | null },
): Appearance {
  return {
    bodyType: c.bodyType,
    skinTone: c.skinTone,
    outfit: c.outfit,
    pantsColor: parseHexColor(c.pantsColor, "#3A3A3A"),
    shoe: parseShoe(c.shoe),
    shoeColor: parseHexColor(c.shoeColor, "#111111"),
    headwear: c.headwear,
    accessories: parseAccessories(c.accessories),
    gun: isGunId(String(c.gun ?? "")) ? (c.gun as GunId) : null,
  };
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
