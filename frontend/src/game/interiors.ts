import * as pc from "playcanvas";
import type { CityTheme } from "@tribe/shared";
import { box, hexColor } from "./pcApp";

export type InteriorKind = "home" | "hospital" | "police" | "townhall" | "store";

export type InteriorLayout = {
  kind: InteriorKind;
  halfW: number;
  halfD: number;
  height: number;
  spawnZ: number;
};

const LAYOUTS: Record<InteriorKind, InteriorLayout> = {
  home: { kind: "home", halfW: 6, halfD: 5, height: 3.6, spawnZ: 3.4 },
  hospital: { kind: "hospital", halfW: 11, halfD: 8, height: 4.4, spawnZ: 6.2 },
  police: { kind: "police", halfW: 9, halfD: 7, height: 4.2, spawnZ: 5.2 },
  townhall: { kind: "townhall", halfW: 16, halfD: 11, height: 8.2, spawnZ: 8.6 },
  store: { kind: "store", halfW: 8, halfD: 6.5, height: 4.2, spawnZ: 4.8 },
};

/**
 * `luxury` is 0-1 and only affects homes: a studio and a penthouse should not be
 * the same room. Everything else has a fixed layout.
 */
export function interiorLayout(kind: InteriorKind, luxury = 0): InteriorLayout {
  const base = LAYOUTS[kind];
  if (kind !== "home") return base;
  const t = Math.max(0, Math.min(1, luxury));
  return {
    ...base,
    halfW: base.halfW + t * 5,
    halfD: base.halfD + t * 4,
    height: base.height + t * 2.8,
    spawnZ: base.spawnZ + t * 3.2,
  };
}

export type SeatSpec = {
  x: number;
  z: number;
  yaw: number;
  top: number;
  /**
   * Lie down rather than sit. The body is laid flat along `yaw`, head first, so
   * the yaw of a bed points at its pillow rather than at where a sitter looks.
   */
  lie?: boolean;
};

/**
 * Raised surfaces inside a building that can be stood on.
 *
 * Interior geometry is decoration - nothing in it collides - so a dais was
 * something you walked through rather than up onto. These are the exceptions,
 * in coordinates local to the interior, and the engine raises the floor to the
 * highest one you are standing over.
 */
export type PlatformSpec = { x: number; z: number; halfW: number; halfD: number; top: number };

export function interiorPlatforms(kind: InteriorKind): PlatformSpec[] {
  if (kind === "townhall") {
    // The speaker's dais: box("dais", [0, 0.28, -7.6], [10, 0.5, 5.2]).
    // Centre y plus half its height is the surface you stand on.
    return [{ x: 0, z: -7.6, halfW: 5, halfD: 2.6, top: 0.28 + 0.25 }];
  }
  return [];
}

/**
 * Solid things inside a building, in local coordinates.
 *
 * Interior props are decoration by default. These are the ones tall enough that
 * walking through them looks wrong - a desk you can stand inside is worse than
 * no desk at all.
 */
export function interiorObstacles(
  kind: InteriorKind,
  layout = interiorLayout(kind),
): PlatformSpec[] {
  if (kind === "townhall") {
    // box("desk", [0, 1.15, -6.6], [5.4, 1.3, 1.6]).
    return [{ x: 0, z: -6.6, halfW: 2.7, halfD: 0.8, top: 1.8 }];
  }
  if (kind === "home") {
    // The three big pieces, each matching its box in buildHome. Half-extents
    // are half the size passed there. Only these three: the rug and the coffee
    // table are low enough to read as floor, and the smaller props would turn
    // a studio into an obstacle course you cannot cross.
    const w = layout.halfW;
    return [
      // box("bed", [-(w - 1.9), .., -2.4], [2.4, .., 3.2])
      { x: -(w - 1.9), z: -2.4, halfW: 1.2, halfD: 1.6, top: 0.79 },
      // box("sofa", [0, .., 1.6], [3.4, .., 1.1]) - deepened to take in the
      // sofa-back behind it, which would otherwise be a thin wall of its own.
      { x: 0, z: 1.75, halfW: 1.7, halfD: 0.7, top: 1.0 },
      // box("counter", [w - 1.8, .., -0.4], [2.2, .., 3.6])
      { x: w - 1.8, z: -0.4, halfW: 1.1, halfD: 1.8, top: 1.3 },
    ];
  }
  return [];
}

