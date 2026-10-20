import * as pc from "playcanvas";
import { disposeBricks } from "./bricks";

type AppExtras = pc.AppBase & {
  _onResize?: () => void;
  _resizeObserver?: ResizeObserver;
};

async function waitForLayout(canvas: HTMLCanvasElement) {
  for (let i = 0; i < 12; i++) {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
    if (w > 1 && h > 1) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

export type PcAppOptions = {
  /** Needed to read pixels back after render; off by default, it costs memory. */
  preserveDrawingBuffer?: boolean;
  /** Offscreen apps must not claim the shared handle the world build reads. */
  offscreen?: boolean;
};

export async function createPcApp(canvas: HTMLCanvasElement, opts: PcAppOptions = {}): Promise<pc.AppBase> {
  await waitForLayout(canvas);

  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
    antialias: true,
    // Forwarded to the WebGL context. Not in this version's typings, but the
    // browser honours it, and without it reading pixels back after a render
    // returns a cleared buffer.
    ...(opts.preserveDrawingBuffer ? { preserveDrawingBuffer: true } : {}),
  } as Parameters<typeof pc.createGraphicsDevice>[1]);

  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.mouse = new pc.Mouse(canvas);
  options.keyboard = new pc.Keyboard(window);
  options.touch = new pc.TouchDevice(canvas);
  options.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
  ];

  const app = new pc.AppBase(canvas);
  app.init(options);
  // The world build reads this for the light-pool texture, so an offscreen
  // renderer must not take it over.
  if (!opts.offscreen) currentApp = app;
  app.scene.clusteredLightingEnabled = false;
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.resizeCanvas(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight));

  const extra = app as AppExtras;
  const resize = () => {
    if (!app.graphicsDevice) return;
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
    app.resizeCanvas(w, h);
  };
  extra._onResize = resize;
  window.addEventListener("resize", resize);
  extra._resizeObserver = new ResizeObserver(resize);
  extra._resizeObserver.observe(canvas.parentElement ?? canvas);

  app.start();
  return app;
}

export function destroyPcApp(app: pc.AppBase) {
  const extra = app as AppExtras;
  if (extra._onResize) window.removeEventListener("resize", extra._onResize);
  extra._resizeObserver?.disconnect();
  mats.clear();
  glowMats.length = 0;
  // Bound to the destroyed device; a second app would upload nothing.
  poolTex?.destroy();
  poolTex = null;
  disposeBricks();
  currentApp = null;
  app.destroy();
}

/** The live game's graphics device, for code that builds its own meshes. */
export function graphicsDevice(): pc.GraphicsDevice | null {
  return currentApp?.graphicsDevice ?? null;
}

