import * as pc from "playcanvas";
import { getStateCallbacks, type Room } from "@colyseus/sdk";
import { CURRENCY,
  type CrimeReport,
  type OutfitId,
  homeAccessTier,
  capTier,
  PROPERTY_MARKET_OPEN,
  PROPERTY_CLOSED_TEXT,
  unlockingCity,
  isTierGated,
  armSlots,
  ownsOutfit,
  outfitLabel,
  MIN_ASKING_PRICE,
  homePrice,
  parseHomeId,
  CITIES,
  CITY_BOUNDS,
  addItem,
  cityEntered,
  catalogItem,
  DEFAULT_CHAIN,
  cityAtPosition,
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
} from "@tribe/shared";
import { composeShot, snapshot } from "../lib/screenshot";
import { joinWorld, type JoinFailure } from "../lib/colyseus";
import { loadCharacter, saveCharacter } from "../lib/storage";
import { loadSession } from "../lib/session";

/** Shown when a purchase needs a wallet the account has not linked yet. */
import { VoiceChat, loadOutputDevice, saveOutputDevice } from "../lib/voiceChat";
import { playGunshot, setSfxVolume } from "../lib/sfx";
import { createPcApp, destroyPcApp, entityYaw, hitsAabb, material, setCycleGlow, type Aabb } from "./pcApp";
import { createCitizen, setCitizenDetail, type Appearance } from "./character";
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
/** Real lights near the player. Fixed count, so cost does not scale with the city. */
const LAMP_LIGHTS = 5;
const LAMP_RANGE = 14;
/** Tallest rise you can walk straight up without jumping. */
const STEP_UP = 0.75;
const REMOTE_RENDER_RANGE = 70;
/**
 * Remote positions arrive at the 20Hz patch rate but we draw at 60Hz or more, so
 * most frames see no change at all. Hold the walk cycle across the gap, or the
 * body drops back to idle between updates and the limbs stutter.
 */
/** What an explicit save came back with, shown on the pause-menu button. */
export type SpotSaveResult = { ok: boolean; text: string };

/** How long to wait for the server's acknowledgement before giving up on it. */
const SPOT_SAVE_TIMEOUT_MS = 6000;

/**
 * Why the server refused to write a spot down. Phrased for the player: they do
 * not need to know the position is kept per wallet, only that standing indoors
 * is not somewhere the game will put them back.
 */
const SPOT_SAVE_PROBLEM: Record<string, string> = {
  "no-wallet": "Sign in to save your location.",
  indoors: "Step outside first — indoor spots are not saved.",
  nowhere: "You are not standing anywhere that can be saved.",
  offline: "Could not reach the server. Try again.",
};

/**
 * One side's view of a live trade, as the server sends it - always "yours" and
 * "theirs" rather than A and B, so no client has to work out which half it is.
 */
export type TradeView = {
  withSession: string;
  withName: string;
  yourItems: string[];
  theirItems: string[];
  youLocked: boolean;
  theyLocked: boolean;
};

/**
 * Tips an upright body onto its back, head along the direction it was facing.
 *
 * Two turns, both in the body's own frame and in this order. The pitch alone
 * lays it down head-first but rolls the face into the mattress, because
 * rotating +90 about local X carries the head (+Y) onto the forward axis and
 * the face (+Z) straight down. The second turn rolls 180 about the body's long
 * axis - which is still local Y, since the axes travel with the body - leaving
 * the head where it is and bringing the face back up.
 *
 * The limb pose is left/right symmetric, so the roll costs nothing there.
 */
function layFlat(entity: pc.Entity) {
  entity.rotateLocal(90, 0, 0);
  entity.rotateLocal(0, 180, 0);
}

/**
 * Look feel. LOOK_SMOOTH is the fraction of banked movement still outstanding
 * after one second - lower is snappier, and this is low enough that the camera
 * feels direct while still absorbing an uneven event stream.
 */
/** Shot round speed, world units a second. Fast enough to read as a bullet. */
const BOLT_SPEED = 220;
/** How long the streak behind the round is allowed to grow. */
const TRAIL_LEN = 2.6;
/** Muzzle flash duration. Short: a flash you can study is a lamp. */
const MUZZLE_FLASH_MS = 70;

/** How long to wait for the server's spawn before showing the world anyway. */
const SPAWN_WAIT_MS = 6000;

const LOOK_SMOOTH = 1e-7;
const LOOK_SENS = 0.0024;
/** A single movement event larger than this is a driver hiccup, not a flick. */
const MOUSE_SPIKE = 180;

/**
 * Aim-down-sights camera. The eye sits a little forward of the head so the
 * player's own body falls behind the camera rather than filling the view.
 */
const ADS_EYE_HEIGHT = 1.62;
const ADS_EYE_FORWARD = 0.52;
const ADS_FOV = 58;
/** Aiming can look much further up and down than the orbit camera allows. */
const ADS_PITCH = 1.15;

/** How far in front of the player the fashion-house mirror sits. */
const MIRROR_DIST = 3.2;

const REMOTE_WALK_HOLD_MS = 160;
/** How fast a remote body closes on its last known position. */
const REMOTE_LERP = 12;
/** Past this a move is a teleport - spawn, a door, leaving a car - so snap. */
const REMOTE_SNAP = 4;

/*
 * TEMPORARY RESCUE HATCH - set back to null when the job is done.
 *
 * A car is wedged in the wall of this city's hospital. While this names a
 * city, that one building's collider is ignored for the local player, on foot
 * and at the wheel, so the car can be reached and reversed out. Nothing else
 * changes: every other wall still stops you, other players are unaffected, and
 * the server never had building collision to begin with.
 */
const WALL_PASS_CITY: string | null = "trenches";

/** Cars travel further per patch than people, so they need more room before a snap. */
const VEHICLE_SNAP = 12;
const VEHICLE_LERP = 14;
/** Degrees of wheel spin per unit travelled, matching the car you drive yourself. */
const WHEEL_ROLL = 36;
/** Cosmetic detail is culled between these two, with a gap so it cannot flicker. */
const DETAIL_ON_RANGE = 26;
const DETAIL_OFF_RANGE = 34;
const HOME_SALE_LABEL_RANGE = 26;
/**
 * Signs used to hang above the roof, which put them off the top of the screen
 * exactly when you walked up to read them. The view is 42 degrees vertically,
 * which is narrower than it feels: a civic building's sign at 11.6 units left
 * the screen within 24 units of it, and a ten-floor Uptown tower anchors its
 * sign 33.4 units up, off screen until you are 81 units away. Tags stop being
 * drawn at 72, so that one was never visible from anywhere.
 *
 * Two things fix it between them. The anchor is capped, so a sign rides the
 * facade instead of floating over the roof - on a tall tower that is about a
 * third of the way up, still plainly that building's sign and now readable
 * from the street. And within the range where you might act on it, a sign that
 * is still too high slides down to the top of the window rather than being
 * dropped.
 *
 * The cap makes the pin rare: capped at 10 units, nothing leaves the view
 * further out than 20, so beyond the pin range every sign is on screen by
 * itself and they cannot stack along the top edge.
 *
 * The pin sits below the health bar, which owns the top centre.
 */
const LABEL_MAX_Y = 10;
const LABEL_PIN_RANGE = 26;
const LABEL_PIN_TOP = 74;
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

export type OwnedCar = {
  id: string;
  kind: string;
  color: string;
  city: string;
  locked: boolean;
  forSale: boolean;
  askingPrice: number;
  x: number;
  z: number;
};

export type OwnedHome = {
  id: string;
  name: string;
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
  name: string;
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
  bucks: number;
  inventory: InventoryStack[];
  inStore: boolean;
  /** Standing in a police station: unlocks the blotter panel. */
  inStation: boolean;
  /** On the ward: healing, movement locked. */
  /** Standing in the fashion house: unlocks the wardrobe. */
  inFashion: boolean;
  /** Down the sights right now, so the quick-action button can say "exit". */
  aiming: boolean;
  outfit: string;
  /** Standing in the town hall, which is a placeholder for now. */
  inTownhall: boolean;
  crimeReports: CrimeReport[];
  gun: GunId | null;
  pet: PetId | null;
  accessories: string[];
  tradeInvite: { fromSession: string; fromName: string } | null;
  trade: TradeView | null;
  voiceLevel: number;
  /** Loudest nearby player, 0-1, measured off the audio actually arriving. */
  nearbyVoiceLevel: number;
  notice: string | null;
  listPrompt: { id: string; suggested: number; suggestedMinutes: number } | null;
  namePrompt: { id: string; current: string; boughtFrom?: string; inheritedName?: string } | null;
  carListPrompt: { id: string; suggested: number } | null;
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
  /** Where the network says a car someone else is driving should be. */
  target?: { x: number; z: number; rotY: number };
  /**
   * Eased heading in radians, kept as a number on purpose. getEulerAngles() is
   * not the inverse of setEulerAngles(0, y, 0): past +-90 degrees it returns the
   * same orientation expressed with x and z at 180 and a different y, so easing
   * against a value read back from the entity never converges.
   */
  yaw?: number;
};

type KnockdownState = {
  startedAt: number;
  fallEndsAt: number;
  lieEndsAt: number;
  endsAt: number;
};