/**
 * `layout` matters for homes only, where the bed is anchored to the side wall
 * and therefore moves as the room grows with the owner's grade. Passing the
 * same layout the geometry was built from is what keeps the lying spot on the
 * mattress instead of beside a penthouse's bed.
 */
export function interiorSeats(kind: InteriorKind, layout = interiorLayout(kind)): SeatSpec[] {
  if (kind === "townhall") {
    const seats: SeatSpec[] = [];
    for (let row = 0; row < 3; row++) {
      const z = -1.2 + row * 2.4;
      for (const side of [-1, 1]) {
        for (const slot of [-1.5, 0, 1.5]) {
          seats.push({ x: side * 5.4 + slot, z: z + 0.16, yaw: Math.PI, top: 0.77 });
        }
      }
    }
    return seats;
  }
  if (kind === "home") {
    // Kept in step with buildHome: the bed sits at x = -(halfW - 1.9), its
    // mattress top at 0.79, with the pillow at the -z end. The lying spot is
    // the foot of the bed, since the body is laid out from its feet towards
    // the head - so yaw faces -z, at the pillow.
    const bedX = -(layout.halfW - 1.9);
    return [
      { x: -0.9, z: -1.72, yaw: 0, top: 1.0 },
      { x: 0.9, z: -1.72, yaw: 0, top: 1.0 },
      { x: bedX, z: -1.9, yaw: Math.PI, top: 0.79, lie: true },
    ];
  }
  if (kind === "hospital") {
    return Array.from({ length: 4 }, (_, i) => ({
      x: -7.2 + i * 1.7,
      z: 5.72,
      yaw: Math.PI,
      top: 0.77,
    }));
  }
  if (kind === "store") return [];
  return [
    { x: 1.3, z: 4.62, yaw: Math.PI, top: 0.49 },
    { x: 3.1, z: 4.62, yaw: Math.PI, top: 0.49 },
    { x: -6.2, z: 0.68, yaw: 0, top: 0.625 },
  ];
}

export function fillInterior(
  root: pc.Entity,
  kind: InteriorKind,
  theme: CityTheme,
  luxury = 0,
  grade = 0,
): InteriorLayout {
  const layout = interiorLayout(kind, luxury);
  if (kind === "home") buildHome(root, layout, theme, grade);
  else if (kind === "hospital") buildHospital(root, layout);
  else if (kind === "police") buildPolice(root, layout);
  else if (kind === "store") buildStore(root, layout, theme);
  else buildTownhall(root, layout, theme);
  return layout;
}

function shell(
  root: pc.Entity,
  layout: InteriorLayout,
  floor: string,
  wall: string,
  ceiling: string,
  trim?: string,
) {
  const w = layout.halfW * 2;
  const d = layout.halfD * 2;
  const h = layout.height;
  box(root, "floor", [0, 0, 0], [w, 0.16, d], floor);
  box(root, "ceil", [0, h, 0], [w, 0.16, d], ceiling);
  box(root, "wall-n", [0, h / 2, -layout.halfD], [w, h, 0.26], wall);
  box(root, "wall-s", [0, h / 2, layout.halfD], [w, h, 0.26], wall);
  box(root, "wall-e", [layout.halfW, h / 2, 0], [0.26, h, d], wall);
  box(root, "wall-w", [-layout.halfW, h / 2, 0], [0.26, h, d], wall);
  // Stand the door clearly proud of the wall. At the old 0.04 of clearance the
  // two faces were close enough to fight for the depth buffer, which is the
  // flicker across the lower half of every doorway.
  const doorW = 1.6;
  box(root, "door", [0, 1.15, layout.halfD - 0.24], [doorW, 2.3, 0.12], "#1A1A1A");
  if (trim) {
    box(root, "base-n", [0, 0.18, -layout.halfD + 0.14], [w - 0.2, 0.28, 0.08], trim);
    // Broken either side of the doorway rather than run through it - skirting
    // does not cross a door, and this one intersected it.
    const side = (w - 0.2 - doorW) / 2;
    const offset = doorW / 2 + side / 2;
    box(root, "base-s-l", [-offset, 0.18, layout.halfD - 0.14], [side, 0.28, 0.08], trim);
    box(root, "base-s-r", [offset, 0.18, layout.halfD - 0.14], [side, 0.28, 0.08], trim);
    box(root, "base-e", [layout.halfW - 0.14, 0.18, 0], [0.08, 0.28, d - 0.2], trim);
    box(root, "base-w", [-layout.halfW + 0.14, 0.18, 0], [0.08, 0.28, d - 0.2], trim);
  }
}

