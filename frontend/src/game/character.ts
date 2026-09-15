import * as pc from "playcanvas";
import type { AccessoryId, BodyType, GunId, HeadwearId, OutfitId, ShoeId } from "@the-block/shared";
import { box } from "./pcApp";

export type Appearance = {
  bodyType: BodyType;
  skinTone: string;
  outfit: OutfitId;
  pantsColor?: string;
  shoe?: ShoeId;
  shoeColor?: string;
  headwear: HeadwearId;
  accessories?: AccessoryId[];
  gun?: GunId | null;
};

const OUTFIT_COLORS: Record<OutfitId, { top: string; bottom: string; accent: string }> = {
  "hi-vis": { top: "#2B6CB0", bottom: "#3A3A3A", accent: "#FFD60A" },
  hoodie: { top: "#5B21B6", bottom: "#1F2937", accent: "#F97316" },
  suit: { top: "#1A1A1A", bottom: "#111111", accent: "#C41E3A" },
  neon: { top: "#0F766E", bottom: "#111827", accent: "#39FF14" },
  gold: { top: "#D4AF37", bottom: "#3F3F46", accent: "#FFF3B0" },
  puffer: { top: "#1E3A5F", bottom: "#1F2937", accent: "#F59E0B" },
  jersey: { top: "#B91C1C", bottom: "#111111", accent: "#FFFFFF" },
  "trench-coat": { top: "#3F2A14", bottom: "#1C1917", accent: "#A16207" },
  overalls: { top: "#1E3A8A", bottom: "#1E3A8A", accent: "#FBBF24" },
};

const WIDTH: Record<BodyType, number> = {
  slim: 0.72,
  regular: 0.9,
  broad: 1.12,
};

export function createCitizen(parent: pc.Entity, appearance: Appearance, name = "citizen"): pc.Entity {
  const root = new pc.Entity(name);
  parent.addChild(root);

  const w = WIDTH[appearance.bodyType];
  const colors = OUTFIT_COLORS[appearance.outfit] ?? OUTFIT_COLORS.hoodie;
  const skin = appearance.skinTone;
  const pants = appearance.pantsColor ?? colors.bottom;
  const shoe = appearance.shoe ?? "sneakers";
  const shoeColor = appearance.shoeColor ?? "#111111";

  const legL = addLimb(root, "leg-l", [-0.18, 0.84, 0], [0, -0.42, 0], [w * 0.32, 0.84, 0.38], pants);
  const legR = addLimb(root, "leg-r", [0.18, 0.84, 0], [0, -0.42, 0], [w * 0.32, 0.84, 0.38], pants);
  addShoes(legL, "l", shoe, shoeColor, w);
  addShoes(legR, "r", shoe, shoeColor, w);
  box(root, "torso", [0, 1.12, 0], [w, 0.92, 0.46], colors.top);

  addLimb(root, "arm-l", [-(w / 2 + 0.16), 1.53, 0], [0, -0.41, 0], [0.28, 0.82, 0.28], colors.top);
  const armR = addLimb(root, "arm-r", [w / 2 + 0.16, 1.53, 0], [0, -0.41, 0], [0.28, 0.82, 0.28], colors.top);
  box(root, "head", [0, 1.82, 0], [0.62, 0.62, 0.62], skin);

  /**
   * Everything below is cosmetic: it reads at conversation distance and is
   * invisible across a plaza, but it is most of the geometry — a crown alone is
   * 22 boxes on every wearer. Grouping it under one child at identity transform
   * (so every coordinate below is unchanged) lets the renderer drop all of it
   * with a single `enabled` flag once a citizen is far away. See setCitizenDetail.
   *
   * The silhouette — limbs, shoes, torso, head — stays on the root, along with
   * anything parented to a limb, so animation and the held gun are unaffected.
   */
  const detail = new pc.Entity("detail");
  root.addChild(detail);
  addOutfitDetails(detail, appearance.outfit, w, colors);
  box(detail, "eye-l", [-0.14, 1.86, 0.32], [0.1, 0.1, 0.08], "#111111");
  box(detail, "eye-r", [0.14, 1.86, 0.32], [0.1, 0.1, 0.08], "#111111");
  box(detail, "nose", [0, 1.76, 0.33], [0.05, 0.12, 0.06], "#111111");
  box(detail, "mouth", [0, 1.64, 0.33], [0.22, 0.05, 0.06], "#111111");
  addHeadwear(detail, appearance.headwear);
  addAccessories(detail, armR, appearance.accessories ?? [], w);
  if (appearance.gun) addGun(armR, appearance.gun);
  return root;
}

