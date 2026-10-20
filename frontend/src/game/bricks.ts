import * as pc from "playcanvas";
import { hexColor } from "./pcApp";

/**
 * Brick walls for buildings.
 *
 * A building used to be one stretched unit box, so any texture on it stretched
 * with the building: a ten-storey tower would have had bricks the size of
 * doors. Here each building gets its own box mesh whose texture coordinates are
 * measured in metres, so a brick is the same size on every wall in the game.
 *
 * The texture is generated once, in white and grey, and the material's colour
 * tints it - so every district keeps its own building palette, just in brick.
 * A matching normal map sets the mortar back so the lighting picks out each
 * course.
 */

/** One texture tile covers this many metres of wall: 2 bricks across, 4 courses up. */
const TILE_METRES = 1;
const TILE_PX = 256;
const COURSES = 4;
const BRICKS_PER_COURSE = 2;
const MORTAR_PX = 6;
/** Pixels over which a brick's edge rounds down into the mortar. */
const BEVEL_PX = 4;

let albedo: pc.Texture | null = null;
let normal: pc.Texture | null = null;
const materials = new Map<string, pc.StandardMaterial>();

/** Deterministic, so the wall looks the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Height of the wall at a pixel: 1 on a brick face, 0 in the mortar, with a
 * short ramp between. Running bond - every other course shifts half a brick.
 */
function heightAt(x: number, y: number): number {
  const courseH = TILE_PX / COURSES;
  const brickW = TILE_PX / BRICKS_PER_COURSE;
  const course = Math.floor(y / courseH);
  const offset = course % 2 === 1 ? brickW / 2 : 0;
  const lx = (((x + offset) % brickW) + brickW) % brickW;
  const ly = y - course * courseH;
  const half = MORTAR_PX / 2;
  // Distance from this pixel to the nearest mortar line.
  const edge = Math.min(lx, brickW - lx, ly, courseH - ly) - half;
  if (edge <= 0) return 0;
  return Math.min(1, edge / BEVEL_PX);
}

function brickIndex(x: number, y: number): number {
  const courseH = TILE_PX / COURSES;
  const brickW = TILE_PX / BRICKS_PER_COURSE;
  const course = Math.floor(y / courseH);
  const offset = course % 2 === 1 ? brickW / 2 : 0;
  return course * 8 + Math.floor((((x + offset) % TILE_PX) + TILE_PX) % TILE_PX / brickW);
}

function makeTexture(device: pc.GraphicsDevice, canvas: HTMLCanvasElement, srgb: boolean): pc.Texture {
  const tex = new pc.Texture(device, {
    width: TILE_PX,
    height: TILE_PX,
    format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    // Walls are mostly seen at a glancing angle from the street, which is where
    // plain mipmapping blurs bricks into mush.
    anisotropy: 8,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
  });
  tex.setSource(canvas);
  return tex;
}

function buildTextures(device: pc.GraphicsDevice) {
  const random = rng(0x6b726963);
  // A shade per brick, so a wall is not one flat colour with lines drawn on it.
  const shade = new Map<number, number>();
  const shadeOf = (i: number) => {
    let s = shade.get(i);
    if (s === undefined) {
      s = 0.86 + random() * 0.14;
      shade.set(i, s);
    }
    return s;
  };

  const colour = document.createElement("canvas");
  colour.width = colour.height = TILE_PX;
  const cctx = colour.getContext("2d")!;
  const cimg = cctx.createImageData(TILE_PX, TILE_PX);

  const heights = new Float32Array(TILE_PX * TILE_PX);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const h = heightAt(x, y);
      heights[y * TILE_PX + x] = h;
      // Mortar is a lighter grey than you might expect: it is multiplied by the
      // building colour, and a dark value turned every wall muddy.
      const brick = shadeOf(brickIndex(x, y)) + (random() - 0.5) * 0.05;
      const value = h > 0 ? 0.68 + (brick - 0.68) * Math.min(1, h * 1.5) : 0.68;
      const v = Math.round(Math.max(0, Math.min(1, value)) * 255);
      const o = (y * TILE_PX + x) * 4;
      cimg.data[o] = cimg.data[o + 1] = cimg.data[o + 2] = v;
      cimg.data[o + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);

  // Normals from the height field, wrapping at the edges so the tile repeats
  // without a seam.
  const bumps = document.createElement("canvas");
  bumps.width = bumps.height = TILE_PX;
  const nctx = bumps.getContext("2d")!;
  const nimg = nctx.createImageData(TILE_PX, TILE_PX);
  const at = (x: number, y: number) =>
    heights[((y + TILE_PX) % TILE_PX) * TILE_PX + ((x + TILE_PX) % TILE_PX)];
  const strength = 2.2;
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * TILE_PX + x) * 4;
      nimg.data[o] = Math.round((dx / len * 0.5 + 0.5) * 255);
      nimg.data[o + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
      nimg.data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      nimg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  albedo = makeTexture(device, colour, true);
  normal = makeTexture(device, bumps, false);
}

