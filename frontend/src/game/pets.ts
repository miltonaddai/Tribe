import * as pc from "playcanvas";
import type { PetId } from "@tribe/shared";
import { box } from "./pcApp";

export type PetWalker = {
  entity: pc.Entity;
  kind: PetId;
  x: number;
  z: number;
  yaw: number;
  anim: number;
  moving: boolean;
  /** 0-1 blend into the walk pose. Continuous, so legs never snap to neutral. */
  stride: number;
  inited: boolean;
};

/**
 * `chase` is how hard the pet accelerates per unit it has fallen behind, and
 * `slack` is the gap it tolerates before bothering. Together they make the pet
 * settle into a steady trail rather than sprinting to the owner and stopping
 * dead - the old on/off chase flipped state about thirteen times a second at
 * walking pace, and every flip snapped the legs back to neutral mid-stride.
 *
 * `stridePerUnit` converts ground speed into stride phase, so the paws keep pace
 * with the floor instead of skating over it.
 */
const GAIT: Record<
  PetId,
  { heel: number; side: number; speed: number; chase: number; slack: number; turn: number; stridePerUnit: number; swing: number }
> = {
  mutt: { heel: 1.28, side: 0.38, speed: 16, chase: 12, slack: 0.2, turn: 11, stridePerUnit: 1.5, swing: 30 },
  cat: { heel: 1.72, side: 0.58, speed: 12, chase: 9, slack: 0.35, turn: 7.5, stridePerUnit: 1.9, swing: 26 },
};

/** Ground speed at which the legs reach their full swing. */
const FULL_STRIDE_SPEED = 5;

export function createPet(parent: pc.Entity, kind: PetId, name: string) {
  return kind === "cat" ? createCat(parent, name) : createDog(parent, name);
}

export function createPetWalker(entity: pc.Entity, kind: PetId): PetWalker {
  const p = entity.getPosition();
  return { entity, kind, x: p.x, z: p.z, yaw: 0, anim: 0, moving: false, stride: 0, inited: false };
}

export function spawnPet(parent: pc.Entity, kind: PetId, name: string): PetWalker {
  return createPetWalker(createPet(parent, kind, name), kind);
}

export function tickPetWalker(
  walker: PetWalker,
  ownerX: number,
  ownerZ: number,
  ownerYaw: number,
  groundY: number,
  dt: number,
) {
  const g = GAIT[walker.kind] ?? GAIT.mutt;
  const fx = Math.sin(ownerYaw);
  const fz = Math.cos(ownerYaw);
  const heelX = ownerX - fx * g.heel + Math.cos(ownerYaw) * g.side;
  const heelZ = ownerZ - fz * g.heel - Math.sin(ownerYaw) * g.side;
  const dx = heelX - walker.x;
  const dz = heelZ - walker.z;
  const dist = Math.hypot(dx, dz);
  const pos = walker.entity.getPosition();
  const dy = Math.abs(groundY - pos.y);

  if (!walker.inited || dist > 14 || dy > 3.5) {
    walker.x = heelX;
    walker.z = heelZ;
    walker.yaw = ownerYaw;
    walker.moving = false;
    walker.stride = 0;
    walker.inited = true;
    walker.entity.setPosition(walker.x, groundY, walker.z);
    walker.entity.setEulerAngles(0, (walker.yaw * 180) / Math.PI, 0);
    applyPetMotion(walker.entity, walker.kind, 0, walker.anim);
    return;
  }

  // Speed scales with how far behind it is, so the pet trails at a steady
  // distance instead of closing the gap flat out and stopping dead.
  const want = Math.max(0, dist - g.slack);
  const speed = Math.min(g.speed, want * g.chase);
  let moved = 0;
  if (speed > 0.001 && dist > 0.001) {
    const step = Math.min(dist, speed * dt);
    walker.x += (dx / dist) * step;
    walker.z += (dz / dist) * step;
    moved = step;
    walker.yaw = lerpAngle(walker.yaw, Math.atan2(dx, dz), 1 - Math.exp(-g.turn * dt));
  } else {
    // Settled: face the same way as the owner rather than the last heading.
    walker.yaw = lerpAngle(walker.yaw, ownerYaw, 1 - Math.exp(-2.4 * dt));
  }

  // Blend the legs in and out rather than switching them. Snapping between a
  // walk pose and neutral is what made the old gait stutter.
  const ground = moved / Math.max(dt, 0.001);
  const target = Math.min(1, ground / FULL_STRIDE_SPEED);
  walker.stride += (target - walker.stride) * (1 - Math.exp(-9 * dt));
  walker.moving = walker.stride > 0.05;

  // Phase advances with distance covered, so the paws match the floor. A slow
  // idle sway keeps a settled pet from looking frozen.
  walker.anim += moved * g.stridePerUnit + dt * 1.6 * (1 - walker.stride);
  walker.entity.setPosition(walker.x, groundY, walker.z);
  walker.entity.setEulerAngles(0, (walker.yaw * 180) / Math.PI, 0);
  applyPetMotion(walker.entity, walker.kind, walker.stride, walker.anim);
}