/**
 * Level of detail for a citizen. Culls the cosmetic group; the silhouette and
 * any held weapon stay, so a distant player still reads as a person and as
 * armed. No-op when the entity is already in the requested state.
 */
export function setCitizenDetail(citizen: pc.Entity, on: boolean) {
  const detail = citizen.findByName("detail");
  if (detail && detail.enabled !== on) detail.enabled = on;
}

function addLimb(
  parent: pc.Entity,
  name: string,
  pivot: [number, number, number],
  mesh: [number, number, number],
  scale: [number, number, number],
  hex: string,
): pc.Entity {
  const joint = new pc.Entity(name);
  joint.setLocalPosition(pivot[0], pivot[1], pivot[2]);
  parent.addChild(joint);
  box(joint, `${name}-mesh`, mesh, scale, hex);
  return joint;
}

/**
 * The leg joint sits at y 0.84 and the leg mesh reaches down to the character's
 * origin, so a sole has to bottom out at -0.84 here to stand on the floor.
 * Previously every shoe hung below that and sank into whatever it stood on.
 */
const SOLE_BOTTOM = -0.84;

function addShoes(leg: pc.Entity, side: "l" | "r", shoe: ShoeId, color: string, w: number) {
  if (shoe === "none") return;
  const sole = color.toLowerCase() === "#f8fafc" ? "#D4D4D8" : "#0A0A0A";
  if (shoe === "sneakers") {
    box(leg, `shoe-${side}`, [0, -0.71, 0.08], [w * 0.36, 0.18, 0.48], color);
    box(leg, `sole-${side}`, [0, SOLE_BOTTOM + 0.03, 0.08], [w * 0.38, 0.06, 0.52], sole);
    return;
  }
  if (shoe === "boots") {
    box(leg, `boot-${side}`, [0, -0.58, 0.04], [w * 0.36, 0.42, 0.42], color);
    box(leg, `sole-${side}`, [0, SOLE_BOTTOM + 0.04, 0.06], [w * 0.38, 0.08, 0.5], sole);
    return;
  }
  if (shoe === "slides") {
    box(leg, `sole-${side}`, [0, SOLE_BOTTOM + 0.06, 0.16], [w * 0.4, 0.12, 0.54], color);
    box(leg, `strap-${side}`, [0, -0.68, 0.18], [w * 0.36, 0.1, 0.26], color);
    return;
  }
  box(leg, `shoe-${side}`, [0, -0.68, 0.14], [w * 0.38, 0.22, 0.56], color);
  box(leg, `toe-${side}`, [0, -0.7, 0.38], [w * 0.3, 0.12, 0.22], color);
  box(leg, `sole-${side}`, [0, SOLE_BOTTOM + 0.04, 0.16], [w * 0.4, 0.08, 0.6], sole);
}

function addOutfitDetails(
  root: pc.Entity,
  outfit: OutfitId,
  w: number,
  colors: { top: string; bottom: string; accent: string },
) {
  if (outfit === "hi-vis") {
    box(root, "stripe", [0, 1.12, 0.24], [w * 0.92, 0.18, 0.04], colors.accent);
  }
  if (outfit === "suit") {
    box(root, "tie", [0, 1.18, 0.25], [0.1, 0.42, 0.04], colors.accent);
  }
  if (outfit === "hoodie") {
    box(root, "hood", [0, 1.52, -0.08], [w * 0.7, 0.22, 0.4], colors.top);
    box(root, "pocket", [0, 0.92, 0.25], [w * 0.55, 0.18, 0.06], colors.accent);
  }
  if (outfit === "neon") {
    box(root, "stripe-n", [0, 1.12, 0.24], [w * 0.92, 0.1, 0.04], colors.accent);
    box(root, "stripe-n2", [0, 0.88, 0.24], [w * 0.92, 0.06, 0.04], colors.accent);
  }
  if (outfit === "gold") {
    box(root, "sash", [0, 1.2, 0.24], [w * 0.22, 0.7, 0.04], colors.accent);
  }
  if (outfit === "puffer") {
    box(root, "puffer", [0, 1.12, 0], [w * 1.12, 1.02, 0.58], colors.top);
    box(root, "quilt-1", [0, 1.32, 0.3], [w * 0.95, 0.06, 0.04], colors.accent);
    box(root, "quilt-2", [0, 1.12, 0.3], [w * 0.95, 0.06, 0.04], colors.accent);
    box(root, "quilt-3", [0, 0.92, 0.3], [w * 0.95, 0.06, 0.04], colors.accent);
  }
  if (outfit === "jersey") {
    box(root, "number", [0, 1.16, 0.25], [0.28, 0.36, 0.04], colors.accent);
    box(root, "hem", [0, 0.72, 0.24], [w * 0.92, 0.08, 0.04], colors.accent);
  }
  if (outfit === "trench-coat") {
    box(root, "coat", [0, 0.88, 0], [w * 1.08, 1.4, 0.52], colors.top);
    box(root, "belt", [0, 0.92, 0.27], [w * 1.0, 0.1, 0.04], colors.accent);
  }
  if (outfit === "overalls") {
    box(root, "bib", [0, 1.28, 0.24], [w * 0.55, 0.38, 0.06], colors.accent);
    box(root, "strap-l", [-w * 0.22, 1.42, 0.22], [0.1, 0.5, 0.06], colors.bottom);
    box(root, "strap-r", [w * 0.22, 1.42, 0.22], [0.1, 0.5, 0.06], colors.bottom);
  }
}

