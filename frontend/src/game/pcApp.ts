import * as pc from "playcanvas";

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

export async function createPcApp(canvas: HTMLCanvasElement): Promise<pc.AppBase> {
  await waitForLayout(canvas);

  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
    antialias: true,
  });

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
  app.destroy();
}

export function hexColor(hex: string): pc.Color {
  const n = parseInt(hex.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const mats = new Map<string, pc.StandardMaterial>();
const glowMats: { mat: pc.StandardMaterial; kind: "windows" | "sign"; max: number }[] = [];

type MatExtras = { emissive?: string; intensity?: number; gloss?: number; glow?: "windows" | "sign" };

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

export function setCycleGlow(night: number) {
  const n = Math.max(0, Math.min(1, night));
  for (const item of glowMats) {
    item.mat.emissiveIntensity =
      item.kind === "windows" ? 0.06 + n * item.max : item.max * (0.4 + n * 0.75);
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