function omni(root: pc.Entity, name: string, pos: [number, number, number], color: string, intensity: number, range: number) {
  const e = new pc.Entity(name);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  e.addComponent("light", {
    type: "omni",
    color: hexColor(color),
    intensity,
    range,
  });
  root.addChild(e);
}

function windowPane(root: pc.Entity, name: string, pos: [number, number, number], size: [number, number, number]) {
  box(root, name, pos, size, "#C9E7F5", { emissive: "#E8F6FF", intensity: 1.6 });
}

/**
 * A home's interior, scaled by what it cost.
 *
 * Big pieces are anchored to the walls rather than placed at fixed coordinates,
 * so a larger room puts the bed and kitchen against its own walls instead of
 * leaving them stranded in the middle. `grade` 0-3 then adds furnishings: a
 * studio gets the basics, a penthouse gets the lot.
 */
function buildHome(root: pc.Entity, layout: InteriorLayout, theme: CityTheme, grade: number) {
  const w = layout.halfW;
  const d = layout.halfD;
  // Warmer materials as the price climbs.
  const floor = grade >= 3 ? "#5A4632" : grade >= 2 ? "#6B5038" : "#7A5A3A";
  const trim = grade >= 2 ? "#E8DCC8" : "#D9C7A8";
  shell(root, layout, floor, "#EFE6D6", "#F7F1E6", trim);
  omni(root, "lamp", [0, layout.height - 0.8, 0], "#FFE6B8", 1.35 + grade * 0.25, 14 + grade * 5);

  // The living area faces the far wall. You enter at +z, so a TV on that wall
  // was the thing you walked into, with the sofa turned away from the room to
  // watch it. Offsetting it sideways instead puts it inside the bed in a small
  // home, so it moves across the room rather than along the wall.
  const lx = 0;

  box(root, "rug", [lx, 0.1, 0.2], [4.2 + grade, 0.06, 3.2 + grade * 0.6], grade >= 2 ? "#5B2333" : "#7A2E2E");
  // Turned to face the far wall, since that is where the TV is now.
  box(root, "sofa", [lx, 0.55, 1.6], [3.4, 0.9, 1.1], "#3E5A4C");
  box(root, "sofa-back", [lx, 0.95, 2.05], [3.4, 0.7, 0.28], "#345043");
  box(root, "table", [lx, 0.32, 0.2], [1.6, 0.42, 0.9], "#5C3B22");

  // Wall-anchored, so they stay against the wall as the room grows.
  box(root, "tv-stand", [lx, 0.38, -d + 1.4], [2.4 + grade * 0.4, 0.55, 0.55], "#2A2118");
  box(root, "tv", [lx, 1.15, -d + 1.28], [1.8 + grade * 0.5, 0.95, 0.12], "#111", { emissive: "#3A6EA5", intensity: 2.2 });

  box(root, "bed", [-(w - 1.9), 0.38, -2.4], [2.4, 0.5, 3.2], "#8B1E3F");
  box(root, "mattress", [-(w - 1.9), 0.68, -2.4], [2.2, 0.22, 3], "#F3E7D3");
  box(root, "pillow", [-(w - 1.9), 0.86, -3.5], [1.4, 0.22, 0.7], "#F8F4EC");
  box(root, "night", [-(w - 3.3), 0.4, -3.6], [0.7, 0.7, 0.7], "#5C3B22");
  box(root, "night-lamp", [-(w - 3.3), 0.9, -3.6], [0.22, 0.35, 0.22], "#FFE7A0", { emissive: "#FFE7A0", intensity: 3 });

  box(root, "counter", [w - 1.8, 0.7, -0.4], [2.2, 1.2, 3.6], trim);
  box(root, "sink", [w - 1.8, 1.34, -0.2], [1.1, 0.12, 0.7], "#C5D0D8");
  box(root, "fridge", [w - 1.65, 1.2, 2.2], [1.3, 2.2, 1.1], "#E8EEF2");
  box(root, "fridge-handle", [w - 2.32, 1.2, 2.2], [0.08, 0.7, 0.08], "#888");
  box(root, "cabinets", [w - 1.8, 2.55, -0.6], [2.1, 0.7, 2.8], grade >= 2 ? "#C9A227" : "#C4A574");

  windowPane(root, "win-e", [w - 0.12, 1.7, -1.4], [0.08, 1.4, 2.2]);
  windowPane(root, "win-w", [-w + 0.12, 1.7, 1.1], [0.08, 1.4, 2.2]);
  box(root, "plant-pot", [w - 1.6, 0.28, d - 1.2], [0.45, 0.4, 0.45], "#6B3F24");
  box(root, "plant", [w - 1.6, 0.85, d - 1.2], [0.7, 0.8, 0.7], "#2F9E44");
  // Offset to the other side of the far wall, clear of the TV.
  box(root, "accent-art", [2.8, 2.2, -d + 0.14], [1.6, 1.1, 0.08], theme.accent, {
    emissive: theme.accent,
    intensity: 0.8,
  });

  // A flat: a proper dining set and more light.
  if (grade >= 1) {
    box(root, "dine-table", [-(w - 2.2), 0.72, d - 2.6], [2.2, 0.16, 1.4], "#6B4F32");
    for (const side of [-1, 1]) {
      box(root, `dine-leg-${side}`, [-(w - 2.2) + side * 0.9, 0.36, d - 2.6], [0.16, 0.72, 0.16], "#4A3524");
      box(root, `dine-chair-${side}`, [-(w - 2.2) + side * 1.5, 0.45, d - 2.6], [0.6, 0.9, 0.6], "#5C3B22");
    }
    box(root, "shelf", [-w + 0.3, 1.6, 2.4], [0.4, 2.4, 2.6], "#5C3B22");
    // Beside the TV rather than behind it.
    windowPane(root, "win-n", [2.8, 1.9, -d + 0.12], [2.6, 1.8, 0.08]);
  }

  // A house: a hearth, a rug runner, better lighting.
  if (grade >= 2) {
    box(root, "hearth", [-(w - 0.5), 1.1, 2.6], [0.8, 2.2, 3.2], "#6E6A66");
    box(root, "fire", [-(w - 0.9), 0.7, 2.6], [0.14, 0.9, 1.8], "#FF7A2F", { emissive: "#FF7A2F", intensity: 3.2 });
    omni(root, "lamp-2", [w - 2.4, layout.height - 1.2, d - 2.4], "#FFE6B8", 1.1, 11);
    box(root, "chandelier", [0, layout.height - 0.55, 0], [1.8, 0.28, 1.8], "#E8DCC8", {
      emissive: "#FFE7A0",
      intensity: 2.4,
    });
  }

  // A penthouse: a glass wall, a bar, gold everywhere.
  if (grade >= 3) {
    windowPane(root, "win-wall", [0, layout.height / 2, d - 0.12], [w * 1.6, layout.height - 1.2, 0.08]);
    box(root, "bar", [w - 2.2, 0.6, -d + 2.2], [3.2, 1.2, 1.1], "#3A2A1C");
    box(root, "bar-top", [w - 2.2, 1.24, -d + 2.2], [3.4, 0.12, 1.3], "#C9A227");
    for (const i of [-1, 0, 1]) {
      box(root, `stool-${i}`, [w - 2.2 + i * 1.0, 0.5, -d + 3.6], [0.4, 1, 0.4], "#5C3B22");
    }
    box(root, "art-gold", [-2.6, 2.4, -d + 0.14], [1.2, 1.6, 0.08], "#C9A227", {
      emissive: "#C9A227",
      intensity: 1.2,
    });
    box(root, "art-gold-2", [2.6, 2.4, -d + 0.14], [1.2, 1.6, 0.08], "#C9A227", {
      emissive: "#C9A227",
      intensity: 1.2,
    });
  }
}

