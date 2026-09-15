import * as pc from "playcanvas";
import type { PetId } from "@the-block/shared";
import { box } from "./pcApp";

export type PetWalker = {
  entity: pc.Entity;
  kind: PetId;
  x: number;
  z: number;
  yaw: number;
  anim: number;
  moving: boolean;
  inited: boolean;
};

const GAIT: Record<PetId, { heel: number; side: number; speed: number; turn: number; stop: number; start: number; cadence: number }> = {
  mutt: { heel: 1.28, side: 0.38, speed: 11.5, turn: 11, stop: 0.2, start: 0.42, cadence: 12 },
  cat: { heel: 1.72, side: 0.58, speed: 8.4, turn: 7.5, stop: 0.48, start: 0.78, cadence: 14 },
};

export function createPet(parent: pc.Entity, kind: PetId, name: string) {
  return kind === "cat" ? createCat(parent, name) : createDog(parent, name);
}

export function createPetWalker(entity: pc.Entity, kind: PetId): PetWalker {
  const p = entity.getPosition();
  return { entity, kind, x: p.x, z: p.z, yaw: 0, anim: 0, moving: false, inited: false };
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
    walker.inited = true;
    walker.entity.setPosition(walker.x, groundY, walker.z);
    walker.entity.setEulerAngles(0, (walker.yaw * 180) / Math.PI, 0);
    applyPetMotion(walker.entity, walker.kind, false, walker.anim);
    return;
  }

  if (walker.moving) {
    if (dist < g.stop) walker.moving = false;
  } else if (dist > g.start) walker.moving = true;

  let moved = 0;
  if (walker.moving && dist > 0.001) {
    const burst = dist > 3.2 ? 1.55 : dist > 1.6 ? 1.2 : 1;
    const step = Math.min(dist, g.speed * burst * dt);
    walker.x += (dx / dist) * step;
    walker.z += (dz / dist) * step;
    moved = step;
    walker.yaw = lerpAngle(walker.yaw, Math.atan2(dx, dz), 1 - Math.exp(-g.turn * dt));
  } else {
    walker.yaw = lerpAngle(walker.yaw, ownerYaw, 1 - Math.exp(-2.4 * dt));
  }

  walker.anim += walker.moving ? dt * g.cadence * (0.7 + Math.min(2.2, moved / Math.max(dt, 0.001) / g.speed)) : dt * 2.2;
  walker.entity.setPosition(walker.x, groundY, walker.z);
  walker.entity.setEulerAngles(0, (walker.yaw * 180) / Math.PI, 0);
  applyPetMotion(walker.entity, walker.kind, walker.moving, walker.anim);
}

function applyPetMotion(pet: pc.Entity, kind: PetId, walking: boolean, t: number) {
  const fl = pet.findByName("leg-fl");
  const fr = pet.findByName("leg-fr");
  const bl = pet.findByName("leg-bl");
  const br = pet.findByName("leg-br");
  const body = pet.findByName("body");
  const tail = pet.findByName("tail");
  const head = pet.findByName("head");
  const cat = kind === "cat";
  const bodyRest = cat ? 0.24 : 0.3;

  fl?.setLocalEulerAngles(0, 0, 0);
  fr?.setLocalEulerAngles(0, 0, 0);
  bl?.setLocalEulerAngles(0, 0, 0);
  br?.setLocalEulerAngles(0, 0, 0);
  body?.setLocalEulerAngles(0, 0, 0);
  head?.setLocalEulerAngles(0, 0, 0);

  if (walking) {
    const swing = Math.sin(t) * (cat ? 26 : 30);
    // Trot: opposite corners share a phase so two feet stay planted.
    fl?.setLocalEulerAngles(-swing, 0, 0);
    br?.setLocalEulerAngles(-swing, 0, 0);
    fr?.setLocalEulerAngles(swing, 0, 0);
    bl?.setLocalEulerAngles(swing, 0, 0);
    body?.setLocalPosition(0, bodyRest + Math.abs(Math.sin(t * 2)) * 0.018, 0);
    body?.setLocalEulerAngles(Math.sin(t) * 5, 0, Math.sin(t) * 3.5);
    head?.setLocalEulerAngles(Math.sin(t * 2) * 6, 0, 0);
    tail?.setLocalEulerAngles(cat ? 18 : 8, Math.sin(t * 1.6) * (cat ? 22 : 16), cat ? 12 : 0);
    return;
  }

  body?.setLocalPosition(0, bodyRest + Math.sin(t) * 0.012, 0);
  body?.setLocalEulerAngles(Math.sin(t * 0.7) * 1.4, 0, 0);
  head?.setLocalEulerAngles(Math.sin(t * 0.85) * 3, 0, 0);
  tail?.setLocalEulerAngles(cat ? 22 : 6, Math.sin(t * 1.8) * (cat ? 14 : 10), cat ? 8 : 0);
}

function createDog(parent: pc.Entity, name: string) {
  const dog = new pc.Entity(name);
  parent.addChild(dog);
  const body = box(dog, "body", [0, 0.3, 0], [0.28, 0.22, 0.55], "#8B5A2B");
  box(body, "head", [0, 0.12, 0.3], [0.22, 0.2, 0.22], "#8B5A2B");
  box(body, "snout", [0, 0.04, 0.42], [0.12, 0.1, 0.14], "#6B4423");
  box(body, "ear-l", [-0.08, 0.24, 0.26], [0.06, 0.12, 0.06], "#6B4423");
  box(body, "ear-r", [0.08, 0.24, 0.26], [0.06, 0.12, 0.06], "#6B4423");
  box(body, "tail", [0, 0.06, -0.32], [0.06, 0.08, 0.16], "#6B4423");
  addLeg(dog, "leg-fl", [-0.1, 0.2, 0.16], 0.2, 0.08, "#6B4423");
  addLeg(dog, "leg-fr", [0.1, 0.2, 0.16], 0.2, 0.08, "#6B4423");
  addLeg(dog, "leg-bl", [-0.1, 0.2, -0.16], 0.2, 0.08, "#6B4423");
  addLeg(dog, "leg-br", [0.1, 0.2, -0.16], 0.2, 0.08, "#6B4423");
  return dog;
}

function createCat(parent: pc.Entity, name: string) {
  const cat = new pc.Entity(name);
  parent.addChild(cat);
  const body = box(cat, "body", [0, 0.24, 0], [0.22, 0.16, 0.42], "#D4D4D8");
  box(body, "head", [0, 0.14, 0.24], [0.2, 0.18, 0.2], "#E5E7EB");
  box(body, "ear-l", [-0.07, 0.26, 0.22], [0.06, 0.12, 0.06], "#D4D4D8");
  box(body, "ear-r", [0.07, 0.26, 0.22], [0.06, 0.12, 0.06], "#D4D4D8");
  box(body, "tail", [0, 0.16, -0.28], [0.05, 0.05, 0.3], "#9CA3AF");
  addLeg(cat, "leg-fl", [-0.08, 0.16, 0.12], 0.16, 0.06, "#9CA3AF");
  addLeg(cat, "leg-fr", [0.08, 0.16, 0.12], 0.16, 0.06, "#9CA3AF");
  addLeg(cat, "leg-bl", [-0.08, 0.16, -0.12], 0.16, 0.06, "#9CA3AF");
  addLeg(cat, "leg-br", [0.08, 0.16, -0.12], 0.16, 0.06, "#9CA3AF");
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