function addAccessories(root: pc.Entity, armR: pc.Entity, ids: AccessoryId[], w: number) {
  if (ids.includes("glasses")) {
    box(root, "glass-l", [-0.14, 1.86, 0.36], [0.16, 0.08, 0.04], "#111111");
    box(root, "glass-r", [0.14, 1.86, 0.36], [0.16, 0.08, 0.04], "#111111");
    box(root, "bridge", [0, 1.86, 0.36], [0.1, 0.03, 0.03], "#111111");
  }
  if (ids.includes("chain")) {
    box(root, "chain-1", [0, 1.42, 0.28], [0.18, 0.08, 0.06], "#FFD700");
    box(root, "chain-2", [0, 1.32, 0.28], [0.12, 0.08, 0.06], "#FFD700");
  }
  if (ids.includes("backpack")) {
    // Torso back face sits at z = -0.23, so the pack hangs off it.
    const body = "#1F2937";
    const trim = "#374151";
    const webbing = "#111111";
    const buckle = "#9CA3AF";

    box(root, "pack", [0, 1.14, -0.38], [w * 0.66, 0.72, 0.32], body);
    // Lid over the top, overhanging slightly, plus a grab handle.
    box(root, "pack-lid", [0, 1.46, -0.39], [w * 0.7, 0.24, 0.36], trim);
    box(root, "pack-handle", [0, 1.61, -0.3], [0.18, 0.07, 0.1], webbing);
    // Front pocket with a zip line across it.
    box(root, "pack-pocket", [0, 0.98, -0.55], [w * 0.44, 0.3, 0.09], trim);
    box(root, "pack-zip", [0, 1.15, -0.55], [w * 0.46, 0.04, 0.1], buckle);
    // Slim side pockets to break up the slab.
    for (const side of [-1, 1]) {
      box(root, `pack-side-${side > 0 ? "r" : "l"}`, [side * w * 0.34, 1.08, -0.38], [0.07, 0.36, 0.2], trim);
    }
    // Straps arc over each shoulder and down the chest, with a clip.
    for (const side of [-1, 1]) {
      const tag = side > 0 ? "r" : "l";
      const x = side * w * 0.28;
      box(root, `pack-strap-top-${tag}`, [x, 1.55, -0.06], [0.09, 0.08, 0.42], webbing);
      box(root, `pack-strap-${tag}`, [x, 1.3, 0.2], [0.09, 0.46, 0.08], webbing);
      box(root, `pack-clip-${tag}`, [x, 1.16, 0.21], [0.11, 0.07, 0.09], buckle);
    }
  }
  if (ids.includes("earbuds")) {
    box(root, "bud-l", [-0.34, 1.84, 0.04], [0.08, 0.08, 0.08], "#111111");
    box(root, "bud-r", [0.34, 1.84, 0.04], [0.08, 0.08, 0.08], "#111111");
  }
  if (ids.includes("watch")) {
    box(armR, "watch", [0.16, -0.62, 0], [0.08, 0.1, 0.16], "#111111");
    box(armR, "watch-face", [0.2, -0.62, 0], [0.04, 0.08, 0.12], "#60A5FA", {
      emissive: "#60A5FA",
      intensity: 1.5,
    });
  }
  if (ids.includes("visor")) {
    box(root, "visor", [0, 1.92, 0.28], [0.62, 0.1, 0.22], "#111111");
    box(root, "visor-lens", [0, 1.92, 0.36], [0.52, 0.06, 0.08], "#39FF14", { emissive: "#39FF14", intensity: 1.4 });
  }
}