function buildHospital(root: pc.Entity, layout: InteriorLayout) {
  shell(root, layout, "#E4E9EE", "#F7FBFC", "#EEF3F7", "#9FD0C8");
  box(root, "wainscot-n", [0, 0.7, -layout.halfD + 0.14], [layout.halfW * 2 - 0.3, 1.2, 0.06], "#D5EEF0");
  box(root, "wainscot-s", [0, 0.7, layout.halfD - 0.14], [layout.halfW * 2 - 0.3, 1.2, 0.06], "#D5EEF0");
  omni(root, "lamp", [0, 3.5, 0], "#F2F7FF", 1.5, 22);

  for (const x of [-6, 0, 6]) {
    box(root, `fluoro-${x}`, [x, layout.height - 0.22, 0], [4.4, 0.1, 0.45], "#F8FBFF", {
      emissive: "#F4FAFF",
      intensity: 3.4,
    });
  }

  box(root, "desk", [0, 0.75, -5.4], [5.2, 1.3, 1.6], "#DEE7EC");
  box(root, "desk-top", [0, 1.42, -5.4], [5.4, 0.12, 1.8], "#C5D4DC");
  box(root, "monitor", [0.8, 1.85, -5.6], [0.9, 0.7, 0.12], "#111", { emissive: "#7EC8E3", intensity: 1.8 });
  box(root, "cross-h", [0, 2.8, -layout.halfD + 0.16], [1.8, 0.35, 0.08], "#E11D48", { emissive: "#FF4D6D", intensity: 3 });
  box(root, "cross-v", [0, 2.8, -layout.halfD + 0.16], [0.35, 1.8, 0.08], "#E11D48", { emissive: "#FF4D6D", intensity: 3 });

  for (let i = 0; i < 4; i++) {
    const x = -7.2 + i * 1.7;
    box(root, `wait-${i}`, [x, 0.42, 5.6], [1.3, 0.7, 1.1], "#6BA8B8");
    box(root, `wait-b-${i}`, [x, 0.85, 6.05], [1.3, 0.45, 0.22], "#5A97A8");
  }

  for (let i = 0; i < 3; i++) {
    const z = -1.6 + i * 3.2;
    box(root, `bed-${i}`, [7.2, 0.55, z], [2.6, 0.7, 1.5], "#C5D0D8");
    box(root, `mat-${i}`, [7.2, 0.95, z], [2.4, 0.18, 1.3], "#F8FBFF");
    box(root, `screen-${i}`, [5.4, 1.4, z], [0.08, 2.6, 2.2], "#E8F4F6");
    box(root, `iv-${i}`, [8.5, 1.4, z - 0.7], [0.08, 2.6, 0.08], "#9AA4AE");
  }

  box(root, "cart", [-8.4, 0.7, -2], [1.4, 1.2, 0.9], "#F0F4F7");
  box(root, "cart-top", [-8.4, 1.34, -2], [1.5, 0.08, 1], "#E11D48");
  windowPane(root, "win-e1", [layout.halfW - 0.12, 2.1, -3], [0.08, 1.6, 3.2]);
  windowPane(root, "win-e2", [layout.halfW - 0.12, 2.1, 3], [0.08, 1.6, 3.2]);
  box(root, "runner", [0, 0.09, 1.4], [2.2, 0.04, 10], "#B8D4D8");
}