/**
 * `stride` is a 0-1 blend into the walk, not a switch. Every value is mixed
 * between the settled pose and the full trot, so a pet slowing to a stop eases
 * its legs down instead of snapping them straight mid-step.
 */
function applyPetMotion(pet: pc.Entity, kind: PetId, stride: number, t: number) {
  const fl = pet.findByName("leg-fl");
  const fr = pet.findByName("leg-fr");
  const bl = pet.findByName("leg-bl");
  const br = pet.findByName("leg-br");
  const body = pet.findByName("body");
  const tail = pet.findByName("tail");
  const head = pet.findByName("head");
  const cat = kind === "cat";
  const bodyRest = cat ? 0.24 : 0.3;
  const walk = Math.max(0, Math.min(1, stride));
  const idle = 1 - walk;

  // Trot: diagonal pairs share a phase, so two feet are always planted.
  const swing = Math.sin(t) * g_swing(kind) * walk;
  // Each leg lifts on its forward half, which is what reads as a step rather
  // than a leg swinging through the floor.
  const liftA = Math.max(0, Math.sin(t)) * 6 * walk;
  const liftB = Math.max(0, -Math.sin(t)) * 6 * walk;
  fl?.setLocalEulerAngles(-swing - liftA, 0, 0);
  br?.setLocalEulerAngles(-swing - liftA, 0, 0);
  fr?.setLocalEulerAngles(swing - liftB, 0, 0);
  bl?.setLocalEulerAngles(swing - liftB, 0, 0);

  const bob = Math.abs(Math.sin(t * 2)) * 0.018 * walk + Math.sin(t) * 0.012 * idle;
  body?.setLocalPosition(0, bodyRest + bob, 0);
  body?.setLocalEulerAngles(
    Math.sin(t) * 5 * walk + Math.sin(t * 0.7) * 1.4 * idle,
    0,
    Math.sin(t) * 3.5 * walk,
  );
  head?.setLocalEulerAngles(Math.sin(t * 2) * 6 * walk + Math.sin(t * 0.85) * 3 * idle, 0, 0);
  tail?.setLocalEulerAngles(
    (cat ? 18 : 8) * walk + (cat ? 22 : 6) * idle,
    Math.sin(t * 1.6) * (cat ? 22 : 16) * walk + Math.sin(t * 1.8) * (cat ? 14 : 10) * idle,
    (cat ? 12 : 0) * walk + (cat ? 8 : 0) * idle,
  );
}

function g_swing(kind: PetId) {
  return GAIT[kind]?.swing ?? GAIT.mutt.swing;
}

/**
 * An unscaled entity to hang scaled meshes off.
 *
 * box() sets localScale, so anything parented to a box inherits that scale -
 * multiplying both its own size and its offset. The head used to be a child of
 * the body box, which shrank it to about a fifth of its size and pulled it
 * inside the torso: present in the scene graph, invisible in the game. Legs
 * never had the problem because addLeg already builds a bare joint first.
 *
 * Groups also give the animation a real pivot: rotating a head group swings the
 * head about the neck, where rotating a head *mesh* would spin it about its own
 * middle.
 */
function group(parent: pc.Entity, name: string, pos: [number, number, number]) {
  const e = new pc.Entity(name);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  parent.addChild(e);
  return e;
}

const DOG_COAT = "#8B5A2B";
const DOG_DARK = "#6B4423";

