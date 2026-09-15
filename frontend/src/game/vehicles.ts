import * as pc from "playcanvas";
import { box } from "./pcApp";

/**
 * Silhouette per body style. Length and width are deliberately unchanged from
 * the original values because npcVehicleHalfExtents in world.ts derives its
 * collision boxes from them - it is the roofline, ride height and glasshouse
 * that tell the styles apart, not the footprint.
 */
type Profile = {
  len: number;
  wid: number;
  bodyH: number;
  bodyY: number;
  cabinH: number;
  /** Glasshouse length as a fraction of the body. */
  cabinFrac: number;
  cabinZ: number;
  /** Cabin rear sits flush with the body rear - no boot deck behind the glass. */
  flatBack: boolean;
  wheelD: number;
  wheelW: number;
  /** Solid roof panel over the glass, rather than an open canopy. */
  roof: boolean;
  rails: boolean;
};

const PROFILES: Record<string, Profile> = {
  sedan: {
    len: 5.2, wid: 2.15, bodyH: 1.05, bodyY: 0.84,
    cabinH: 0.7, cabinFrac: 0.48, cabinZ: -0.18, flatBack: false,
    wheelD: 0.8, wheelW: 0.38, roof: false, rails: false,
  },
  // Cabin pushed back over a cut-off tail, so there is no boot deck.
  hatch: {
    len: 5.2, wid: 2.15, bodyH: 1.05, bodyY: 0.86,
    cabinH: 0.84, cabinFrac: 0.6, cabinZ: 0, flatBack: true,
    wheelD: 0.8, wheelW: 0.38, roof: true, rails: false,
  },
  sport: {
    len: 4.9, wid: 2.05, bodyH: 0.78, bodyY: 0.68,
    cabinH: 0.52, cabinFrac: 0.44, cabinZ: -0.28, flatBack: false,
    wheelD: 0.82, wheelW: 0.4, roof: false, rails: false,
  },
  // Tall upright glasshouse running back to a flat tail, big wheels, high floor
  // and roof rails - the things that actually read as an SUV. Anything less
  // than a flat back leaves a deck behind the cabin and it reads as a pickup.
  suv: {
    len: 5.5, wid: 2.28, bodyH: 1.18, bodyY: 1.04,
    cabinH: 1.02, cabinFrac: 0.7, cabinZ: 0, flatBack: true,
    wheelD: 0.98, wheelW: 0.44, roof: true, rails: true,
  },
};