function buildPolice(root: pc.Entity, layout: InteriorLayout) {
  shell(root, layout, "#2A3140", "#1B2E4A", "#121826", "#FBBF24");
  omni(root, "lamp", [0, 3.3, 0], "#C9D4E8", 1.25, 18);
  box(root, "stripe-n", [0, 1.5, -layout.halfD + 0.14], [layout.halfW * 2 - 0.4, 0.22, 0.06], "#F8FAFC");
  box(root, "stripe-s", [0, 1.5, layout.halfD - 0.14], [layout.halfW * 2 - 0.4, 0.22, 0.06], "#F8FAFC");

  box(root, "desk", [0, 0.85, -4.2], [6.2, 1.5, 1.8], "#24344C");
  box(root, "desk-top", [0, 1.62, -4.2], [6.4, 0.12, 2], "#1A2738");
  box(root, "glass", [0, 2.15, -3.4], [5.6, 1.0, 0.08], "#9EC4D8", { emissive: "#B9D7E6", intensity: 0.5 });
  box(root, "badge", [0, 2.7, -layout.halfD + 0.16], [1.1, 1.1, 0.08], "#FBBF24", { emissive: "#FBBF24", intensity: 2 });

  box(root, "light-r", [-1.4, layout.height - 0.28, 0], [1.4, 0.14, 0.4], "#EF4444", { emissive: "#EF4444", intensity: 5 });
  box(root, "light-b", [1.4, layout.height - 0.28, 0], [1.4, 0.14, 0.4], "#3B82F6", { emissive: "#3B82F6", intensity: 5 });

  const cellX = -6.2;
  const cellZ = 2.4;
  box(root, "cell-floor", [cellX, 0.1, cellZ], [4.2, 0.08, 5.4], "#1A1F2A");
  box(root, "cell-back", [cellX, 1.5, cellZ - 2.6], [4.2, 2.8, 0.16], "#111827");
  box(root, "cell-bench", [cellX, 0.4, cellZ - 1.6], [3.2, 0.45, 0.7], "#374151");
  for (let i = 0; i < 7; i++) {
    box(root, `bar-${i}`, [cellX - 1.8 + i * 0.6, 1.4, cellZ + 2.6], [0.08, 2.6, 0.08], "#9CA3AF");
  }

  box(root, "lockers", [6.6, 1.2, -1.2], [1.8, 2.2, 4.4], "#111827");
  box(root, "locker-line", [5.72, 1.2, -1.2], [0.06, 2.0, 4.2], "#FBBF24");
  box(root, "board", [6.6, 2.4, 4.4], [2.2, 1.6, 0.1], "#111");
  box(root, "board-1", [6.1, 2.55, 4.48], [0.7, 0.9, 0.04], "#7F1D1D");
  box(root, "board-2", [7.0, 2.35, 4.48], [0.7, 0.9, 0.04], "#1E3A8A");
  box(root, "table", [2.2, 0.55, 3.4], [2.8, 0.7, 1.6], "#1F2937");
  for (const x of [1.3, 3.1]) {
    box(root, `chair-leg-l-${x}`, [x - 0.26, 0.18, 4.5], [0.08, 0.36, 0.08], "#0B1220");
    box(root, `chair-leg-r-${x}`, [x + 0.26, 0.18, 4.5], [0.08, 0.36, 0.08], "#0B1220");
    box(root, `chair-seat-${x}`, [x, 0.42, 4.5], [0.74, 0.14, 0.72], "#111827");
    box(root, `chair-back-${x}`, [x, 0.86, 4.82], [0.74, 0.76, 0.12], "#111827");
  }
}