const LOCAL_VEHICLES = [
  { id: "veh-0", city: "trenches", x: -48, z: 58, rotY: 0, color: "#F4F4F4", kind: "hatch" },
  { id: "veh-1", city: "trenches", x: -62, z: 42, rotY: Math.PI / 2, color: "#EEEEEE", kind: "hatch" },
  { id: "veh-2", city: "bagtown", x: 46, z: 62, rotY: 0, color: "#5B8FCF", kind: "sedan" },
  { id: "veh-3", city: "midtown", x: -42, z: -58, rotY: Math.PI, color: "#D9772C", kind: "sedan" },
  { id: "veh-4", city: "uptown", x: 44, z: -40, rotY: 0, color: "#FF8A1F", kind: "sport" },
  { id: "veh-5", city: "uptown", x: 62, z: -56, rotY: Math.PI / 2, color: "#2B4C9B", kind: "sedan" },
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
  private remoteDetail = new Map<string, boolean>();
  private remotePool = new Map<string, { entity: pc.Entity; lookKey: string; at: number }>();
  private poolSweptAt = 0;
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
  /** TEMPORARY - see wallPass(). undefined means "not looked up yet". */
  private wallPassBoxes: Set<Aabb> | undefined = undefined;
  private sitting = false;
  private sitSeat: Seat | null = null;
  private speed = 9;
  private vehicleSpeed = 0;
  private driving = false;
  private accessTier = 1;
  private city: CityId = "trenches";
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
  /** Resolver for a save the pause menu is waiting on, if any. */
  /** Laid up on the ward: healing, and not going anywhere. */
  private spotSaveWaiting: ((result: SpotSaveResult) => void) | null = null;
  private gateMessage: string | null = null;
  private chat: { name: string; text: string }[] = [];
  private onHud: ((s: HudState) => void) | null = null;
  private unbind: Array<() => void> = [];
  private animT = 0;
  private vy = 0;
  private grounded = true;
  private remoteLast = new Map<string, { x: number; z: number }>();
  private remoteMoveUntil = new Map<string, number>();
  private lampLights: pc.Entity[] = [];
  /** The glow planes under each streetlamp, hidden during the day. */
  private lightPools: pc.Entity[] = [];
  private lampSyncAt = 0;
  /** True while a wallet prompt is open, so one click cannot open two. */
  private paying = false;
  private pendingHomeName: { id: string; current: string; boughtFrom?: string; inheritedName?: string } | null = null;
  private pendingCarListing: { id: string; suggested: number } | null = null;
  private fleetSold = 0;
  private fleetCap = 0;
  private pointerLocked = false;
  /** A panel is open, so the cursor belongs to the UI, not to aiming. */
  private uiOpen = false;
  /**
   * Opens the "link a wallet" dialog and resolves true once one is linked.
   * Supplied by the game page, which owns the dialog.
   */
  /** Purchases waiting for the server's answer to a holdings refresh. */
  private bagWaiters: (() => void)[] = [];
  /** True once the server's spawn has been applied, so it happens only once. */
  private spawned = false;
  /** Resolves start()'s wait for that first authoritative position. */
  private onSpawned: (() => void) | null = null;
  /** Front-on camera, for checking an outfit at the fashion house. */
  private mirrorView = false;
  private rightHeld = false;
  /**
   * Weapon lowered. Equipped but not aiming - the state a player is in between
   * drawing and putting it away, which the game previously had no way to be in.
   */
  private holstered = false;
  /** Live shot effects, advanced every frame in updateShotFx(). */
  private shots: {
    bolt: pc.Entity;
    trail: pc.Entity;
    from: { x: number; y: number; z: number };
    dir: { x: number; y: number; z: number };
    dist: number;
    travelled: number;
  }[] = [];
  private puffs: {
    e: pc.Entity;
    life: number;
    ttl: number;
    size: number;
    drift?: { x: number; y: number; z: number };
  }[] = [];
  private muzzleLight: pc.Entity | null = null;
  private muzzleFlash = 0;
  /** Mouse movement banked since the last frame, applied in applyLook(). */
  private lookDx = 0;
  private lookDy = 0;
  private remoteYaw = new Map<string, number>();
  private localName = "citizen";
  private look: Appearance | null = null;
  private bucks = 0;
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
  private vehicleSale = new Map<string, number>();
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
  /**
   * What each district costs to enter, as the server enforces it. Seeded from
   * the local env so a message is possible before the server answers, then
   * replaced by the authoritative list on join.
   */
  private crimeReports: CrimeReport[] = [];
  private tradeInvite: { fromSession: string; fromName: string } | null = null;
  private trade: TradeView | null = null;
  private knockdown: KnockdownState | null = null;
  private remoteKnockdowns = new Map<string, KnockdownState>();

  async start(
    canvas: HTMLCanvasElement,
    character: CharacterRecord,
    settings: GameSettings,
    onHud: (s: HudState) => void,
  ) {
    this.settings = settings;
    setSfxVolume(settings.masterVolume, settings.sfx);
    this.onHud = onHud;
    this.accessTier = character.accessTier;
    this.city = character.homeCity;
    this.health = clampHealth(character.brokemeter);
    this.lastHealth = this.health;
    this.localName = character.displayName || "citizen";
    this.look = { ...appearanceOf(character), gun: character.equippedGun };
    // A cached figure so the HUD is not blank offline. The server overwrites it
    // with the wallet's real balance as soon as the room sends a bag.
    this.bucks = Number.isFinite(character.bucks) ? character.bucks : 0;
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

    // Found by name rather than threaded through the builder: they are pure
    // decoration and nothing else needs a handle on them.
    this.lightPools = (this.app.root.find((node) => node.name.startsWith("lamp-p-")) as pc.Entity[]) ?? [];

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
      token: loadSession()?.token ?? "",
      wallet: character.wallet,
      chain: loadSession()?.chain ?? DEFAULT_CHAIN,
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
      bucks: this.bucks,
      inventory: encodeInventory(this.inventory),
      gun: this.gun ?? "",
      pet: this.petKind ?? "",
    });
    this.room = joined.room;
    this.joinFailure = joined.reason ?? null;
    if (this.room) this.voice = new VoiceChat(this.room);
    this.bindRoom();
    this.emitHud();

    // Hold until the server has placed us, so the caller can keep the loader up
    // rather than showing a city we may be about to leave. Bounded: a failed or
    // refused join never delivers a player, and waiting forever would be a
    // permanent loading screen instead of a brief wrong city.
    if (this.room && !joined.reason) {
      await new Promise<void>((resolve) => {
        if (this.spawned) return resolve();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        this.onSpawned = finish;
        window.setTimeout(finish, SPAWN_WAIT_MS);
      });
    }
    this.emitHud();
  }

  setPad(x: number, z: number) {
    this.pad = { x, z };
  }

  setSettings(settings: GameSettings) {
    this.settings = settings;
    this.lastCycle = -1;
    setSfxVolume(settings.masterVolume, settings.sfx);
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

  /** Persisted even with no room, so the choice survives until voice is enabled. */
  async setAudioOutput(deviceId: string) {
    if (this.voice) await this.voice.setOutputDevice(deviceId);
    else saveOutputDevice(deviceId);
  }

  audioOutput() {
    return this.voice?.outputDevice() ?? loadOutputDevice();
  }

  /** Nearby voice peers with names resolved, for the audio menu's diagnostics. */
  voiceDiagnostics() {
    return (this.voice?.diagnostics() ?? []).map((peer) => ({
      ...peer,
      name: this.remoteState.get(peer.sessionId)?.name ?? "Citizen",
    }));
  }

  /**
   * Files a report at the desk. The server re-checks that you are standing in a
   * station, so this is a request rather than an assertion.
   */
  reportCrime(offence: string, accused: string, note: string) {
    this.room?.send("crime-report", { offence, accused, note });
  }

  /** Asks for the board. Answered with a "crime-list" message. */
  requestCrimeReports() {
    this.room?.send("crime-list", {});
  }

  /**
   * Who you could plausibly be reporting: everyone you can currently see,
   * nearest first. Typing a name from memory is the common case this avoids.
   */
  nearbyNames(): string[] {
    const me = this.player?.getPosition();
    if (!me) return [];
    const seen = new Map<string, number>();
    for (const [id, entity] of this.remotes) {
      if (id === this.room?.sessionId) continue;
      const name = this.remoteNames.get(id);
      if (!name) continue;
      const p = entity.getPosition();
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      const best = seen.get(name);
      if (best === undefined || d < best) seen.set(name, d);
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  }

  /** Asks someone to open a trade window. Nothing is staked yet. */
  inviteTrade(toSession: string) {
    this.room?.send("trade-invite", { toSession });
    this.gateMessage = "Trade invite sent.";
    this.gateUntil = performance.now() + 1800;
  }

  answerTradeInvite(accept: boolean) {
    const pending = this.tradeInvite;
    if (!pending) return;
    this.room?.send("trade-accept", { fromSession: pending.fromSession, accept });
    this.tradeInvite = null;
  }

  /**
   * Replaces the whole stake rather than adding one item at a time: the server
   * re-validates the list against live inventory anyway, so sending the current
   * state is both simpler and immune to an add and a remove crossing paths.
   */
  setTradeOffer(items: string[]) {
    this.room?.send("trade-offer", { items });
  }

  lockTrade(locked: boolean) {
    this.room?.send("trade-lock", { locked });
  }

  cancelTrade() {
    this.room?.send("trade-cancel", {});
  }

  /**
   * Buys a catalog item.
   *
   * These checks are only here to avoid opening a wallet prompt that is certain
   * to fail - the server repeats every one of them and is what actually grants
   * the item. It used to add the item to the bag itself, which made the store
   * free to anyone willing to edit a number.
   */
  async buyItem(id: ItemId): Promise<string | null> {
    const item = catalogItem(id);
    if (!item) return "Unknown item.";
    // Which counter carries it. This used to be "store" for everything, which
    // silently refused every outfit: they are sold at the fashion house, so the
    // guard rejected the purchase before the wallet was ever asked.
    const counter = item.kind === "outfit" ? "fashion" : "store";
    if (this.inBuilding?.interiorKind !== counter) {
      return counter === "fashion" ? "Walk into the Fashion House to buy that." : "Walk into a Store to buy.";
    }
    if (isTierGated(item) && item.tier > this.accessTier) return `Needs tier ${item.tier}.`;
    if (this.bucks < item.price) return `Not enough ${CURRENCY}.`;
    if (item.unique && hasItem(this.inventory, item.id)) return "You already own that.";

    this.room?.send("buy-item", { id: item.id });
    return null;
  }

/**
   * Down the sights: a ranged weapon is raised and the pointer is captured.
   *
   * This is the state that swaps the orbit camera for a first-person one, so it
   * deliberately requires the cursor to actually be held - a weapon raised while
   * a panel has the cursor is not aiming at anything.
   */
  private adsActive() {
    return this.rangedOut() && (this.pointerLocked || this.rightHeld) && !this.uiOpen;
  }

  /** A ranged weapon is out, so the mouse should be aiming it. */
  private rangedOut() {
    return Boolean(gunSpec(this.gun)?.ranged) && this.health > 0 && !this.holstered;
  }

  /**
   * Lowers or raises an equipped weapon.
   *
   * Aiming engages by itself when a gun is drawn, which is what makes it feel
   * immediate - but that needs a deliberate way out that is not "fight the
   * browser". Holstering keeps the weapon equipped and simply stops aiming, so
   * the cursor comes back and the camera returns to the normal follow.
   */
  toggleHolster() {
    if (!gunSpec(this.gun)?.ranged) return;
    this.holstered = !this.holstered;
    if (this.holstered) {
      this.releaseAim();
      this.setNotice("Weapon lowered — X to raise it.");
    } else {
      this.captureAim();
      this.setNotice("Weapon raised.");
    }
  }

  /** Hands the cursor back - for opening a panel, or putting the gun away. */
  releaseAim() {
    this.rightHeld = false;
    this.looking = false;
    if (this.canvas && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Asks the server to re-read holdings now, and waits (briefly) for the answer. */
  private refreshHoldings(): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        this.bagWaiters = this.bagWaiters.filter((w) => w !== done);
        resolve();
      };
      // Never hold the caller hostage to a slow answer.
      const timer = window.setTimeout(done, 6000);
      this.bagWaiters.push(done);
      this.room?.send("holdings-refresh");
    });
  }

  /** Panels own the cursor while they are open; aiming resumes when they close. */
  setUiOpen(open: boolean) {
    this.uiOpen = open;
    if (open) this.releaseAim();
  }

  /**
   * Takes the cursor for aiming, if a weapon is out and nothing else wants it.
   *
   * Pointer lock needs a user gesture, but it does not need a click - any
   * keypress will do, and players are holding a movement key within a moment of
   * drawing a weapon. So aiming engages on its own without anyone clicking.
   */
  private captureAim() {
    if (this.uiOpen || this.pointerLocked || !this.rangedOut()) return;
    if (!this.canvas) return;
    void this.canvas.requestPointerLock()?.catch?.(() => undefined);
  }

  equipItem(id: ItemId) {
    if (!hasItem(this.inventory, id)) return;
    const item = catalogItem(id);
    if (!item) return;
    if (item.kind === "accessory") {
      const current = this.look?.accessories ?? [];
      const aid = id as AccessoryId;
      const next = current.includes(aid) ? current.filter((a) => a !== aid) : [...current, aid];
      if (this.look) this.look.accessories = next;
      this.refreshLook();
      return;
    }
    if (item.kind === "outfit") {
      this.wearOutfit(id as OutfitId);
      return;
    }
    if (item.kind === "gun") {
      this.gun = this.gun === id ? null : (id as GunId);
      // Taking a weapon out means taking it out, not taking out a holstered one.
      this.holstered = false;
      if (this.look) this.look.gun = this.gun;
      this.refreshLook();
      // Drawing a weapon starts aiming right away where it can; putting one
      // away hands the cursor back, or it stays trapped with nothing to aim.
      if (this.rangedOut()) this.captureAim();
      else this.releaseAim();
      // Without this the weapon was local-only: persistBag is what sends the
      // loadout, and the gun branch used to return before reaching it, so
      // everyone else saw an unarmed player.
      this.persistBag();
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
    if (near.kind === "buy-car") void this.buyCar(near);
  }

  dispose() {
    for (const parked of this.remotePool.values()) parked.entity.destroy();
    this.remotePool.clear();
    // Parented to app.root rather than the world entity, so they need clearing
    // here or a second start would stack another set of lights on the scene.
    for (const light of this.lampLights) light.destroy();
    this.lampLights = [];
    this.lightPools = [];
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
        if (mapped === "b" && !e.repeat) void this.trySell();
        if (mapped === "l" && !e.repeat) this.toggleLock();
        if (mapped === "h" && !e.repeat) this.promptHomeName();
        if (mapped === "g" && !e.repeat) this.addFriend();
        if (mapped === "x" && !e.repeat) this.toggleHolster();
        // Number keys draw a weapon, 0 puts it away. Pressing the slot already
        // in hand disarms, so each key is its own opposite. The range follows
        // armSlots() rather than a hard-coded "1-3", so retiring or adding a
        // weapon moves the bindings with it.
        if (!e.repeat && /^[1-9]$/.test(mapped) && Number(mapped) <= armSlots().length) {
          this.quickArm(Number(mapped));
        }
        if (mapped === "0" && !e.repeat) this.disarm();
        if (mapped in { w: 1, a: 1, s: 1, d: 1, " ": 1, shift: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1 }) {
          e.preventDefault();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(MOVE_KEYS[e.code] ?? e.key.toLowerCase());
    };
    // Keydown is a user gesture, which is all pointer lock requires. Walking
    // with a gun out is enough to start aiming - no click needed.
    const onKeyAim = () => this.captureAim();
    const onContext = (e: Event) => e.preventDefault();
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (e.target !== canvas) return;
        // Aiming normally engages on its own from a keypress. If the cursor is
        // somehow loose - the player pressed Escape, say - take it back here,
        // and still fire: a click with a gun raised should never do nothing.
        if (this.rangedOut() && !this.pointerLocked) this.captureAim();
        this.tryPunch();
        return;
      }
      if (e.button !== 2) return;
      e.preventDefault();
      this.rightHeld = true;
      this.looking = true;
      void canvas?.requestPointerLock();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      this.rightHeld = false;
      // An armed player keeps the pointer: they are still aiming.
      if (this.rangedOut() && this.pointerLocked) return;
      this.looking = false;
      if (canvas && document.pointerLockElement === canvas) document.exitPointerLock();
    };
    // The browser can drop the lock on its own - Escape, tab-out, a UI panel -
    // so the aiming flag follows the real lock state rather than guessing.
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      // Losing the lock while armed is the player asking to stop aiming, and
      // Escape is the only exit the browser offers them. Without this the next
      // keypress re-captured instantly, so aim mode could not be left at all -
      // pressing Escape and then walking put you straight back in it.
      // A panel taking the cursor is not that, so it is excluded.
      if (this.pointerLocked && !locked && !this.uiOpen && this.rangedOut()) this.holstered = true;
      this.pointerLocked = locked;
      this.looking = this.pointerLocked || this.rightHeld;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.looking) return;
      // Banked, not applied. Pointer lock delivers movement events at whatever
      // rate the mouse reports - often several per frame on a high-polling
      // mouse, sometimes one big one after a stall - and turning the camera on
      // each of them made the motion track the event timing rather than the
      // hand. A single spike is clamped too: a 400px jump is a driver hiccup,
      // not an intended 180.
      this.lookDx += Math.max(-MOUSE_SPIKE, Math.min(MOUSE_SPIKE, e.movementX));
      this.lookDy += Math.max(-MOUSE_SPIKE, Math.min(MOUSE_SPIKE, e.movementY));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keydown", onKeyAim);
    window.addEventListener("keyup", up);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    canvas?.addEventListener("contextmenu", onContext);
    canvas?.addEventListener("mousedown", onMouseDown);
    this.unbind.push(() => window.removeEventListener("keydown", down));
    this.unbind.push(() => window.removeEventListener("keydown", onKeyAim));
    this.unbind.push(() => window.removeEventListener("keyup", up));
    this.unbind.push(() => window.removeEventListener("mouseup", onMouseUp));
    this.unbind.push(() => window.removeEventListener("mousemove", onMouseMove));
    this.unbind.push(() => document.removeEventListener("pointerlockchange", onLockChange));
    this.unbind.push(() => canvas?.removeEventListener("contextmenu", onContext));
    this.unbind.push(() => canvas?.removeEventListener("mousedown", onMouseDown));
  }

  private bindRoom() {
    const room = this.room;
    if (!room) return;
    const $ = getStateCallbacks(room);

    room.onMessage("gate-denied", (msg: { city: CityId }) => {
      this.gateMessage = this.gateText(msg.city);
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
    room.onMessage("crime-list", (msg: { reports?: CrimeReport[] }) => {
      this.crimeReports = Array.isArray(msg.reports) ? msg.reports : [];
    });
    room.onMessage("crime-result", (msg: { ok?: boolean; reason?: string }) => {
      this.setNotice(msg.ok ? "Report filed at the desk." : msg.reason ?? "Could not file that.");
    });
    room.onMessage("trade-invite", (msg: { fromSession: string; fromName: string }) => {
      this.tradeInvite = msg;
      this.gateMessage = `${msg.fromName} wants to trade.`;
      this.gateUntil = performance.now() + 4000;
    });
    room.onMessage("trade-state", (msg: TradeView) => {
      this.trade = msg;
      this.tradeInvite = null;
    });
    room.onMessage("trade-closed", (msg: { reason?: string; done?: boolean }) => {
      this.trade = null;
      this.tradeInvite = null;
      this.setNotice(msg.reason ?? "Trade closed.");
    });
    room.onMessage("bag-sync", (msg: { inventory?: string; bucks?: number; gun?: string; pet?: string; accessories?: string; accessTier?: number }) => {
      // Holdings are re-read every 60s, so the tier can move under a player who
      // never reconnects. Track it or the local gate check drifts from the
      // server's and every step gets corrected instead of refused.
      if (typeof msg.accessTier === "number") this.accessTier = msg.accessTier;
      this.applyBag(msg);
      for (const settle of [...this.bagWaiters]) settle();
    });

    $(room.state).chat.onAdd((line) => {
      this.chat = [...this.chat.slice(-20), { name: line.name, text: line.text }];
    });

    $(room.state).players.onAdd((player, sessionId) => {
      if (sessionId === room.sessionId) {
        // Where the server says we are. Until this arrives the player is stood
        // at the cached home city's spawn, which is a guess: holdings may have
        // changed, and a saved last position beats it outright. Adopting it
        // here - before the world is ever shown - is what removes the visible
        // hop from the wrong city to the right one.
        this.adoptSpawn(player as { x?: number; y?: number; z?: number; city?: string });
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
      this.vehicleSale.delete(vehicleId);
      // Or the prompt outlives the car and E puts you in a vehicle that is gone.
      const list = this.world?.interactables;
      const at = list?.findIndex((item) => item.kind === "vehicle" && item.id === vehicleId) ?? -1;
      if (list && at >= 0) list.splice(at, 1);
    });

    room.onMessage("hospital-outside", () => this.dischargeOutside());

    room.onMessage("home-result", (msg: { ok?: boolean; reason?: string; price?: number; listed?: boolean }) => {
      // Rejections are transient feedback; the successes arrive as inbox messages.
      if (!msg.ok) this.setNotice(msg.reason ?? "Rejected");
      else if (msg.reason) this.setNotice(msg.reason);
      else if (typeof msg.price === "number") this.setNotice(`Bought for ${msg.price} ${CURRENCY}.`);
    });

    room.onMessage("session-replaced", () => {
      this.sessionEnded = "This account signed in somewhere else. Only one session can be open at a time.";
    });
    room.onLeave((code) => {
      // 4100 is our own displaced-session code; anything else is a real drop.
      if (code === 4100 && !this.sessionEnded) {
        this.sessionEnded = "This account signed in somewhere else. Only one session can be open at a time.";
      }
      this.room = null;
    });

    // The server rejected a move as too fast and is telling us where we really
    // are. Snap back rather than drifting out of sync with everyone else.
    room.onMessage("move-correction", (msg: { x?: number; y?: number; z?: number }) => {
      if (!this.player || this.inVehicle) return;
      if (typeof msg.x !== "number" || typeof msg.z !== "number") return;
      const current = this.player.getPosition();
      this.player.setPosition(msg.x, typeof msg.y === "number" ? msg.y : current.y, msg.z);
      this.vy = 0;
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
        this.spawnShotFx(shooter.x, shooter.y + 1.35, shooter.z, hit.x, hit.y + 1.2, hit.z);
      }
      const now = performance.now();
      if (msg.toSession === room.sessionId) {
        if (typeof msg.health === "number") this.health = clampHealth(msg.health);
        this.hitUntil = now + HIT_MS;
      } else if (msg.toSession) {
        this.meleeHit.set(String(msg.toSession), now + HIT_MS);
      }
    });

    room.onMessage("fleet", (msg: { sold?: number; cap?: number }) => {
      this.fleetSold = Number(msg.sold ?? 0);
      this.fleetCap = Number(msg.cap ?? 0);
    });

room.onMessage("car-result", (msg: { ok?: boolean; reason?: string }) => {
      this.setNotice(msg.reason ?? (msg.ok ? "Done." : "Could not do that."));
    });

        room.onMessage("buy-item-result", (msg: { ok?: boolean; name?: string; reason?: string }) => {
      this.setNotice(msg.ok ? `Bought ${msg.name ?? "it"}.` : msg.reason ?? "Could not buy that.");
    });

    room.onMessage("spot-saved", (msg: { ok?: boolean; city?: string; reason?: string }) => {
      const city = CITIES[msg.city as CityId]?.name;
      const text = msg.ok
        ? city
          ? `Location saved in ${city}.`
          : "Location saved."
        : SPOT_SAVE_PROBLEM[msg.reason ?? ""] ?? "Could not save your location.";
      this.setNotice(text);
      // The pause menu is waiting on this to show the result on the button
      // itself; the notice behind the menu is easy to miss.
      this.spotSaveWaiting?.({ ok: Boolean(msg.ok), text });
      this.spotSaveWaiting = null;
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
      this.setNotice(msg.ok ? `Bought a ${msg.name} for ${msg.price} ${CURRENCY} - it is parked outside.` : msg.reason ?? "Could not buy that car");
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
    const before = this.homes.get(id);
    this.noticeHomeBought(before, home, id);
    this.homes.set(id, {
      id,
      city: home.city,
      owner: home.owner,
      ownerName: home.ownerName,
      name: home.name ?? "",
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

/**
   * What this home costs, mirroring the server rule.
   *
   * An owner's asking price when it is listed, otherwise the city price for a
   * home of that size in that district - derived from the lot, so the client
   * and server arrive at the same number without it being sent.
   */
  private homeCost(id: string, info?: HomeInfo) {
    if (info?.owner && info.forSale && info.askingPrice > 0) return info.askingPrice;
    const lot = parseHomeId(id);
    return lot ? homePrice(lot.city, lot.gx, lot.gz) : 0;
  }

  /**
   * Lists a home at an asking price. No duration: the listing stands until
   * somebody pays it or the owner withdraws it.
   */
  listHome(price: number) {
    const pending = this.pendingListing;
    if (!pending) return;
    if (!Number.isFinite(price) || price < MIN_ASKING_PRICE) {
      this.setNotice(`Enter an asking price of at least ${MIN_ASKING_PRICE} ${CURRENCY}.`);
      return;
    }
    this.pendingListing = null;
    this.room?.send("home-list", { id: pending.id, list: true, price: Math.round(price) });
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
      token: loadSession()?.token ?? "",
      wallet: character.wallet,
      chain: loadSession()?.chain ?? DEFAULT_CHAIN,
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
      bucks: this.bucks,
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

  /**
   * Writes the current position down now, rather than waiting for the leave.
   *
   * Resolves with what the server actually did, so the pause menu can confirm
   * it on the button before the player closes the tab. Resolves false rather
   * than hanging if the room has gone or the reply never lands.
   */
  saveSpot(): Promise<SpotSaveResult> {
    if (!this.room) return Promise.resolve({ ok: false, text: "Not connected." });
    // A second click while one is in flight abandons the first; only the latest
    // resolver is kept, so the earlier promise would never settle otherwise.
    this.spotSaveWaiting?.({ ok: false, text: "Superseded." });
    this.spotSaveWaiting = null;
    return new Promise<SpotSaveResult>((resolve) => {
      let settled = false;
      const finish = (result: SpotSaveResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      this.spotSaveWaiting = finish;
      this.room?.send("save-spot", {});
      window.setTimeout(() => {
        if (this.spotSaveWaiting === finish) this.spotSaveWaiting = null;
        finish({ ok: false, text: "No reply from the server." });
      }, SPOT_SAVE_TIMEOUT_MS);
    });
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

  private async buyCar(item: Interactable) {
    if (!item.carKind || item.carPrice == null) return;
    if (!PROPERTY_MARKET_OPEN) {
      this.setNotice(PROPERTY_CLOSED_TEXT);
      return;
    }
    if (this.fleetCap > 0 && this.fleetSold >= this.fleetCap) {
      this.setNotice(`Sold out - all ${this.fleetCap} cars are owned.`);
      return;
    }
    if (this.ownedCars.size > 0) {
      this.setNotice("You already own a car. One each.");
      return;
    }
    if (this.bucks < item.carPrice) {
      this.setNotice(`${item.label ?? "That car"} costs ${item.carPrice} ${CURRENCY}. You have ${this.bucks}.`);
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
    const asking = this.vehicleSale.get(id);
    if (owner === this.wallet) {
      const lock = `L to ${this.vehicleLocks.get(id) ? "unlock" : "lock"}`;
      if (asking != null) return `Press E to drive · listed at ${asking} ${CURRENCY} · B to withdraw · ${lock}`;
      if (!PROPERTY_MARKET_OPEN) return `Press E to drive · ${lock}`;
      return `Press E to drive · B to sell · ${lock}`;
    }
    if (asking != null && PROPERTY_MARKET_OPEN) {
      const seller = this.remoteNameForWallet(owner);
      return `${seller}'s ${this.vehicles.get(id)?.kind ?? "car"} · B to buy for ${asking} ${CURRENCY}`;
    }
    return this.vehicleLocks.get(id) ? "Locked - this car is someone else's" : "Press E to borrow this car";
  }

  /** Best-effort name for a wallet, from whoever is currently in view. */
  private remoteNameForWallet(wallet: string) {
    for (const [id, w] of this.remoteWallets) {
      if (w === wallet) return this.remoteNames.get(id) || "a citizen";
    }
    return "a citizen";
  }

  private doorPrompt(near: Interactable) {
    const base = `Press E to enter ${near.label ?? "building"}`;
    if (near.interiorKind !== "home") return base;
    const info = this.homes.get(near.id);
    if (info && info.owner === this.wallet) {
      const lock = info.locked ? "L to unlock" : "L to lock";
      if (info.forSale) return `${base} · listed at ${info.askingPrice} ${CURRENCY} · B to withdraw · ${lock}`;
      if (!PROPERTY_MARKET_OPEN) return `${base} · H to name · ${lock}`;
      return `${base} · B to list · H to name · ${lock}`;
    }
    if (!PROPERTY_MARKET_OPEN) {
      if (!info?.owner) return base;
      return info.locked ? `${info.ownerName}'s home - locked` : `${base} · ${info.ownerName}'s home`;
    }
    if (info?.owner && info.owner !== this.wallet && !info.forSale) {
      return info.locked ? `${info.ownerName}'s home - locked` : `${base} · ${info.ownerName}'s home`;
    }
    const cost = this.homeCost(near.id, info);
    // Say who you are buying from when it is somebody's home rather than the
    // city's - it is the difference between a purchase and a trade.
    if (info?.owner && info.forSale) {
      return `${base} · ${info.ownerName || "a citizen"}'s home · B to buy for ${cost} ${CURRENCY}`;
    }
    return `${base} · B to buy for ${cost} ${CURRENCY}`;
  }

/** Opens the rename box, if you are standing at a home you own. */
  private promptHomeName() {
    const near = this.nearestHome();
    const inside = this.inBuilding?.interiorKind === "home" ? this.inBuilding : null;
    const id = inside?.id ?? near?.id;
    if (!id) return;
    const info = this.homes.get(id);
    if (!info || info.owner !== this.wallet) {
      this.setNotice("You can only name a home you own.");
      return;
    }
    this.pendingHomeName = { id, current: info.name ?? "" };
  }

  /**
   * Opens the naming prompt when a home changes hands *to you from someone
   * else*, because the sign over the door still carries the seller's name for
   * it until you replace it.
   *
   * Watched on the replicated home state rather than on a purchase reply: the
   * ownership change is the thing that actually matters, and it arrives the
   * same way whether you bought it from a listing, the deed settled late, or
   * the sale completed while you were stood somewhere else entirely.
   *
   * Deliberately not fired for a never-owned city home. Those carry no
   * inherited name, so there is nothing stale to correct, and interrupting a
   * first purchase with a modal helps nobody.
   */
  private noticeHomeBought(before: HomeInfo | undefined, now: HomeInfo, id: string) {
    // No previous record means this is the first time this client has seen the
    // home - on join, every home you already own would otherwise prompt.
    if (!before || !this.wallet) return;
    if (now.owner !== this.wallet) return;
    if (before.owner === this.wallet || !before.owner) return;
    this.pendingHomeName = {
      id,
      // Empty rather than the inherited name: the point is to replace it, and
      // pre-filling would make them clear the seller's text first.
      current: "",
      boughtFrom: before.ownerName || "the previous owner",
      inheritedName: before.name ?? "",
    };
  }

  nameHome(id: string, name: string) {
    this.room?.send("home-name", { id, name });
    this.pendingHomeName = null;
  }

  cancelHomeName() {
    this.pendingHomeName = null;
  }

  /** B is context-sensitive: a car you are at or in takes priority over a home. */
  private async trySell() {
    const carId = this.inVehicle ?? this.nearestCarId();
    if (carId) {
      await this.tryCar(carId);
      return;
    }
    await this.tryBuyHome();
  }

  private nearestCarId(): string | null {
    if (!this.player || this.inBuilding) return null;
    const p = this.player.getPosition();
    let best: string | null = null;
    let bestD = 5.5;
    for (const [id, handle] of this.vehicles) {
      if (!handle.entity.enabled) continue;
      const q = handle.entity.getPosition();
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private async tryCar(id: string) {
    const owner = this.vehicleOwners.get(id);
    const asking = this.vehicleSale.get(id);

    // Your own: list it, or pull the listing.
    if (owner && owner === this.wallet) {
      if (this.inVehicle === id) {
        this.setNotice("Get out of it before you sell it.");
        return;
      }
      if (asking != null) {
        this.room?.send("car-list", { id, list: false });
        return;
      }
      if (!PROPERTY_MARKET_OPEN) {
        this.setNotice(PROPERTY_CLOSED_TEXT);
        return;
      }
      this.pendingCarListing = { id, suggested: asking ?? 0 };
      return;
    }

    if (!owner || asking == null) return;
    if (!PROPERTY_MARKET_OPEN) {
      this.setNotice(PROPERTY_CLOSED_TEXT);
      return;
    }
    if (this.bucks < asking) {
      this.setNotice(`That car costs ${asking} ${CURRENCY}. You have ${this.bucks}.`);
      return;
    }
    if (this.ownedCars.size > 0) {
      this.setNotice("You already own a car. One each.");
      return;
    }

    this.room?.send("car-buy", { id });
  }

  listCar(price: number) {
    const pending = this.pendingCarListing;
    if (!pending) return;
    if (!Number.isFinite(price) || price < MIN_ASKING_PRICE) {
      this.setNotice(`Enter an asking price of at least ${MIN_ASKING_PRICE} ${CURRENCY}.`);
      return;
    }
    this.pendingCarListing = null;
    this.room?.send("car-list", { id: pending.id, list: true, price: Math.round(price) });
  }

  cancelCarListing() {
    this.pendingCarListing = null;
  }

  private async tryBuyHome() {
    const home = this.nearestHome();
    if (!home) return;
    const info = this.homes.get(home.id);

    // On your own doorstep B is the for-sale sign, not a purchase.
    if (info && info.owner === this.wallet) {
      if (info.forSale) {
        this.room?.send("home-list", { id: home.id, list: false });
        return;
      }
      if (!PROPERTY_MARKET_OPEN) {
        this.setNotice(PROPERTY_CLOSED_TEXT);
        return;
      }
      // Listing needs an asking price, so hand off to the HUD for the number.
      this.pendingListing = {
        id: home.id,
        suggested: info.lastPrice || this.homeCost(home.id, info),
        suggestedMinutes: 0,
      };
      return;
    }

    if (info?.owner && !info.forSale) {
      this.setNotice(`This home belongs to ${info.ownerName}`);
      return;
    }
    if (!PROPERTY_MARKET_OPEN) {
      this.setNotice(PROPERTY_CLOSED_TEXT);
      return;
    }

    const price = this.homeCost(home.id, info);
    if (this.bucks < price) {
      this.setNotice(`That home costs ${price} ${CURRENCY}. You have ${this.bucks}.`);
      return;
    }

    this.room?.send("home-buy", { id: home.id, city: home.city });
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
    if (vehicle.forSale) this.vehicleSale.set(vehicleId, Number(vehicle.askingPrice ?? 0));
    else this.vehicleSale.delete(vehicleId);
    if (vehicle.owner && vehicle.owner === this.wallet) {
      this.ownedCars.set(vehicleId, {
        id: vehicleId,
        kind: vehicle.kind,
        color: vehicle.color,
        city: vehicle.city ?? this.city,
        locked: Boolean(vehicle.locked),
        forSale: Boolean(vehicle.forSale),
        askingPrice: Number(vehicle.askingPrice ?? 0),
        x: vehicle.x,
        z: vehicle.z,
      });
    } else {
      this.ownedCars.delete(vehicleId);
    }
    // Whether WE are driving it, not whether the server has agreed yet. Waiting
    // for the server's driver field meant that between entering a car and that
    // state arriving, every update snapped the car back to where the server last
    // saw it - dragging it to wherever it was picked up. The server still
    // overrides explicitly through vehicle-correction when it disagrees.
    const drivenHere = this.inVehicle === vehicleId;
    handle.driver = drivenHere ? "local" : vehicle.driver;
    if (!drivenHere) {
      // animateVehicles eases toward this. Cars cover far more ground per patch
      // than a walker, so snapping here is the most visible stutter in the game.
      const at = handle.entity.getPosition();
      const first = !handle.target;
      handle.target = { x: vehicle.x, z: vehicle.z, rotY: vehicle.rotY };
      if (first || Math.hypot(vehicle.x - at.x, vehicle.z - at.z) > VEHICLE_SNAP) {
        handle.entity.setPosition(vehicle.x, WALK_Y, vehicle.z);
        handle.entity.setEulerAngles(0, (vehicle.rotY * 180) / Math.PI, 0);
        handle.yaw = vehicle.rotY;
      }
    } else {
      handle.target = undefined;
      handle.yaw = undefined;
    }
    const interactable = this.world?.interactables.find((item) => item.kind === "vehicle" && item.id === vehicleId);
    if (interactable) {
      interactable.x = vehicle.x;
      interactable.z = vehicle.z;
    } else if (this.world) {
      // A vehicle that did not exist when the world was built - someone just
      // bought it. Only the pre-placed cars get an interactable at startup, so
      // without this a purchased car is drawn and owned but has nothing to
      // press E on, and can never be driven.
      this.world.interactables.push({
        kind: "vehicle",
        id: vehicleId,
        x: vehicle.x,
        z: vehicle.z,
        radius: 4.4,
        city: (vehicle.city ?? this.city) as CityId,
      });
    }
  }

  private spawnRemote(player: RemotePlayer, sessionId: string) {
    if (!this.app || this.remotes.has(sessionId)) return;
    const key = `${player.accessories ?? ""}|${player.gun ?? ""}|${player.pet ?? ""}`;
    const parked = this.remotePool.get(sessionId);
    let entity: pc.Entity;
    if (parked && parked.lookKey === key) {
      // Same player, same outfit: reuse the model rather than rebuilding it.
      this.remotePool.delete(sessionId);
      entity = parked.entity;
      entity.enabled = true;
    } else {
      parked?.entity.destroy();
      this.remotePool.delete(sessionId);
      entity = createCitizen(this.app.root, appearanceOf(player), `p-${sessionId}`);
    }
    this.remotes.set(sessionId, entity);
    this.remoteState.set(sessionId, player);
    this.remoteNames.set(sessionId, player.name || "citizen");
    if (player.wallet) this.remoteWallets.set(sessionId, player.wallet);
    this.remoteLast.set(sessionId, { x: player.x, z: player.z });
    this.remoteLookKey.set(sessionId, key);
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
    // animateCrowd owns X/Z so it can ease between updates; snapping here on every
    // patch would undo that. Only a teleport (or a model just built) jumps.
    const at = body.getPosition();
    const jumped = Math.hypot(player.x - at.x, player.z - at.z) > REMOTE_SNAP;
    body.setPosition(jumped ? player.x : at.x, groundedY, jumped ? player.z : at.z);
    if (jumped) {
      body.setEulerAngles(0, (player.rotY * 180) / Math.PI, 0);
      this.remoteYaw.set(sessionId, player.rotY);
    }
    // Distance cull: in a 452-unit world most players are nowhere near you,
    // and each one is 19-56 boxes with no batching.
    const here = this.player?.getPosition();
    const distance = here ? Math.hypot(player.x - here.x, player.z - here.z) : 0;
    const inRange = !here || distance <= REMOTE_RENDER_RANGE;
    body.enabled = inRange && (!player.inBuilding || this.inBuilding?.id === player.buildingId);

    // Drop the cosmetic group on anyone far enough away that it would not read,
    // which is most of the geometry in a crowd.
    if (body.enabled) {
      const wasDetailed = this.remoteDetail.get(sessionId) ?? true;
      const detailed = wasDetailed ? distance <= DETAIL_OFF_RANGE : distance <= DETAIL_ON_RANGE;
      if (detailed !== wasDetailed) this.remoteDetail.set(sessionId, detailed);
      setCitizenDetail(body, detailed);
    }
    this.remoteNames.set(sessionId, player.name || "citizen");
    if (player.wallet) this.remoteWallets.set(sessionId, player.wallet);
    const pet = this.remotePets.get(sessionId);
    if (pet) pet.enabled = body.enabled;
  }

  /** Destroys parked citizens nobody returned for. */
  private sweepRemotePool() {
    const now = performance.now();
    if (now - this.poolSweptAt < 4000) return;
    this.poolSweptAt = now;
    for (const [sessionId, parked] of this.remotePool) {
      if (now - parked.at < 20000) continue;
      parked.entity.destroy();
      this.remotePool.delete(sessionId);
    }
  }

  private syncRemotes() {
    for (const id of this.remotes.keys()) this.applyRemote(id);
  }

  /**
   * Parks a citizen instead of destroying it. With interest management a player
   * who walks the edge of your view leaves and re-enters repeatedly, and
   * rebuilding 19-56 boxes each time is a visible hitch. Held briefly, reused if
   * they come back, swept if they do not.
   */
  private dropRemote(sessionId: string) {
    const entity = this.remotes.get(sessionId);
    const lookKey = this.remoteLookKey.get(sessionId);
    if (entity && lookKey !== undefined) {
      entity.enabled = false;
      this.remotePool.set(sessionId, { entity, lookKey, at: performance.now() });
    } else {
      entity?.destroy();
    }
    this.remotes.delete(sessionId);
    this.remoteState.delete(sessionId);
    this.remoteLast.delete(sessionId);
    this.remoteMoveUntil.delete(sessionId);
    this.remoteYaw.delete(sessionId);
    this.remoteNames.delete(sessionId);
    this.remoteWallets.delete(sessionId);
    this.remoteDetail.delete(sessionId);
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
    this.applyLook(dt);
    this.updateShotFx(dt);
    if (this.inVehicle) this.updateVehicle(dt);
    else this.updateWalk(dt);
    this.syncRemotes();
    this.animateCrowd(dt);
    this.animateVehicles(dt);
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
    this.sweepRemotePool();
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
    this.poseOnSeat(this.player, seat);
  }

  /**
   * Orients a body on a seat.
   *
   * Sitting is a plain yaw. Lying tips the whole entity onto its back with a
   * further 90 degrees about its *local* X, which is why this is not one
   * setEulerAngles call: the pitch has to be applied in the body's own frame,
   * after the yaw, or the two compose into a roll and the sleeper ends up on
   * their side facing the ceiling.
   */
  private poseOnSeat(entity: pc.Entity, seat: Seat) {
    entity.setEulerAngles(0, (seat.yaw * 180) / Math.PI, 0);
    if (seat.lie) layFlat(entity);
  }

  private clearSit(snapToFloor = false) {
    const wasLying = this.sitSeat?.lie ?? false;
    this.sitting = false;
    this.sitSeat = null;
    if (snapToFloor && this.player) {
      const p = this.player.getPosition();
      const ground = this.inBuilding?.interior?.y ?? WALK_Y;
      // A bed is solid, and you lie in the middle of it - so standing where you
      // were would drop you inside the furniture with no way to walk out. A
      // chair is not solid and needs no such help.
      const spot = wasLying ? this.freeSpotAround(p.x, p.z) : { x: p.x, z: p.z };
      this.player.setPosition(spot.x, ground, spot.z);
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

/**
   * Standing height at a point: the interior floor, or the top of a raised
   * surface you are over.
   *
   * Interior props are decoration with no collision, so without this a dais is
   * something you walk through rather than stand on.
   */
  private groundAt(x: number, z: number) {
    const floor = this.inBuilding?.interior?.y ?? WALK_Y;
    let best = floor;
    for (const slab of this.inBuilding?.platforms ?? []) {
      if (x < slab.minX || x > slab.maxX || z < slab.minZ || z > slab.maxZ) continue;
      // Only step up onto something you could actually climb; anything taller
      // has to be jumped, which gravity already handles.
      if (slab.y > best && slab.y - floor <= STEP_UP) best = slab.y;
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
        const seat = this.sitSeat;
        applyCitizenMotion(player, seat?.lie ? "lie" : "sit", this.animT);
        if (seat) {
          player.setPosition(seat.x, seat.sitY, seat.z);
          this.poseOnSeat(player, seat);
        }
        return;
      }
    }

    this.yaw += turn * dt * 2.4;
    const downed = this.health <= 0;
    const speed = (sprint && !downed ? this.speed * 1.55 : this.speed) * (downed ? 0.42 : 1);
    const pos = player.getPosition();
    // Inside geometry there is no direction that is not blocked, so ordinary
    // movement cannot get you out. Walk toward open ground instead, at normal
    // speed so the server's movement check does not reject it as a teleport.
    if (!this.inBuilding && this.blocked(pos.x, pos.z)) {
      const out = this.freeSpotAround(pos.x, pos.z);
      const away = Math.hypot(out.x - pos.x, out.z - pos.z);
      if (away > 0.01) {
        const step = Math.min(away, speed * dt);
        player.setPosition(pos.x + ((out.x - pos.x) / away) * step, pos.y, pos.z + ((out.z - pos.z) / away) * step);
        return;
      }
    }
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
      const pass = this.wallPass();
      if (!this.blocked(nx, z, 0.55, pass) && !this.vehicleBlocksMove(x, z, nx, z) && this.allowed(x, z, nx, z)) x = nx;
      if (!this.blocked(x, nz, 0.55, pass) && !this.vehicleBlocksMove(x, z, x, nz) && this.allowed(x, z, x, nz)) z = nz;
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
    // Resolved after movement: which surface you are over depends on where you
    // ended up this frame, not where you started.
    const standing = this.groundAt(x, z);
    const floorY = standing + (this.grounded ? bob : 0);

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
    // Captured before steering, not read back off the entity: getEulerAngles()
    // misreports yaws past +-90, which would snap the car to a wrong heading on
    // any collision while it faced south.
    const previousYaw = this.yaw;
    this.yaw += steer * dt * this.vehicleSpeed * 0.12;
    const pos = handle.entity.getPosition();
    const nx = pos.x + Math.sin(this.yaw) * this.vehicleSpeed * dt;
    const nz = pos.z + Math.cos(this.yaw) * this.vehicleSpeed * dt;
    const hitsVehicle = this.vehicleBlocksVehicleMove(handle.id, nx, nz, this.yaw, handle.kind);
    if (this.allowed(pos.x, pos.z, nx, nz) && !this.blocked(nx, nz, 2.1, this.wallPass()) && !hitsVehicle) {
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

  /**
   * Moves a remote body toward its last known X/Z instead of jumping to it.
   * Every animation state needs this, not just walking: the pose may be driven
   * smoothly by a timer while the body underneath it still steps at the patch rate.
   */
  private easeRemote(id: string, entity: pc.Entity, x: number, y: number, z: number, dt: number, rotY?: number) {
    const p = entity.getPosition();
    const k = Math.hypot(x - p.x, z - p.z) > REMOTE_SNAP ? 1 : 1 - Math.exp(-dt * REMOTE_LERP);
    entity.setPosition(p.x + (x - p.x) * k, y, p.z + (z - p.z) * k);
    // Rotation arrives at the patch rate too, so turning steps as visibly as walking.
    // Knockdowns pose their own rotation and pass nothing here.
    if (rotY === undefined) return;
    // Tracked as a number, never read back off the entity - see VehicleHandle.yaw.
    const yaw = this.remoteYaw.get(id) ?? rotY;
    const delta = Math.atan2(Math.sin(rotY - yaw), Math.cos(rotY - yaw));
    const next = yaw + delta * k;
    this.remoteYaw.set(id, next);
    entity.setEulerAngles(0, (next * 180) / Math.PI, 0);
  }

  /**
   * Cars other people are driving. Their position arrives at the patch rate and
   * their wheels are never turned by updateVehicle, which only runs for the car
   * you are sitting in, so both have to happen here.
   */
  private animateVehicles(dt: number) {
    const k = 1 - Math.exp(-dt * VEHICLE_LERP);
    for (const handle of this.vehicles.values()) {
      const target = handle.target;
      if (!target || handle.driver === "local") continue;
      const at = handle.entity.getPosition();
      const nx = at.x + (target.x - at.x) * k;
      const nz = at.z + (target.z - at.z) * k;
      const moved = Math.hypot(nx - at.x, nz - at.z);
      handle.entity.setPosition(nx, WALK_Y, nz);

      // Take the short way round, or a car crossing north spins through 359 degrees.
      const yaw = handle.yaw ?? target.rotY;
      const delta = Math.atan2(Math.sin(target.rotY - yaw), Math.cos(target.rotY - yaw));
      handle.yaw = yaw + delta * k;
      handle.entity.setEulerAngles(0, (handle.yaw * 180) / Math.PI, 0);

      if (moved > 0.0005) {
        const roll = moved * WHEEL_ROLL;
        for (const name of ["wheel-fl", "wheel-fr", "wheel-bl", "wheel-br"]) {
          handle.entity.findByName(name)?.rotateLocal(roll, 0, 0);
        }
      }
    }
  }

  private animateCrowd(dt: number) {
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
          this.easeRemote(id, entity, x, (st?.y ?? WALK_Y) + 0.16, z, dt);
          this.remoteLast.set(id, { x, z });
          continue;
        }
        this.remoteKnockdowns.delete(id);
      }
      const remoteArmed = Boolean(gunSpec(String(st?.gun ?? ""))?.ranged);
      if (punchUntil > now && !remoteArmed) {
        applyCitizenMotion(entity, "punch", 1 - (punchUntil - now) / PUNCH_MS);
        this.easeRemote(id, entity, x, st?.y ?? p.y, z, dt, st?.rotY);
        // Without this the walk branch sees every step taken during the punch as
        // one jump the moment it ends, and starts a walk cycle on a still body.
        this.remoteLast.set(id, { x, z });
        continue;
      }
      if (st?.sitting) {
        const lying = Boolean((st as { lying?: boolean }).lying);
        applyCitizenMotion(entity, lying ? "lie" : "sit", this.animT);
        this.easeRemote(id, entity, x, st.y ?? p.y, z, dt, st.rotY);
        // After easeRemote, which rewrites the yaw every frame: the tip onto
        // the back has to be re-applied in the body's own frame each time.
        if (lying) layFlat(entity);
        this.remoteLast.set(id, { x, z });
        continue;
      }
      if (hitUntil > now) {
        applyCitizenMotion(entity, "hit", 1 - (hitUntil - now) / HIT_MS);
        this.easeRemote(id, entity, x, st?.y ?? p.y, z, dt, st?.rotY);
        this.remoteLast.set(id, { x, z });
        continue;
      }
      const last = this.remoteLast.get(id);
      // Only a fresh update can restart the timer; frames in between leave it running.
      if (last && Math.hypot(x - last.x, z - last.z) > 0.004) {
        this.remoteMoveUntil.set(id, now + REMOTE_WALK_HOLD_MS);
      }
      const moving = (this.remoteMoveUntil.get(id) ?? 0) > now;
      const bob = applyCitizenMotion(entity, moving ? "walk" : "idle", this.animT);
      if (remoteArmed) applyAimPose(entity, this.animT, Math.max(0, (punchUntil - now) / RECOIL_MS));
      this.easeRemote(id, entity, x, Math.max(p.y, WALK_Y + bob), z, dt, st?.rotY);
      this.remoteLast.set(id, { x, z });
    }
    if (this.world) {
      const obstacles = [...this.vehicles.values()].map((handle) => {
        const p = handle.entity.getPosition();
        return {
          id: handle.id,
          x: p.x,
          z: p.z,
          yaw: entityYaw(handle.entity),
          kind: handle.kind,
        };
      });
      tickNpcs(this.world.npcs, this.lastDt, this.animT, obstacles, this.world.colliders);
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

    // Down the sights: the camera stops orbiting and sits at the eye.
    //
    // This is the whole difference between third and first person. Orbiting
    // swings the camera around the player on a 16-unit arm, so a small mouse
    // move sweeps the entire world sideways - the aim moves because the scene
    // moved. From the eye, the view rotates about its own position instead, and
    // only the direction changes. The world stays where it is.
    if (this.adsActive()) {
      targetX = pos.x + Math.sin(this.yaw) * ADS_EYE_FORWARD;
      targetY = pos.y + ADS_EYE_HEIGHT;
      targetZ = pos.z + Math.cos(this.yaw) * ADS_EYE_FORWARD;
      // No easing: a head does not lag behind its owner. Anything less than
      // glued reads as swimming.
      this.snapCamera = true;
    }

    // The mirror: swing round to the front. The sign on the offset is the whole
    // trick - the follow camera sits at -forward, so +forward puts it where a
    // mirror would be, facing back at you. Turning with A/D then shows your
    // sides, because the camera keeps station ahead of wherever you face.
    if (this.mirrorView) {
      targetX = pos.x + Math.sin(this.yaw) * MIRROR_DIST;
      targetY = pos.y + 1.55;
      targetZ = pos.z + Math.cos(this.yaw) * MIRROR_DIST;
    }

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
    if (this.adsActive()) {
      // Straight down the barrel. Positive pitch is up here, which is what a
      // shooter expects - the orbit camera reads the same value as "how far the
      // camera has risen", and rising means looking down at the player.
      const cp = Math.cos(this.pitch);
      const eye = cam.getPosition();
      cam.lookAt(
        eye.x + Math.sin(this.yaw) * cp,
        eye.y + Math.sin(this.pitch),
        eye.z + Math.cos(this.yaw) * cp,
      );
      return;
    }
    // Looking at the player rather than past them, or the mirror would frame
    // the wall behind their head.
    if (this.mirrorView) cam.lookAt(pos.x, pos.y + 1.05, pos.z);
    else cam.lookAt(pos.x + Math.sin(this.yaw) * lookAhead, pos.y + lookHeight, pos.z + Math.cos(this.yaw) * lookAhead);
  }

/**
   * Real light under the nearest few streetlamps.
   *
   * A fixed pool that follows the player rather than one light per lamp: there
   * are dozens of lamps, clustered lighting is off, and the cost of this is the
   * same whether the city has twenty lamps or two hundred. The emissive pools on
   * the road cover every other lamp; these exist so people, cars and pets walking
   * underneath are actually lit.
   */
  private syncLampLights(day: number) {
    if (!this.app || !this.player) return;
    const night = 1 - day;
    const lamps = this.world?.lamps ?? [];
    if (!lamps.length) return;

    if (!this.lampLights.length) {
      for (let i = 0; i < LAMP_LIGHTS; i++) {
        const e = new pc.Entity(`lamp-light-${i}`);
        e.addComponent("light", {
          type: "omni",
          color: new pc.Color(1, 0.86, 0.6),
          range: LAMP_RANGE,
          // Shadows from this many moving lights would cost more than the whole
          // effect is worth.
          castShadows: false,
          intensity: 0,
        });
        e.enabled = false;
        this.app.root.addChild(e);
        this.lampLights.push(e);
      }
    }

    // Daylight needs none of this, and the search is wasted work.
    if (night < 0.2) {
      for (const light of this.lampLights) light.enabled = false;
      return;
    }

    const now = performance.now();
    if (now - this.lampSyncAt < 250) return;
    this.lampSyncAt = now;

    const here = this.player.getPosition();
    const near = lamps
      .map((lamp) => ({ lamp, d: Math.hypot(lamp.x - here.x, lamp.z - here.z) }))
      .filter((row) => row.d < LAMP_RANGE * 1.6)
      .sort((a, b) => a.d - b.d)
      .slice(0, LAMP_LIGHTS);

    this.lampLights.forEach((light, i) => {
      const row = near[i];
      if (!row || !light.light) {
        light.enabled = false;
        return;
      }
      light.enabled = true;
      light.setPosition(row.lamp.x, 3.1, row.lamp.z);
      // Fade with distance so a lamp entering the set does not pop on.
      const fade = 1 - Math.min(1, row.d / (LAMP_RANGE * 1.6));
      light.light.intensity = 1.5 * night * fade;
    });
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
      // Switched off outright rather than faded to zero. An additive material
      // with emissiveIntensity 0 still paints its emissive colour, which is a
      // white square on the road at noon.
      for (const pool of this.lightPools) pool.enabled = day < 0.5;
    }
    this.syncLampLights(day);
    if (this.inBuilding) {
      const kind = this.inBuilding.interiorKind;
      this.app.scene.fog.start = 12;
      this.app.scene.fog.end = kind === "townhall" ? 48 : 32;
      this.camera.camera.fov = this.adsActive() ? ADS_FOV : kind === "townhall" ? 50 : 56;
      this.camera.camera.farClip = 60;
      this.app.scene.ambientLight = new pc.Color(0.55, 0.52, 0.48);
    } else if (this.camera.camera.fov !== (this.adsActive() ? ADS_FOV : 42)) {
      this.camera.camera.fov = this.adsActive() ? ADS_FOV : 42;
      this.camera.camera.farClip = 70 + (this.settings?.renderDistance ?? 40) * 2.6;
      this.app.scene.fog.start = 50;
    }
  }

  private blocked(x: number, z: number, radius = 0.55, ignore?: Set<Aabb>) {
    // Indoors the world colliders are the building's outer shell; the props in
    // the room have their own list.
    const inside = this.inBuilding?.obstacles;
    if (inside?.some((a) => hitsAabb(x, z, radius, a))) return true;
    return this.world?.colliders.some((a) => !ignore?.has(a) && hitsAabb(x, z, radius, a)) ?? false;
  }

  /**
   * TEMPORARY - delete this method, WALL_PASS_CITY, and the two calls to it
   * once the car wedged in the Trenches hospital has been driven out.
   *
   * Hands back that one building's collider so it can be passed through. It is
   * found rather than hard-coded, and it is a single box: every other wall in
   * the city still stops you.
   */
  private wallPass(): Set<Aabb> | undefined {
    if (!WALL_PASS_CITY) return undefined;
    if (this.wallPassBoxes) return this.wallPassBoxes;
    const boxes = new Set<Aabb>();
    this.wallPassBoxes = boxes;
    const door = this.world?.interactables.find(
      (item) => item.kind === "door" && item.interiorKind === "hospital" && item.city === WALL_PASS_CITY,
    );
    const colliders = this.world?.colliders;
    if (!door || !colliders) return boxes;
    // addEnterable puts the door 0.8 outside the south face, so a point 1.2
    // back from it is inside that building's main box and no other.
    const shell = colliders.find(
      (a) => door.x >= a.minX && door.x <= a.maxX && door.z - 1.2 >= a.minZ && door.z - 1.2 <= a.maxZ,
    );
    if (!shell) return boxes;
    // The hospital is three boxes, not one - the shell, the east wing and the
    // ambulance bay - and a car can be wedged in any of them. Containment
    // rather than overlap, so a neighbour on the same block is not swept in:
    // the wing and the bay each sit within 1.5 units of the shell.
    const pad = 2;
    for (const a of colliders) {
      const within =
        a.minX >= shell.minX - pad && a.maxX <= shell.maxX + pad &&
        a.minZ >= shell.minZ - pad && a.maxZ <= shell.maxZ + pad;
      if (within) boxes.add(a);
    }
    return boxes;
  }

  private vehicleBlocksMove(fromX: number, fromZ: number, toX: number, toZ: number) {
    for (const [id, handle] of this.vehicles) {
      if (id === this.inVehicle || !handle.entity.enabled) continue;
      const position = handle.entity.getPosition();
      const yaw = entityYaw(handle.entity);
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
      const yaw = entityYaw(npc.vehicle);
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
      const otherYaw = entityYaw(other.entity);
      if (!vehiclesOverlap(x, z, yaw, kind, position.x, position.z, otherYaw, other.kind)) continue;
      if (moving) {
        const current = moving.entity.getPosition();
        const currentYaw = entityYaw(moving.entity);
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
      const otherYaw = entityYaw(npc.vehicle);
      const otherKind = npc.vehicleKind ?? "sedan";
      if (!vehiclesOverlap(x, z, yaw, kind, position.x, position.z, otherYaw, otherKind)) continue;
      if (moving) {
        const current = moving.entity.getPosition();
        const currentYaw = entityYaw(moving.entity);
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

  /**
   * Whether a step from one point to another is permitted.
   *
   * Takes the origin as well as the destination because the gate rule is about
   * crossing in, not about where you are. Testing the destination alone froze
   * anyone whose balance fell while they were inside a district: every point
   * around them was gated, so no direction moved, including out.
   */
  private allowed(fromX: number, fromZ: number, toX: number, toZ: number) {
    if (cityAtPosition(toX, toZ) === "void") return false;
    // The ring road outside the walls is open to everyone; the gate is the gate.
    const entering = cityEntered(fromX, fromZ, toX, toZ);
    if (!entering) return true;
    if (!this.mayEnter(entering)) {
      this.gateMessage = this.gateText(entering);
      this.gateUntil = performance.now() + 2600;
      return false;
    }
    return true;
  }

  /**
   * Homes open districts, one rung at a time (see homeAccessTier): a home in
   * the Trenches opens Bagtown, and so on up. Computed from the replicated home
   * state with the same function the server uses, so the client predicts the
   * server's answer exactly and buying a home opens the next gate at once.
   *
   * Dev-launcher demo players own nothing; the server derives their tier from
   * their made-up balance and sends it, so for them that tier is the answer.
   */
  private mayEnter(city: CityId): boolean {
    return CITIES[city].tier <= this.ladderTier();
  }

  private ladderTier(): number {
    if (!this.wallet) return 1;
    if (this.wallet.startsWith("demo:")) return capTier(this.accessTier);
    const owned: CityId[] = [];
    for (const home of this.homes.values()) {
      if (home.owner === this.wallet) owned.push(home.city as CityId);
    }
    return homeAccessTier(owned);
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

/**
   * Somewhere clear to stand when getting out.
   *
   * Stepping out used to be a fixed 2.8 units along +X with no collision test,
   * which drops you inside whatever happens to be there - a wall, most often,
   * and there is no way to walk out of one.
   */
  /**
   * Whether a point is on the floor of the room you are in. Indoors the walls
   * are a clamp on movement rather than colliders, so `blocked` cannot see
   * them - anything placing a player by hand has to ask this instead.
   */
  private insideRoom(x: number, z: number) {
    const door = this.inBuilding;
    if (!door?.interior) return true;
    return (
      Math.abs(x - door.interior.x) <= (door.halfW ?? 4.2) &&
      Math.abs(z - door.interior.z) <= (door.halfD ?? 4.2)
    );
  }

  private freeSpotAround(x: number, z: number) {
    // Closer rings after the first, so a spot against a wall still has
    // somewhere to go. A bed on the east wall of the ward has no clear ground
    // 2.8 units away that is not inside the wall itself, and landing there
    // left the player wedged: the clamp then refuses every step back in.
    for (const ring of [2.8, 2.0, 1.4]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = x + Math.cos(a) * ring;
        const sz = z + Math.sin(a) * ring;
        if (!this.insideRoom(sx, sz)) continue;
        if (!this.blocked(sx, sz) && this.allowed(x, z, sx, sz)) return { x: sx, z: sz };
      }
    }
    // Every direction is blocked: the car's own position is at least reachable,
    // since it drove in.
    return { x, z };
  }

  private exitVehicle() {
    const handle = this.vehicles.get(this.inVehicle ?? "");
    if (handle) {
      handle.driver = "";
      const p = handle.entity.getPosition();
      const spot = this.freeSpotAround(p.x, p.z);
      this.player?.setPosition(spot.x, WALK_Y, spot.z);
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
    this.room?.send("move", {
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: this.yaw,
      sitting: this.sitting,
      lying: this.sitting && Boolean(this.sitSeat?.lie),
    });
  }

  private emitHud() {
    if (!this.player || !this.onHud) return;
    const p = this.player.getPosition();
    const near = this.nearestInteractable();
    let prompt: string | null = null;
    if (this.inVehicle) prompt = this.driving ? null : "Press E to exit vehicle";
    else if (this.inBuilding?.interiorKind === "store") prompt = "Store — press I to shop · E to exit";
    else if (this.inBuilding?.interiorKind === "hospital") prompt = "Hospital — health refilling · E to exit";
    else if (this.inBuilding?.interiorKind === "police") prompt = "Police Station — press R for the blotter · E to exit";
    else if (this.inBuilding?.interiorKind === "townhall") prompt = "Town Hall — take a seat with C · E to exit";
    else if (this.inBuilding?.interiorKind === "fashion") prompt = "Fashion House — press I to change · E to exit";
    else if (this.inBuilding && !this.sitting && !this.nearestSeat()) prompt = "Press E to exit building";
    else if (this.sitting) prompt = this.sitSeat?.lie ? "Press C or WASD to get up" : "Press C or WASD to stand";
    else if (this.nearestSeat()) prompt = this.nearestSeat()?.lie ? "Press C to lie down" : "Press C to sit";
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
      bucks: this.bucks,
      inventory: this.inventory,
      inStore: this.inBuilding?.interiorKind === "store",
      inStation: this.inBuilding?.interiorKind === "police",
      inFashion: this.inBuilding?.interiorKind === "fashion",
      aiming: this.adsActive(),
      outfit: this.look?.outfit ?? "hi-vis",
      inTownhall: this.inBuilding?.interiorKind === "townhall",
      crimeReports: this.crimeReports,
      gun: this.gun,
      pet: this.petKind,
      accessories: this.look?.accessories ?? [],
      tradeInvite: this.tradeInvite,
      trade: this.trade,
      voiceLevel: this.voice?.sampleLevel() ?? 0,
      nearbyVoiceLevel: this.voice?.sampleNearbyLevel() ?? 0,
      notice: performance.now() < this.noticeUntil ? this.notice : null,
      listPrompt: this.pendingListing,
      namePrompt: this.pendingHomeName,
      carListPrompt: this.pendingCarListing,
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
          name: home.name ?? "",
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
    /** Screen position for a sign, slid down into view when you are close. */
    const place = (screen: { x: number; y: number }, dist: number) => {
      const x = (screen.x / app.graphicsDevice.width) * canvas.clientWidth;
      const raw = (screen.y / app.graphicsDevice.height) * canvas.clientHeight;
      const y = dist <= LABEL_PIN_RANGE ? Math.max(LABEL_PIN_TOP, raw) : raw;
      return {
        x,
        y,
        visible: x > -40 && y > -20 && x < canvas.clientWidth + 40 && y < canvas.clientHeight + 20,
      };
    };

    const BUILDING_LABEL_RANGE = 72;
    // Price tags on the forecourt cars are only useful once you are on the lot.
    // A building name is a landmark you navigate by; these are not.
    const CAR_LABEL_RANGE = 22;
    for (const item of this.world?.interactables ?? []) {
      if (!item.label) continue;
      const bx = item.interior?.x ?? item.x;
      const bz = item.interior?.z ?? item.z;
      const by = Math.min(item.labelY ?? 8, LABEL_MAX_Y);
      const dist = Math.hypot(bx - ox, bz - oz);
      if (dist > (item.kind === "buy-car" ? CAR_LABEL_RANGE : BUILDING_LABEL_RANGE)) continue;
      const screen = this.projectToScreen(bx, by, bz);
      if (!screen) continue;
      const at = place(screen, dist);
      tags.push({
        sessionId: `building:${item.id}`,
        name: item.label,
        x: at.x,
        y: at.y,
        visible: at.visible,
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
      // While the market is closed only your own live listing shows, so you can withdraw it.
      const onMarket = PROPERTY_MARKET_OPEN ? !owned || Boolean(info?.forSale) : mine && Boolean(info?.forSale);
      if (!owned && !PROPERTY_MARKET_OPEN) continue;
      const hx = item.interior?.x ?? item.x;
      const hz = item.interior?.z ?? item.z;
      const dist = Math.hypot(hx - ox, hz - oz);
      // A running auction is worth seeing from across the block; a plain
      // for-sale sign only shows once you walk up to the place.
      if (dist > (live || owned ? BUILDING_LABEL_RANGE : HOME_SALE_LABEL_RANGE)) continue;
      const screen = this.projectToScreen(hx, Math.min(item.labelY ?? 9, LABEL_MAX_Y), hz);
      if (!screen) continue;

      let name: string;
      let detail: string | null;
      let tone: "sale" | "auction" | "sold";
      if (onMarket) {
        // A resale names its seller; a home the city still owns has none.
        const seller = info?.owner ? info.ownerName || "a citizen" : "";
        // The headline stays FOR SALE: that is the state worth reading from
        // across the block. Whose it is and what it costs go underneath.
        name = "FOR SALE";
        const asking = this.homeCost(item.id, info);
        const by = seller && !mine ? ` · ${seller}` : "";
        if (dist < HOME_BID_RANGE) {
          detail = mine
            ? `your listing at ${asking} ${CURRENCY} · B to withdraw`
            : `Press B to buy for ${asking} ${CURRENCY}${by}`;
        } else {
          detail = `${asking} ${CURRENCY}${mine ? " · yours" : by}`;
        }
        tone = "sale";
      } else if (info) {
        // A named home shows its name; an unnamed one falls back to whose it is.
        name = info.name || (mine ? "YOUR HOME" : "SOLD");
        detail = mine
          ? dist < HOME_BID_RANGE && PROPERTY_MARKET_OPEN
            ? "Press B to list for sale"
            : null
          : info.ownerName || null;
        tone = "sold";
      } else {
        continue;
      }

      const at = place(screen, dist);
      tags.push({
        sessionId: `home:${item.id}`,
        name,
        x: at.x,
        y: at.y,
        visible: at.visible,
        inRange: dist < HOME_BID_RANGE,
        bubble: null,
        kind: "home",
        detail,
        tone,
      });
    }

    // Listed cars get the same sign a listed home does, or a seller has no way
    // of knowing their listing took, and a buyer no way of finding one.
    for (const [id, asking] of this.vehicleSale) {
      const handle = this.vehicles.get(id);
      if (!handle?.entity.enabled || id === this.inVehicle) continue;
      const q = handle.entity.getPosition();
      const dist = Math.hypot(q.x - ox, q.z - oz);
      if (dist > BUILDING_LABEL_RANGE) continue;
      const screen = this.projectToScreen(q.x, 3.1, q.z);
      if (!screen) continue;

      const owner = this.vehicleOwners.get(id) ?? "";
      const mine = owner === this.wallet;
      if (!mine && !PROPERTY_MARKET_OPEN) continue;
      const seller = mine ? "" : ` · ${this.remoteNameForWallet(owner)}`;
      tags.push({
        sessionId: `car:${id}`,
        name: "FOR SALE",
        x: (screen.x / app.graphicsDevice.width) * canvas.clientWidth,
        y: (screen.y / app.graphicsDevice.height) * canvas.clientHeight,
        visible:
          screen.x > -40 && screen.y > -20 && screen.x < app.graphicsDevice.width + 40 && screen.y < app.graphicsDevice.height + 20,
        inRange: dist < 5.5,
        bubble: null,
        kind: "home",
        detail:
          dist < 5.5
            ? mine
              ? `your ${handle.kind} at ${asking} ${CURRENCY} · B to withdraw`
              : `Press B to buy for ${asking} ${CURRENCY}${seller}`
            : `${handle.kind} · ${asking} ${CURRENCY}${mine ? " · yours" : seller}`,
        tone: "sale",
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
    playGunshot(this.gun);
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
    this.spawnShotFx(
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

  /**
   * The shot: muzzle flash, a round that travels, and an impact.
   *
   * What this replaces was a single box the full length of the shot, switched on
   * for 70ms and switched off. It read as a static stick appearing in the air,
   * because nothing about it moved - the eye was given no direction, no speed
   * and no point of origin.
   *
   * Now a round leaves the barrel and crosses the distance, dragging a short
   * trail, and something happens where it lands. The travel time is real but
   * brief: at 220 units a second a shot across the plaza takes about a seventh
   * of a second, which is long enough to see and too short to feel sluggish.
   *
   * Everything fades by scale rather than by opacity, because material() hands
   * out shared cached materials - dimming one would dim every object drawn with
   * the same colour.
   */
  private spawnShotFx(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    if (!this.app) return;
    const dist = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    if (dist < 0.2) return;
    const inv = 1 / dist;
    const dir = { x: (x2 - x1) * inv, y: (y2 - y1) * inv, z: (z2 - z1) * inv };

    const bolt = new pc.Entity("bolt");
    bolt.addComponent("render", {
      type: "box",
      material: material("#FFF6D0", { emissive: "#FFF6D0", intensity: 12 }),
    });
    bolt.setLocalScale(0.09, 0.09, 0.8);
    bolt.setPosition(x1, y1, z1);
    bolt.lookAt(x2, y2, z2);
    this.app.root.addChild(bolt);

    const trail = new pc.Entity("trail");
    trail.addComponent("render", {
      type: "box",
      material: material("#FFC86A", { emissive: "#FFC86A", intensity: 6 }),
    });
    trail.setLocalScale(0.035, 0.035, 0.01);
    this.app.root.addChild(trail);

    this.shots.push({ bolt, trail, from: { x: x1, y: y1, z: z1 }, dir, dist, travelled: 0 });

    // Muzzle flash: a brief flare at the barrel, plus one real light so the
    // shooter and the ground around them actually brighten for a frame or two.
    this.spawnPuff(x1, y1, z1, 0.42, 0.07, "#FFE9A8");
    this.flashMuzzle(x1, y1, z1);
  }

  /** A shrinking emissive cube. The whole vocabulary of these effects. */
  private spawnPuff(x: number, y: number, z: number, size: number, ttl: number, hex: string, drift?: { x: number; y: number; z: number }) {
    if (!this.app) return;
    const e = new pc.Entity("fx");
    e.addComponent("render", { type: "box", material: material(hex, { emissive: hex, intensity: 9 }) });
    e.setLocalScale(size, size, size);
    e.setPosition(x, y, z);
    this.app.root.addChild(e);
    this.puffs.push({ e, life: 0, ttl, size, drift });
  }

  /**
   * One reusable light for every muzzle flash.
   *
   * Created once and moved, rather than a new light per shot: lights are the
   * expensive thing in this renderer, and a firefight would otherwise add one
   * per trigger pull.
   */
  private flashMuzzle(x: number, y: number, z: number) {
    if (!this.app) return;
    if (!this.muzzleLight) {
      this.muzzleLight = new pc.Entity("muzzle-light");
      this.muzzleLight.addComponent("light", {
        type: "omni",
        color: new pc.Color(1, 0.88, 0.62),
        range: 9,
        intensity: 0,
        castShadows: false,
      });
      this.app.root.addChild(this.muzzleLight);
    }
    this.muzzleLight.setPosition(x, y, z);
    this.muzzleFlash = MUZZLE_FLASH_MS / 1000;
  }

  /** Advances every live shot, puff and the muzzle light. */
  private updateShotFx(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.travelled = Math.min(s.dist, s.travelled + BOLT_SPEED * dt);
      const hx = s.from.x + s.dir.x * s.travelled;
      const hy = s.from.y + s.dir.y * s.travelled;
      const hz = s.from.z + s.dir.z * s.travelled;
      s.bolt.setPosition(hx, hy, hz);

      // The trail runs from just behind the round back toward the muzzle, and
      // is capped so it reads as a streak rather than a growing beam.
      const tail = Math.min(TRAIL_LEN, s.travelled);
      if (tail > 0.05) {
        s.trail.enabled = true;
        s.trail.setLocalScale(0.035, 0.035, tail);
        s.trail.setPosition(hx - s.dir.x * tail * 0.5, hy - s.dir.y * tail * 0.5, hz - s.dir.z * tail * 0.5);
        s.trail.lookAt(hx, hy, hz);
      } else {
        s.trail.enabled = false;
      }

      if (s.travelled >= s.dist) {
        // Impact: one bright core and a handful of sparks thrown back toward
        // the shooter, which is the direction debris actually comes off.
        this.spawnPuff(hx, hy, hz, 0.5, 0.1, "#FFD08A");
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          this.spawnPuff(hx, hy, hz, 0.13, 0.22, "#FFA23E", {
            x: -s.dir.x * 2.2 + Math.cos(a) * 2.4,
            y: 1.6 + Math.sin(a) * 1.2,
            z: -s.dir.z * 2.2 + Math.sin(a) * 2.4,
          });
        }
        s.bolt.destroy();
        s.trail.destroy();
        this.shots.splice(i, 1);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      const k = p.life / p.ttl;
      if (k >= 1) {
        p.e.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      if (p.drift) {
        const q = p.e.getPosition();
        // Gravity on the sparks, so they arc instead of sliding.
        p.drift.y -= 9 * dt;
        p.e.setPosition(q.x + p.drift.x * dt, q.y + p.drift.y * dt, q.z + p.drift.z * dt);
      }
      const scale = p.size * (1 - k) * (1 - k);
      p.e.setLocalScale(scale, scale, scale);
    }

    if (this.muzzleFlash > 0 && this.muzzleLight?.light) {
      this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
      const k = this.muzzleFlash / (MUZZLE_FLASH_MS / 1000);
      this.muzzleLight.light.intensity = 6 * k * k;
    }
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
    if (msg.fromSession !== me) {
      this.meleePunch.set(msg.fromSession, now + PUNCH_MS);
      // Only guns make a noise; a thrown punch does not.
      const shooter = this.remoteState.get(msg.fromSession);
      const gun = String(shooter?.gun ?? "");
      if (gunSpec(gun)?.ranged) {
        const here = this.player?.getPosition();
        const away = here ? Math.hypot(msg.x - here.x, msg.z - here.z) : 0;
        playGunshot(gun, away);
      }
    }
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

  /**
   * Puts on an outfit.
   *
   * Refuses anything the player does not own, which for a free outfit is always
   * satisfied and for a paid one means it must be in the inventory. The check is
   * repeated server-side; this one exists so the wardrobe cannot show a change
   * that will not stick.
   *
   * The new look is pushed to the room as well as saved, or everyone else keeps
   * seeing the clothes you arrived in until you reconnect.
   */
  /**
   * What the gate says when it turns you away: the one thing that opens it,
   * which is a home in the district below. Names both places, so a player at
   * the Midtown gate learns it is a Bagtown home they need - not just "no".
   */
  private gateText(city: CityId): string {
    const name = CITIES[city].name;
    const below = unlockingCity(city);
    if (!below || !PROPERTY_MARKET_OPEN) return `${name} is closed for now. Only the Trenches is open.`;
    return `${name} is for residents of ${CITIES[below].name}. Buy a home in ${CITIES[below].name} to get in.`;
  }

  /**
   * Turns the camera by whatever the mouse banked since the last frame.
   *
   * Once per frame rather than once per event, so the speed of the turn follows
   * the distance the hand moved rather than how many events the mouse happened
   * to emit. The remainder is carried instead of dropped: easing toward the
   * banked delta smooths the motion without losing any of it, so a slow drag
   * still ends up exactly where it was aimed.
   */
  private applyLook(dt: number) {
    if (this.lookDx === 0 && this.lookDy === 0) return;
    const t = Math.min(1, 1 - Math.pow(LOOK_SMOOTH, dt));
    const dx = this.lookDx * t;
    const dy = this.lookDy * t;
    this.lookDx -= dx;
    this.lookDy -= dy;
    // Below a fraction of a pixel the carry is invisible; drop it so the camera
    // settles instead of creeping.
    if (Math.abs(this.lookDx) < 0.01) this.lookDx = 0;
    if (Math.abs(this.lookDy) < 0.01) this.lookDy = 0;

    this.yaw -= dx * LOOK_SENS;
    // Aiming needs the full range: the orbit limits exist to stop the camera
    // ducking through the floor or the ceiling, neither of which applies to a
    // view taken from the player's own head.
    const ads = this.adsActive();
    const lo = ads ? -ADS_PITCH : this.inBuilding ? -0.28 : -0.32;
    const hi = ads ? ADS_PITCH : this.inBuilding ? 0.48 : 1.2;
    this.pitch = Math.max(lo, Math.min(hi, this.pitch - dy * LOOK_SENS * 0.83));
  }

  /**
   * Turns the mirror on or off. Eased rather than snapped, so the camera swings
   * round to your front instead of cutting - which reads as a camera move
   * rather than as a teleport.
   */
  setMirrorView(on: boolean) {
    this.mirrorView = on && this.inBuilding?.interiorKind === "fashion";
  }

  /**
   * Draws the weapon in a numbered slot, or puts it away if it is already out.
   *
   * Slots come from armSlots(), which is the weapons still sold - a retired one
   * would otherwise hold a number key that does nothing for almost everybody.
   * Pressing the slot you are already holding disarms, so one key both arms and
   * disarms and there is nothing to remember about which state you are in.
   */
  quickArm(slot: number) {
    const spec = armSlots()[slot - 1];
    if (!spec) return;
    if (this.gun === spec.id) {
      this.disarm();
      return;
    }
    if (!hasItem(this.inventory, spec.id as ItemId)) {
      this.setNotice(`You do not own a ${spec.label}.`);
      return;
    }
    this.gun = spec.id;
    // A weapon you just drew is drawn, not lowered.
    this.holstered = false;
    if (this.look) this.look.gun = this.gun;
    this.refreshLook();
    if (this.rangedOut()) this.captureAim();
    else this.releaseAim();
    this.persistBag();
    this.setNotice(`${spec.label} drawn.`);
  }

  /** Puts the weapon away entirely - unequipped, not merely lowered. */
  disarm() {
    if (!this.gun) return;
    const label = gunSpec(this.gun)?.label ?? "Weapon";
    this.gun = null;
    this.holstered = false;
    if (this.look) this.look.gun = null;
    this.refreshLook();
    this.releaseAim();
    this.persistBag();
    this.setNotice(`${label} put away.`);
  }

  /**
   * Takes a screenshot of the world.
   *
   * The copy is taken on "postrender", which still runs inside the frame that
   * drew it. Anywhere later and WebGL has already discarded the drawing buffer
   * and the image comes back empty - the alternative being preserveDrawingBuffer,
   * a device-creation flag that would tax every frame for every player forever
   * to serve a button most will never press.
   *
   * The HUD is DOM sitting on top of the canvas, so none of it is included.
   * That is wanted here: a clean shot of the city is the thing worth sharing,
   * and a health bar across the middle of it is not.
   */
  captureShot(): Promise<Blob | null> {
    const app = this.app;
    const canvas = this.canvas;
    if (!app || !canvas) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        resolve(blob);
      };
      app.once("postrender", () => {
        const copy = snapshot(canvas);
        if (!copy) return finish(null);
        // Watermarking and encoding happen off the critical path, on the copy.
        void composeShot(copy, this.shotCaption()).then(finish);
      });
      // A paused or hidden tab may never render again; do not hang the UI on it.
      window.setTimeout(() => finish(null), 2000);
    });
  }

  /** "the Trenches · BLK 07 · -57, 198" - where the shot was taken. */
  private shotCaption(): string {
    const p = this.player?.getPosition();
    const city = CITIES[this.city]?.name ?? "";
    if (!p) return city;
    return `${city} · ${Math.round(p.x)}, ${Math.round(p.z)}`;
  }

  /**
   * Moves the local player to the spawn the server chose, and unblocks start().
   *
   * Called once, from the first state sync. The camera is snapped rather than
   * eased: there is no previous position worth travelling from, and easing over
   * a whole city would be the very glide this exists to remove.
   */
  private adoptSpawn(state: { x?: number; y?: number; z?: number; city?: string }) {
    if (this.spawned) return;
    this.spawned = true;
    const x = Number(state.x);
    const z = Number(state.z);
    if (this.player && Number.isFinite(x) && Number.isFinite(z)) {
      const y = Number.isFinite(Number(state.y)) ? Number(state.y) : WALK_Y;
      this.player.setPosition(x, y, z);
      if (state.city && CITIES[state.city as CityId]) this.city = state.city as CityId;
      this.snapCamera = true;
      // The sky belongs to the district we actually landed in.
      this.lastCycleKey = "";
      this.applyCityMood();
    }
    this.onSpawned?.();
    this.onSpawned = null;
  }

  /**
   * Puts the local player on the ward after the server says they were downed.
   *
   * The server decides the admission - it owns health and it owns the beds -
   * but interiors are client geometry, so it can only say "bed 3". This finds
   * the hospital for the district and lays the body on that bed.
   *
   * With no bed (-1) the patient recovers on their feet by the door, which is
   * the case that must not fail: refusing them a place to heal would leave them
   * downed outside with no way back.
   */
  /**
   * Downed, and woken up outside the hospital on your feet. Health is already
   * back at 100 on the server; this is only the walk to the door, which the
   * server cannot place because it has no map of where the doors are.
   */
  private dischargeOutside() {
    if (!this.player || !this.world) return;
    const door = this.world.interactables.find(
      (item) => item.kind === "door" && item.interiorKind === "hospital" && item.city === this.city,
    );
    if (!door?.exterior) return;

    // They may have gone down inside a building; that interior would stay
    // lit otherwise, with nobody in it.
    if (this.inBuilding) {
      const previous = this.world.interiors.get(this.inBuilding.id);
      if (previous) previous.enabled = false;
      this.inBuilding = null;
    }
    this.inVehicle = null;
    this.clearSit();
    this.knockdown = null;
    this.player.setPosition(door.exterior.x, WALK_Y, door.exterior.z);
    this.vy = 0;
    this.grounded = true;
    this.pitch = 0.38;
    this.snapCamera = true;
    this.releaseAim();
    this.syncRemotes();
    this.syncMove();
    this.setNotice("Patched up and sent on your way.");
  }

  /** Whether the player is stood in the fashion house, for the I-key binding. */
  inFashionHouse(): boolean {
    return this.inBuilding?.interiorKind === "fashion";
  }

  wearOutfit(id: OutfitId) {
    if (!ownsOutfit(this.inventory, id)) {
      this.setNotice("You do not own that outfit.");
      return;
    }
    if (!this.look) return;
    this.look.outfit = id;
    this.refreshLook();
    this.room?.send("loadout", { outfit: id });
    const c = loadCharacter();
    if (c) saveCharacter({ ...c, outfit: id }, loadSession()?.chain);
    this.setNotice(`Wearing ${catalogItem(id)?.name ?? outfitLabel(id)}.`);
  }

  private persistBag() {
    const c = loadCharacter();
    if (c) {
      saveCharacter(
        {
          ...c,
          bucks: this.bucks,
          inventory: this.inventory,
          accessories: this.look?.accessories ?? c.accessories,
          equippedGun: this.gun,
          equippedPet: this.petKind,
          brokemeter: clampHealth(this.health),
        },
        loadSession()?.chain,
      );
    }
    this.room?.send("loadout", {
      inventory: encodeInventory(this.inventory),
      bucks: this.bucks,
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
      // The pet stands on whatever is under IT, not under its owner - otherwise
      // it sinks through a dais its owner is standing on, or floats beside one.
      const paws = this.petWalk.entity.getPosition();
      tickPetWalker(this.petWalk, p.x, p.z, this.yaw, this.groundAt(paws.x, paws.z), dt);
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
      // Heel to where the owner is drawn, not where the network says they are, or
      // the pet sits slightly ahead of the body by the width of the easing lag.
      const owner = body.getPosition();
      tickPetWalker(walker, owner.x, owner.z, st.rotY, floor, dt);
    }
  }

  private applyBag(msg: { inventory?: string; bucks?: number; gun?: string; pet?: string; accessories?: string }) {
    if (typeof msg.inventory === "string") this.inventory = decodeInventory(msg.inventory);
    if (typeof msg.bucks === "number") this.bucks = msg.bucks;
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
  forSale?: boolean;
  askingPrice?: number;
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