function addGun(arm: pc.Entity, id: GunId) {
  if (id === "pipe") {
    box(arm, "gun-pipe", [0, -0.92, 0.28], [0.1, 0.1, 0.7], "#6B7280");
    box(arm, "gun-grip", [0, -0.78, 0.08], [0.12, 0.22, 0.12], "#1F2937");
    return;
  }
  if (id === "pistol") {
    box(arm, "gun-body", [0, -0.86, 0.22], [0.1, 0.14, 0.38], "#111111");
    box(arm, "gun-barrel", [0, -0.84, 0.46], [0.07, 0.08, 0.22], "#374151");
    box(arm, "gun-grip", [0, -0.98, 0.12], [0.1, 0.22, 0.12], "#1F2937");
    return;
  }
  box(arm, "gun-body", [0, -0.84, 0.38], [0.12, 0.14, 0.72], "#1F2937");
  box(arm, "gun-barrel", [0, -0.82, 0.82], [0.08, 0.08, 0.28], "#111111");
  box(arm, "gun-stock", [0, -0.78, -0.08], [0.1, 0.16, 0.28], "#3F2A14");
  box(arm, "gun-mag", [0, -1.02, 0.18], [0.08, 0.22, 0.14], "#111111");
}

function addHeadwear(root: pc.Entity, id: HeadwearId) {
  if (id === "none") {
    box(root, "hair", [0, 2.08, 0], [0.66, 0.16, 0.66], "#2A1A10");
    return;
  }
  if (id === "hardhat") {
    box(root, "hat", [0, 2.18, 0], [0.78, 0.28, 0.78], "#FFD60A");
    box(root, "brim", [0, 2.08, 0.12], [0.86, 0.08, 0.9], "#FFD60A");
    return;
  }
  if (id === "beanie") {
    box(root, "hat", [0, 2.16, 0], [0.72, 0.28, 0.72], "#7C3AED");
    return;
  }
  if (id === "cap") {
    box(root, "hat", [0, 2.14, 0], [0.72, 0.18, 0.72], "#1D4ED8");
    box(root, "bill", [0, 2.08, 0.42], [0.5, 0.06, 0.32], "#1D4ED8");
    return;
  }
  // Crown: a banded circlet with points rising off it and jewels set into the
  // front, rather than a plain ring with a cube balanced on top.
  const gold = "#FFD700";
  const deepGold = "#D4AF37";
  box(root, "crown-rim", [0, 2.13, 0], [0.78, 0.07, 0.78], deepGold);
  box(root, "crown", [0, 2.21, 0], [0.72, 0.2, 0.72], gold);
  box(root, "crown-lip", [0, 2.3, 0], [0.76, 0.05, 0.76], deepGold);

  // Tallest at the front, shortest on the diagonals, so it has a silhouette.
  const points: { x: number; z: number; h: number }[] = [
    { x: 0, z: 0.28, h: 0.22 },
    { x: 0, z: -0.28, h: 0.17 },
    { x: 0.28, z: 0, h: 0.18 },
    { x: -0.28, z: 0, h: 0.18 },
    { x: 0.2, z: 0.2, h: 0.13 },
    { x: -0.2, z: 0.2, h: 0.13 },
    { x: 0.2, z: -0.2, h: 0.13 },
    { x: -0.2, z: -0.2, h: 0.13 },
  ];
  points.forEach((p, i) => {
    box(root, `crown-point-${i}`, [p.x, 2.33 + p.h / 2, p.z], [0.11, p.h, 0.11], gold);
    box(root, `crown-tip-${i}`, [p.x, 2.33 + p.h + 0.04, p.z], [0.07, 0.07, 0.07], "#FFF3C4", {
      emissive: "#FFE7A0",
      intensity: 2,
    });
  });

  // Band front face is at z = 0.36, so the stones sit just proud of it.
  box(root, "crown-jewel", [0, 2.21, 0.37], [0.14, 0.14, 0.06], "#60A5FA", { emissive: "#60A5FA", intensity: 2 });
  box(root, "crown-jewel-l", [-0.2, 2.21, 0.37], [0.09, 0.09, 0.05], "#F87171", { emissive: "#F87171", intensity: 1.6 });
  box(root, "crown-jewel-r", [0.2, 2.21, 0.37], [0.09, 0.09, 0.05], "#34D399", { emissive: "#34D399", intensity: 1.6 });
}