function createDog(parent: pc.Entity, name: string) {
  const dog = new pc.Entity(name);
  parent.addChild(dog);

  // Animated: applyPetMotion moves and tilts this, and everything on it.
  const body = group(dog, "body", [0, 0.3, 0]);
  box(body, "body-mesh", [0, 0, 0], [0.28, 0.22, 0.55], DOG_COAT);
  box(body, "chest", [0, -0.02, 0.2], [0.26, 0.2, 0.18], DOG_COAT);

  // Pivoted at the neck so the nod reads as a nod.
  const head = group(body, "head", [0, 0.1, 0.26]);
  box(head, "skull", [0, 0.04, 0.06], [0.22, 0.2, 0.22], DOG_COAT);
  box(head, "snout", [0, -0.01, 0.18], [0.13, 0.11, 0.15], DOG_DARK);
  box(head, "nose", [0, 0.02, 0.26], [0.07, 0.055, 0.03], "#241A12");
  box(head, "brow", [0, 0.12, 0.13], [0.2, 0.05, 0.08], DOG_DARK);
  for (const [side, x] of [["l", -0.085], ["r", 0.085]] as const) {
    // Flopped outward, which is most of what makes a dog read as a dog.
    const ear = group(head, `ear-${side}`, [x, 0.12, 0.01]);
    ear.setLocalEulerAngles(0, 0, side === "l" ? 18 : -18);
    box(ear, `ear-${side}-mesh`, [0, -0.04, 0], [0.06, 0.16, 0.07], DOG_DARK);
    box(head, `eye-${side}`, [x * 0.65, 0.08, 0.165], [0.04, 0.04, 0.02], "#161616");
  }

  const tail = group(body, "tail", [0, 0.08, -0.28]);
  box(tail, "tail-mesh", [0, 0.05, -0.08], [0.07, 0.09, 0.2], DOG_DARK);

  addLeg(dog, "leg-fl", [-0.1, 0.2, 0.16], 0.2, 0.08, DOG_DARK);
  addLeg(dog, "leg-fr", [0.1, 0.2, 0.16], 0.2, 0.08, DOG_DARK);
  addLeg(dog, "leg-bl", [-0.1, 0.2, -0.16], 0.2, 0.08, DOG_DARK);
  addLeg(dog, "leg-br", [0.1, 0.2, -0.16], 0.2, 0.08, DOG_DARK);
  return dog;
}

const CAT_COAT = "#D4D4D8";
const CAT_FACE = "#E5E7EB";
const CAT_DARK = "#9CA3AF";

function createCat(parent: pc.Entity, name: string) {
  const cat = new pc.Entity(name);
  parent.addChild(cat);

  const body = group(cat, "body", [0, 0.24, 0]);
  box(body, "body-mesh", [0, 0, 0], [0.22, 0.16, 0.42], CAT_COAT);

  const head = group(body, "head", [0, 0.09, 0.2]);
  box(head, "skull", [0, 0.03, 0.05], [0.2, 0.18, 0.2], CAT_FACE);
  box(head, "muzzle", [0, -0.03, 0.13], [0.11, 0.07, 0.07], CAT_FACE);
  box(head, "nose", [0, -0.01, 0.165], [0.04, 0.03, 0.02], "#E8A0A8");
  for (const [side, x] of [["l", -0.062], ["r", 0.062]] as const) {
    // Upright and tilted out: a cat is mostly ears.
    const ear = group(head, `ear-${side}`, [x, 0.12, 0.02]);
    ear.setLocalEulerAngles(0, 0, side === "l" ? -12 : 12);
    box(ear, `ear-${side}-mesh`, [0, 0.03, 0], [0.06, 0.11, 0.05], CAT_COAT);
    box(ear, `ear-${side}-inner`, [0, 0.02, 0.016], [0.032, 0.06, 0.02], "#E8A0A8");
    box(head, `eye-${side}`, [x * 0.8, 0.05, 0.148], [0.035, 0.035, 0.02], "#2F7D4F");
  }

  // Carried upright, the way a cat walks. The animation swings it from here.
  const tail = group(body, "tail", [0, 0.05, -0.2]);
  box(tail, "tail-mesh", [0, 0.13, -0.03], [0.05, 0.28, 0.05], CAT_DARK);
  box(tail, "tail-tip", [0, 0.28, -0.04], [0.052, 0.06, 0.052], CAT_FACE);

  addLeg(cat, "leg-fl", [-0.08, 0.16, 0.12], 0.16, 0.06, CAT_DARK);
  addLeg(cat, "leg-fr", [0.08, 0.16, 0.12], 0.16, 0.06, CAT_DARK);
  addLeg(cat, "leg-bl", [-0.08, 0.16, -0.12], 0.16, 0.06, CAT_DARK);
  addLeg(cat, "leg-br", [0.08, 0.16, -0.12], 0.16, 0.06, CAT_DARK);
  return cat;
}

function addLeg(parent: pc.Entity, name: string, pivot: [number, number, number], length: number, thick: number, hex: string) {
  const joint = new pc.Entity(name);
  joint.setLocalPosition(pivot[0], pivot[1], pivot[2]);
  parent.addChild(joint);
  box(joint, `${name}-mesh`, [0, -length / 2, 0], [thick, length, thick], hex);
  return joint;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}