function buildTownhall(root: pc.Entity, layout: InteriorLayout, theme: CityTheme) {
  shell(root, layout, "#E8DCC4", "#C4B49A", "#F3EAD6", "#B7A48A");
  omni(root, "lamp", [0, 6.2, 0], "#FFE7A0", 1.7, 32);

  box(root, "runner", [0, 0.09, 1], [4.4, 0.05, layout.halfD * 2 - 2], "#7A2E2E");
  box(root, "gold-n", [0, 0.12, -layout.halfD + 0.4], [layout.halfW * 2 - 1.2, 0.08, 0.35], "#C9A227");
  box(root, "gold-s", [0, 0.12, layout.halfD - 0.4], [layout.halfW * 2 - 1.2, 0.08, 0.35], "#C9A227");

  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const z = i * 2.6;
    box(root, `col-w-${i}`, [-11.5, 3.6, z], [0.7, 7.2, 0.7], "#E8DCC8");
    box(root, `col-e-${i}`, [11.5, 3.6, z], [0.7, 7.2, 0.7], "#E8DCC8");
    box(root, `cap-w-${i}`, [-11.5, 7.3, z], [1.1, 0.35, 1.1], "#C9A227");
    box(root, `cap-e-${i}`, [11.5, 7.3, z], [1.1, 0.35, 1.1], "#C9A227");
  }

  box(root, "dais", [0, 0.28, -7.6], [10, 0.5, 5.2], "#B7A48A");
  // Desk near the front of the dais, with the chair gone: the speaker stands
  // behind it to address the room, so the space behind matters more than a seat.
  box(root, "desk", [0, 1.15, -6.6], [5.4, 1.3, 1.6], "#6B4F32");
  box(root, "desk-gold", [0, 1.82, -6.6], [5.6, 0.1, 1.7], "#C9A227");
  box(root, "seal", [0, 4.6, -layout.halfD + 0.16], [2.4, 2.4, 0.1], theme.accent, {
    emissive: theme.accent,
    intensity: 1.4,
  });
  box(root, "pediment", [0, 7.1, -layout.halfD + 0.2], [12, 1.4, 0.4], "#B7A48A");

  for (let row = 0; row < 3; row++) {
    const z = -1.2 + row * 2.4;
    for (const side of [-1, 1]) {
      box(root, `bench-${row}-${side}`, [side * 5.4, 0.42, z], [4.6, 0.7, 1.1], "#5C3B22");
      box(root, `bench-b-${row}-${side}`, [side * 5.4, 0.85, z + 0.42], [4.6, 0.45, 0.22], "#4A2F1C");
    }
  }

  box(root, "chandelier", [0, 7.15, 0], [2.2, 0.25, 2.2], "#C9A227", { emissive: "#FFE7A0", intensity: 4 });
  box(root, "chand-drop", [0, 6.5, 0], [0.16, 1.1, 0.16], "#C9A227");
  for (const [x, z] of [
    [-0.7, 0],
    [0.7, 0],
    [0, -0.7],
    [0, 0.7],
  ] as const) {
    box(root, `chand-${x}-${z}`, [x, 6.95, z], [0.35, 0.35, 0.35], "#FFF3C4", { emissive: "#FFE7A0", intensity: 5 });
  }

  box(root, "banner-w", [-15.7, 4.4, -2], [0.08, 3.6, 1.6], theme.accent);
  box(root, "banner-e", [15.7, 4.4, -2], [0.08, 3.6, 1.6], theme.accent);
  windowPane(root, "win-w1", [-layout.halfW + 0.12, 3.4, -5], [0.08, 2.8, 2.6]);
  windowPane(root, "win-w2", [-layout.halfW + 0.12, 3.4, 4], [0.08, 2.8, 2.6]);
  windowPane(root, "win-e1", [layout.halfW - 0.12, 3.4, -5], [0.08, 2.8, 2.6]);
  windowPane(root, "win-e2", [layout.halfW - 0.12, 3.4, 4], [0.08, 2.8, 2.6]);
}