export function hexColor(hex: string): pc.Color {
  const n = parseInt(hex.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const mats = new Map<string, pc.StandardMaterial>();
/** Set on create. The pool texture needs a graphics device to upload to. */
let currentApp: pc.AppBase | null = null;
const glowMats: { mat: pc.StandardMaterial; kind: "windows" | "sign" | "pool"; max: number }[] = [];

type MatExtras = { emissive?: string; intensity?: number; gloss?: number; glow?: "windows" | "sign" | "pool" };

export function material(hex: string, extras?: MatExtras): pc.StandardMaterial {
  const key = `${hex}|${extras?.emissive ?? ""}|${extras?.intensity ?? 0}|${extras?.gloss ?? 0}|${extras?.glow ?? ""}`;
  const hit = mats.get(key);
  if (hit) return hit;
  const m = new pc.StandardMaterial();
  m.diffuse = hexColor(hex);
  m.useLighting = true;
  m.useSkybox = false;
  m.useMetalness = true;
  m.metalness = 0;
  m.gloss = extras?.gloss ?? 0.18;
  if (extras?.emissive) {
    m.emissive = hexColor(extras.emissive);
    m.emissiveIntensity = extras.intensity ?? 4;
  }
  m.update();
  mats.set(key, m);
  if (extras?.glow && extras.emissive) {
    glowMats.push({ mat: m, kind: extras.glow, max: extras.intensity ?? 4 });
  }
  return m;
}

let poolTex: pc.Texture | null = null;

/**
 * A soft radial falloff, drawn once and shared by every light pool.
 *
 * Light has no edges. A flat quad reads as painted-on tarmac no matter what
 * colour it is, so the shape has to fade to nothing at its rim.
 */
function poolTexture(app: pc.AppBase): pc.Texture {
  if (poolTex) return poolTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // The falloff is in COLOUR, not alpha. Additive blending adds src.rgb and
  // effectively ignores alpha, so a white-to-transparent ramp would add full
  // white right to the rim - a hard bright square, which is the whole problem
  // this is fixing. White to black gives a soft edge under any blend mode.
  g.addColorStop(0, "rgb(255,255,255)");
  g.addColorStop(0.35, "rgb(140,140,140)");
  g.addColorStop(0.7, "rgb(36,36,36)");
  g.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new pc.Texture(app.graphicsDevice, {
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    // Clamped, or the gradient tiles and the rim shows a seam.
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(canvas);
  poolTex = tex;
  return tex;
}

/**
 * The patch of light a streetlamp throws on the road.
 *
 * Additive, so it brightens the surface underneath instead of painting over it -
 * that is the difference between light and a coloured tile. The tint is pulled
 * most of the way to white as well: a lamp lit in the district accent made the
 * road look blue rather than lit.
 */
export function lightPool(parent: pc.Entity, name: string, pos: [number, number, number], radius: number, hex: string) {
  const app = currentApp;
  const e = new pc.Entity(name);
  const m = new pc.StandardMaterial();
  const tint = hexColor(hex);
  // 70% toward white: enough colour to tell a gold Uptown lamp from a blue
  // Bagtown one, not enough to look like paint.
  m.emissive = new pc.Color(tint.r * 0.3 + 0.7, tint.g * 0.3 + 0.7, tint.b * 0.3 + 0.7);
  m.emissiveIntensity = 0;
  m.diffuse = new pc.Color(0, 0, 0);
  m.useLighting = false;
  m.useSkybox = false;
  m.blendType = pc.BLEND_ADDITIVE;
  // Additive on a flat ground plane: writing depth would let it occlude things
  // standing in it, and z-fight with the road.
  m.depthWrite = false;
  if (app) m.emissiveMap = poolTexture(app);
  m.update();
  e.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
  e.setLocalScale(radius * 2, 1, radius * 2);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  parent.addChild(e);
  glowMats.push({ mat: m, kind: "pool", max: 1.5 });
  return e;
}

export function setCycleGlow(night: number) {
  const n = Math.max(0, Math.min(1, night));
  for (const item of glowMats) {
    if (item.kind === "windows") item.mat.emissiveIntensity = 0.06 + n * item.max;
    // Light pools are the puddle a streetlamp throws on the road. Unlike a sign,
    // they have no daytime presence at all - a glowing patch of tarmac at noon
    // reads as a bug - so they scale from nothing and stay off until dusk.
    else if (item.kind === "pool") item.mat.emissiveIntensity = item.max * Math.max(0, n - 0.25) * 1.35;
    else item.mat.emissiveIntensity = item.max * (0.4 + n * 0.75);
    item.mat.update();
  }
}

export function box(
  parent: pc.Entity,
  name: string,
  pos: [number, number, number],
  scale: [number, number, number],
  hex: string,
  extras?: MatExtras,
): pc.Entity {
  const e = new pc.Entity(name);
  e.addComponent("render", {
    type: "box",
    material: material(hex, extras),
  });
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  e.setLocalScale(scale[0], scale[1], scale[2]);
  parent.addChild(e);
  return e;
}

export type Aabb = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function aabbFrom(pos: [number, number, number], scale: [number, number, number]): Aabb {
  const hx = scale[0] / 2;
  const hz = scale[2] / 2;
  return {
    minX: pos[0] - hx,
    maxX: pos[0] + hx,
    minZ: pos[2] - hz,
    maxZ: pos[2] + hz,
  };
}

export function hitsAabb(x: number, z: number, radius: number, a: Aabb): boolean {
  return x + radius > a.minX && x - radius < a.maxX && z + radius > a.minZ && z - radius < a.maxZ;
}

/**
 * Heading of an entity, in radians.
 *
 * Do not use `getEulerAngles().y` for this. Euler decomposition is ambiguous, and
 * past +-90 degrees PlayCanvas returns the mirrored triple - a heading of 135
 * reads back as 45 with x and z at 180 - so the bare y is wrong for half of all
 * headings. The forward vector is exact everywhere.
 */
export function entityYaw(node: pc.GraphNode) {
  const f = node.forward;
  return Math.atan2(-f.x, -f.z);
}