export function createVehicle(
  parent: pc.Entity,
  spec: { id: string; x: number; z: number; rotY: number; color: string; kind: string },
): pc.Entity {
  const root = new pc.Entity(spec.id);
  root.setPosition(spec.x, 0.18, spec.z);
  root.setEulerAngles(0, (spec.rotY * 180) / Math.PI, 0);
  parent.addChild(root);

  const p = PROFILES[spec.kind] ?? PROFILES.sedan;
  const { len, wid, bodyH, bodyY } = p;
  const wheelX = wid * 0.42;
  const wheelY = p.wheelD / 2;
  const wheelZ = len * 0.34;
  const cabinLen = len * p.cabinFrac;
  // A flat back squares the cabin off against the tail instead of leaving a deck.
  const cabinZ = p.flatBack ? -len / 2 + cabinLen / 2 : p.cabinZ;
  const cabinY = bodyY + bodyH / 2 + p.cabinH / 2;

  box(root, "body", [0, bodyY, 0], [wid, bodyH, len], spec.color);
  box(root, "cabin", [0, cabinY, cabinZ], [wid * 0.88, p.cabinH, cabinLen], "#9BD7FF");

  if (p.roof) {
    const roofY = cabinY + p.cabinH / 2 - 0.02;
    box(root, "roof", [0, roofY, cabinZ], [wid * 0.9, 0.16, cabinLen * 0.98], spec.color);
    if (p.rails) {
      for (const side of [-1, 1]) {
        box(root, `rail-${side > 0 ? "r" : "l"}`, [side * wid * 0.33, roofY + 0.16, cabinZ], [0.1, 0.16, cabinLen * 0.82], "#2A2A2A");
      }
    }
  }

  // Wheel names are load-bearing: the drive code spins them by name.
  const wheelScale: [number, number, number] = [p.wheelW, p.wheelD, p.wheelD];
  box(root, "wheel-fl", [-wheelX, wheelY, wheelZ], wheelScale, "#111");
  box(root, "wheel-fr", [wheelX, wheelY, wheelZ], wheelScale, "#111");
  box(root, "wheel-bl", [-wheelX, wheelY, -wheelZ], wheelScale, "#111");
  box(root, "wheel-br", [wheelX, wheelY, -wheelZ], wheelScale, "#111");

  // Wheel arches, which also hide the gap a tall body leaves over big tyres.
  if (p.wheelD > 0.85) {
    for (const zz of [wheelZ, -wheelZ]) {
      for (const side of [-1, 1]) {
        box(root, `arch-${side > 0 ? "r" : "l"}-${zz > 0 ? "f" : "b"}`,
          [side * wheelX, wheelY + p.wheelD * 0.34, zz], [p.wheelW + 0.16, 0.2, p.wheelD + 0.24], "#1E1E1E");
      }
    }
  }

  if (p.flatBack) {
    const tailZ = -len / 2;
    box(root, "tailgate", [0, cabinY - p.cabinH * 0.12, tailZ + 0.02], [wid * 0.8, p.cabinH * 0.5, 0.1], spec.color);
    box(root, "spoiler", [0, cabinY + p.cabinH / 2 + 0.1, tailZ + 0.26], [wid * 0.86, 0.18, 0.5], spec.color);
  }

  box(root, "bumper-f", [0, bodyY - bodyH * 0.3, len / 2 + 0.04], [wid * 0.92, 0.32, 0.16], "#222");
  box(root, "bumper-b", [0, bodyY - bodyH * 0.3, -len / 2 - 0.04], [wid * 0.92, 0.32, 0.16], "#222");
  box(root, "light-l", [-wid * 0.32, bodyY, len / 2 + 0.06], [0.42, 0.2, 0.1], "#FFF4C2", {
    emissive: "#FFF4C2",
    intensity: 2,
  });
  box(root, "light-r", [wid * 0.32, bodyY, len / 2 + 0.06], [0.42, 0.2, 0.1], "#FFF4C2", {
    emissive: "#FFF4C2",
    intensity: 2,
  });
  box(root, "tail-l", [-wid * 0.32, bodyY, -len / 2 - 0.06], [0.38, 0.16, 0.08], "#FF4D4D", {
    emissive: "#FF4D4D",
    intensity: 1.4,
  });
  box(root, "tail-r", [wid * 0.32, bodyY, -len / 2 - 0.06], [0.38, 0.16, 0.08], "#FF4D4D", {
    emissive: "#FF4D4D",
    intensity: 1.4,
  });
  return root;
}

/**
 * Where to seat a driver so their head stays under the roof.
 *
 * The "sit" pose only rotates limbs - it never lowers the head - so a citizen
 * seated at their own origin still stands 2.13 tall and pokes through the
 * cabin of every car but the SUV. These figures come from createCitizen in
 * character.ts: head centre 1.82 with a 0.62 box, torso centre 1.12 with a
 * 0.92 box.
 */
const CITIZEN_HEAD_TOP = 1.82 + 0.31;
const CITIZEN_TORSO_BOTTOM = 1.12 - 0.46;
const DRIVER_SCALE = 0.78;

export function driverSeat(kind: string) {
  const p = PROFILES[kind] ?? PROFILES.sedan;
  const cabinTop = p.bodyY + p.bodyH / 2 + p.cabinH;
  const bodyBottom = p.bodyY - p.bodyH / 2;
  const headTop = CITIZEN_HEAD_TOP * DRIVER_SCALE;
  const torsoBottom = CITIZEN_TORSO_BOTTOM * DRIVER_SCALE;

  // Low enough that the head clears the roof, high enough that the torso does
  // not drop through the floor. The floor wins if they ever conflict.
  const underRoof = cabinTop - 0.16 - headTop;
  const aboveFloor = bodyBottom + 0.05 - torsoBottom;
  return { y: Math.max(aboveFloor, underRoof), scale: DRIVER_SCALE };
}