function buildStore(root: pc.Entity, layout: InteriorLayout, theme: CityTheme) {
  shell(root, layout, "#2A241C", "#1A1612", "#12100E", theme.accent);
  omni(root, "lamp", [0, 3.4, 0], "#FFE6B8", 1.4, 16);

  box(root, "runner", [0, 0.1, 0.4], [3.2, 0.04, 8.4], theme.accent);
  box(root, "counter", [0, 0.7, -4.4], [6.4, 1.2, 1.4], "#3F2A14");
  box(root, "counter-top", [0, 1.32, -4.4], [6.6, 0.1, 1.55], "#C9A227");
  box(root, "register", [-1.6, 1.55, -4.35], [0.7, 0.4, 0.55], "#111");
  box(root, "register-glow", [-1.6, 1.62, -4.1], [0.45, 0.08, 0.08], theme.accent, {
    emissive: theme.accent,
    intensity: 3,
  });
  box(root, "sign", [0, 2.7, -layout.halfD + 0.16], [4.4, 0.8, 0.08], theme.accent, {
    emissive: theme.accent,
    intensity: 2.2,
  });

  const goods = [
    ["#6B7280", "#9CA3AF"],
    ["#7F1D1D", "#F59E0B"],
    ["#1E3A8A", "#60A5FA"],
    ["#14532D", "#4ADE80"],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const slot = i % 2;
    const x = side * 6.65;
    const z = 2.1 - slot * 3.25;
    const faceX = x - side * 0.58;
    box(root, `shelf-${i}`, [x, 0.92, z], [1.05, 1.65, 2.35], "#2A2118");
    box(root, `shelf-trim-${i}`, [faceX, 0.92, z], [0.1, 1.5, 2.15], "#8B5A2B");
    box(root, `good-a-${i}`, [faceX - side * 0.08, 1.28, z - 0.55], [0.42, 0.55, 0.55], goods[i][0]);
    box(root, `good-b-${i}`, [faceX - side * 0.08, 0.62, z + 0.52], [0.42, 0.38, 0.5], goods[i][1]);
  }

  // Clothing wall: recognizable tops displayed above and behind the checkout.
  box(root, "clothing-rail", [0, 3.05, -6.24], [12.2, 0.1, 0.12], "#9CA3AF", { gloss: 0.7 });
  addStoreTop(root, "hoodie", -5.1, "#5B21B6", "#F97316");
  addStoreTop(root, "jersey", -2.9, "#B91C1C", "#F8FAFC");
  addStoreTop(root, "puffer", 2.9, "#1E3A5F", "#F59E0B");
  addStoreTop(root, "hi-vis", 5.1, "#2B6CB0", "#FFD60A");

  // Catalog gear shown on the inward-facing sides of the shelving bays.
  addStoreBackpack(root, -5.96, 2.1);
  addStoreVisor(root, 5.96, 2.1, theme.accent);
  addStoreGlasses(root, 5.96, -1.15);
  addStoreWatch(root, 2.05, -3.62, theme.accent);

  box(root, "crate-l", [-5.8, 0.45, -1.2], [1.2, 0.7, 1.2], "#8B5A2B");
  box(root, "crate-r", [5.8, 0.45, -1.2], [1.2, 0.7, 1.2], "#8B5A2B");
  box(root, "neon-bar", [0, 3.85, 0], [8.8, 0.08, 0.12], theme.accent, {
    emissive: theme.accent,
    intensity: 4,
  });
  windowPane(root, "win-e", [layout.halfW - 0.12, 1.9, 0], [0.08, 1.6, 4.2]);
  windowPane(root, "win-w", [-layout.halfW + 0.12, 1.9, 0], [0.08, 1.6, 4.2]);
}