function brickMaterial(device: pc.GraphicsDevice, hex: string): pc.StandardMaterial {
  const hit = materials.get(hex);
  if (hit) return hit;
  if (!albedo || !normal) buildTextures(device);
  const m = new pc.StandardMaterial();
  // The colour multiplies the white-and-grey texture, which is what keeps each
  // district's palette.
  m.diffuse = hexColor(hex);
  m.diffuseMap = albedo;
  m.normalMap = normal;
  m.bumpiness = 0.8;
  m.useLighting = true;
  m.useSkybox = false;
  m.useMetalness = true;
  m.metalness = 0;
  m.gloss = 0.12;
  m.update();
  materials.set(hex, m);
  return m;
}

/**
 * A box mesh, centred on the origin, with wall UVs in metres.
 *
 * The four walls tile the brick texture by their real width and height. The
 * roof and floor are pinned to a small patch inside a single brick, so they
 * read as plain brick colour rather than a brick pattern laid flat - which
 * looks wrong from the overhead camera. The patch is small but not zero, so
 * tangents can still be computed.
 */
function brickBoxMesh(device: pc.GraphicsDevice, w: number, h: number, d: number): pc.Mesh {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const t = TILE_METRES;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const face = (verts: number[][], n: number[], uv: number[][]) => {
    const base = positions.length / 3;
    verts.forEach((v, i) => {
      positions.push(v[0], v[1], v[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[i][0], uv[i][1]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // Walls: u runs left-to-right as seen from outside, v runs up, both in metres.
  const wall = (span: number): number[][] => [
    [0, 0],
    [span / t, 0],
    [span / t, h / t],
    [0, h / t],
  ];
  face([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [0, 0, 1], wall(w));
  face([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 0, -1], wall(w));
  face([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [1, 0, 0], wall(d));
  face([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [-1, 0, 0], wall(d));

  // Inside one brick of every course: clear of the vertical joints whichever
  // way the texture is flipped.
  const flat: number[][] = [
    [0.34, 0.1],
    [0.41, 0.1],
    [0.41, 0.15],
    [0.34, 0.15],
  ];
  face([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 1, 0], flat);
  face([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0], flat);

  const geometry = new pc.Geometry();
  geometry.positions = positions;
  geometry.normals = normals;
  geometry.uvs = uvs;
  geometry.indices = indices;
  geometry.calculateTangents();
  return pc.Mesh.fromGeometry(device, geometry);
}

/**
 * A solid brick building block, the same footprint and position as `box()`.
 * Falls back to nothing if there is no graphics device - the caller decides.
 */
export function brickBox(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  name: string,
  pos: [number, number, number],
  size: [number, number, number],
  hex: string,
): pc.Entity {
  const e = new pc.Entity(name);
  e.addComponent("render", { type: "asset" });
  const mesh = brickBoxMesh(device, size[0], size[1], size[2]);
  e.render!.meshInstances = [new pc.MeshInstance(mesh, brickMaterial(device, hex))];
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  parent.addChild(e);
  return e;
}

/** Textures and materials belong to one graphics device; drop them with it. */
export function disposeBricks() {
  albedo?.destroy();
  normal?.destroy();
  albedo = null;
  normal = null;
  for (const m of materials.values()) m.destroy();
  materials.clear();
}