function addStoreTop(root: pc.Entity, name: string, x: number, color: string, accent: string) {
  const hanger = box(root, `${name}-hanger`, [x, 2.85, -6.14], [1.35, 0.06, 0.08], "#BFC5CC", { gloss: 0.75 });
  hanger.setLocalEulerAngles(0, 0, 0);
  box(root, `${name}-body`, [x, 2.23, -6.08], [1.16, 1.12, 0.18], color);
  const left = box(root, `${name}-sleeve-l`, [x - 0.72, 2.48, -6.08], [0.46, 0.82, 0.18], color);
  const right = box(root, `${name}-sleeve-r`, [x + 0.72, 2.48, -6.08], [0.46, 0.82, 0.18], color);
  left.setLocalEulerAngles(0, 0, -28);
  right.setLocalEulerAngles(0, 0, 28);
  box(root, `${name}-detail`, [x, 2.28, -5.97], [0.76, 0.16, 0.05], accent, {
    emissive: accent,
    intensity: 0.7,
  });
}

function addStoreBackpack(root: pc.Entity, x: number, z: number) {
  box(root, "display-backpack", [x, 1.14, z], [0.34, 1.15, 0.92], "#1F2937");
  box(root, "display-backpack-pocket", [x + 0.2, 0.93, z], [0.16, 0.48, 0.66], "#374151");
  box(root, "display-backpack-zip", [x + 0.29, 1.27, z], [0.04, 0.06, 0.58], "#F59E0B", { gloss: 0.65 });
  box(root, "display-backpack-strap-a", [x + 0.2, 1.51, z - 0.31], [0.12, 0.42, 0.12], "#111827");
  box(root, "display-backpack-strap-b", [x + 0.2, 1.51, z + 0.31], [0.12, 0.42, 0.12], "#111827");
}

function addStoreVisor(root: pc.Entity, x: number, z: number, accent: string) {
  box(root, "display-visor-band", [x, 1.38, z], [0.3, 0.18, 1.22], "#111827");
  box(root, "display-visor-lens", [x - 0.18, 1.38, z], [0.12, 0.32, 0.98], accent, {
    emissive: accent,
    intensity: 2.4,
  });
  box(root, "display-visor-stand", [x, 0.76, z], [0.14, 0.92, 0.14], "#9CA3AF", { gloss: 0.7 });
}

function addStoreGlasses(root: pc.Entity, x: number, z: number) {
  box(root, "display-glasses-l", [x - 0.16, 1.3, z - 0.27], [0.1, 0.34, 0.42], "#111111", { gloss: 0.8 });
  box(root, "display-glasses-r", [x - 0.16, 1.3, z + 0.27], [0.1, 0.34, 0.42], "#111111", { gloss: 0.8 });
  box(root, "display-glasses-bridge", [x - 0.17, 1.3, z], [0.1, 0.06, 0.18], "#D4AF37", { gloss: 0.85 });
  box(root, "display-glasses-stand", [x, 0.72, z], [0.14, 0.82, 0.14], "#9CA3AF", { gloss: 0.7 });
}

function addStoreWatch(root: pc.Entity, x: number, z: number, accent: string) {
  box(root, "watch-plinth", [x, 1.5, z], [1.15, 0.18, 0.82], "#111111", { gloss: 0.65 });
  box(root, "watch-band", [x, 1.67, z], [0.34, 0.12, 0.68], "#2A2A2A", { gloss: 0.75 });
  box(root, "watch-face", [x, 1.78, z], [0.52, 0.16, 0.48], accent, {
    emissive: accent,
    intensity: 2.2,
    gloss: 0.9,
  });
}

