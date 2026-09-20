import * as pc from "playcanvas";
import { CURRENCY,
  CITIES,
  CITY_BOUNDS,
  CITY_GRID,
  CITY_ORDER,
  CITY_SIZE,
  CITY_WALL_OUTSET,
  DEALER_STOCK,
  cityGates,
  LANDMARKS,
  WORLD_HALF,
  homeId,
  homeFloors,
  homeGradeById,
  lotSeed,
  mulberry,
  type CityId,
  type CityTheme,
  type LandmarkKind,
} from "@tribe/shared";
import { aabbFrom, box, entityYaw, hitsAabb, lightPool, type Aabb } from "./pcApp";
import { createCitizen, type Appearance } from "./character";
import { applyCitizenMotion, type CitizenMotion } from "./motion";
import {
  fillInterior,
  interiorLayout,
  interiorObstacles,
  interiorPlatforms,
  interiorSeats,
  type InteriorKind,
} from "./interiors";
import { SIT_HIP } from "./motion";
import { spawnPet, tickPetWalker, type PetWalker } from "./pets";
import { createVehicle, driverSeat } from "./vehicles";

export const WALK_Y = 0.18;

export type Interactable = {
  kind: "vehicle" | "door" | "work" | "exit" | "buy-car";
  id: string;
  x: number;
  z: number;
  radius: number;
  city: CityId;
  interior?: { x: number; y: number; z: number };
  exterior?: { x: number; y: number; z: number };
  label?: string;
  labelY?: number;
  interiorKind?: InteriorKind;
  halfW?: number;
  halfD?: number;
  ceiling?: number;
  /** Raised surfaces inside, in world coordinates. */
  platforms?: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }[];
  /** Solid props inside, in world coordinates. */
  obstacles?: Aabb[];
  spawnZ?: number;
  carKind?: string;
  carColor?: string;
  carPrice?: number;
};

export type NpcAgent = {
  entity: pc.Entity;
  pet?: PetWalker;
  vehicle?: pc.Entity;
  vehicleKind?: string;
  yaw: number;
  waypoints: { x: number; z: number }[];
  i: number;
  wait: number;
  speed: number;
  hold: CitizenMotion;
  health: number;
  hitUntil: number;
  blockedFor?: number;
  detour?: number;
};

export type VehicleObstacle = { id: string; x: number; z: number; yaw: number; kind: string };

export type Seat = {
  x: number;
  z: number;
  yaw: number;
  sitY: number;
  /** A bed rather than a chair: lie flat along yaw instead of sitting upright. */
  lie: boolean;
};

/** A streetlamp's position, so the engine can put real light near the player. */
export type LampPost = { x: number; z: number; color: string };

export type WorldObjects = {
  colliders: Aabb[];
  lamps: LampPost[];
  interactables: Interactable[];
  interiors: Map<string, pc.Entity>;
  npcs: NpcAgent[];
  seats: Seat[];
  nightWashes: pc.Entity[];
};

const ROAD_W = 10;
/** Half-width used when testing a traffic car against building walls. */
/** Usable width of a block once the surrounding roads are taken out. */
const LOT_SIZE = CITY_SIZE / CITY_GRID - ROAD_W - 0.8;


const MARK_Y = WALK_Y + 0.08;

/*
 * How far apart two road surfaces have to sit when they cover the same ground.
 *
 * Coplanar surfaces do not pick a winner - they alternate per pixel as the
 * camera moves. A centimetre is plenty for the depth test at these distances
 * and far too little to read as a step underfoot.
 *
 * Which of a pair moves matters, because the belt is crowded: the connector
 * roads cross the plaza, whose ring sits at WALK_Y + 0.04, so dropping them
 * onto it trades a small overlap for a 18x18 one. The gate approaches lift
 * instead, and the district's east-west grid drops, neither of which shares
 * ground with anything else.
 */
const LAYER_STEP = 0.01;
const LINE = "#F8F8F8";
const GRID = CITY_GRID;

export function buildWorld(app: pc.AppBase): WorldObjects {
  const root = new pc.Entity("world");
  app.root.addChild(root);
  const colliders: Aabb[] = [];
  const interactables: Interactable[] = [];
  const interiors = new Map<string, pc.Entity>();
  const npcs: NpcAgent[] = [];
  const seats: Seat[] = [];
  const nightWashes: pc.Entity[] = [];
  const lamps: LampPost[] = [];

  addSky(app);
  addWorldGround(root);
  addPlaza(root, colliders);
  addConnectorRoads(root);

  for (const id of CITY_ORDER) {
    buildCity(root, CITIES[id], colliders, interactables, interiors, npcs, seats, nightWashes, lamps);
  }

  addMapWalls(root, colliders);

  return { colliders, lamps, interactables, interiors, npcs, seats, nightWashes };
}

export function tickNpcs(
  npcs: NpcAgent[],
  dt: number,
  t: number,
  vehicleObstacles: VehicleObstacle[] = [],
  colliders: Aabb[] = [],
) {
  const now = performance.now();
  const npcVehicleObstacles = npcs.flatMap((npc, index): VehicleObstacle[] => {
    if (!npc.vehicle) return [];
    const p = npc.vehicle.getPosition();
    return [
      {
        id: `npc-${index}`,
        x: p.x,
        z: p.z,
        yaw: entityYaw(npc.vehicle),
        kind: npc.vehicleKind ?? "sedan",
      },
    ];
  });
  const allVehicleObstacles = [...vehicleObstacles, ...npcVehicleObstacles];
  for (let n = 0; n < npcs.length; n++) {
    const npc = npcs[n];
    const phase = t + n * 0.71;
    if (npc.vehicle) {
      tickNpcDrive(npc, dt, phase, npcs, vehicleObstacles, colliders);
      continue;
    }
    if (npc.health <= 0) {
      applyCitizenMotion(npc.entity, "sit", phase);
      npc.wait = Math.max(0, npc.wait - dt);
      if (npc.wait <= 0) {
        npc.health = 100;
        npc.hitUntil = 0;
        if (npc.hold !== "sit") npc.hold = "idle";
      }
      followNpcPet(npc, dt);
      continue;
    }
    if (npc.hitUntil > now) {
      applyCitizenMotion(npc.entity, "hit", 1 - (npc.hitUntil - now) / 280);
      followNpcPet(npc, dt);
      continue;
    }
    if (npc.waypoints.length === 0 || npc.wait > 0) {
      npc.wait = Math.max(0, npc.wait - dt);
      const bob = applyCitizenMotion(npc.entity, npc.hold, phase);
      const p = npc.entity.getPosition();
      if (npc.hold !== "sit") npc.entity.setPosition(p.x, WALK_Y + bob, p.z);
      followNpcPet(npc, dt);
      continue;
    }

    const dest = npc.waypoints[npc.i];
    const p = npc.entity.getPosition();
    const dx = dest.x - p.x;
    const dz = dest.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      npc.i = (npc.i + 1) % npc.waypoints.length;
      npc.wait = npc.hold === "wave" ? 2.4 : 0.5 + (npc.i % 4) * 0.55;
      const bob = applyCitizenMotion(npc.entity, "idle", phase);
      npc.entity.setPosition(p.x, WALK_Y + bob, p.z);
      followNpcPet(npc, dt);
      continue;
    }

    const step = npc.speed * dt;
    let nx = p.x + (dx / dist) * step;
    let nz = p.z + (dz / dist) * step;
    if (npcPedestrianBlocked(p.x, p.z, nx, nz, allVehicleObstacles)) {
      const rightX = dz / dist;
      const rightZ = -dx / dist;
      const side = n % 2 === 0 ? 1 : -1;
      // A small backward component moves the NPC away from the bumper while the
      // persistent side choice (based on its index) prevents left/right jitter.
      const sideStep = step * 1.2;
      const backStep = step * 0.28;
      const forwardX = dx / dist;
      const forwardZ = dz / dist;
      const firstX = p.x + rightX * sideStep * side - forwardX * backStep;
      const firstZ = p.z + rightZ * sideStep * side - forwardZ * backStep;
      const secondX = p.x - rightX * sideStep * side - forwardX * backStep;
      const secondZ = p.z - rightZ * sideStep * side - forwardZ * backStep;
      if (!npcPedestrianBlocked(p.x, p.z, firstX, firstZ, allVehicleObstacles)) {
        nx = firstX;
        nz = firstZ;
      } else if (!npcPedestrianBlocked(p.x, p.z, secondX, secondZ, allVehicleObstacles)) {
        nx = secondX;
        nz = secondZ;
      } else {
        const bob = applyCitizenMotion(npc.entity, "idle", phase);
        npc.entity.setPosition(p.x, WALK_Y + bob, p.z);
        followNpcPet(npc, dt);
        continue;
      }
    }
    const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    const bob = applyCitizenMotion(npc.entity, "walk", phase);
    npc.entity.setPosition(nx, WALK_Y + bob, nz);
    npc.entity.setEulerAngles(0, yaw, 0);
    followNpcPet(npc, dt, nx, nz, (yaw * Math.PI) / 180);
  }
}

function followNpcPet(npc: NpcAgent, dt: number, x?: number, z?: number, yaw?: number) {
  if (!npc.pet) return;
  const p = npc.entity.getPosition();
  tickPetWalker(
    npc.pet,
    x ?? p.x,
    z ?? p.z,
    yaw ?? entityYaw(npc.entity),
    WALK_Y,
    dt,
  );
}

function tickNpcDrive(
  npc: NpcAgent,
  dt: number,
  phase: number,
  npcs: NpcAgent[],
  vehicleObstacles: VehicleObstacle[],
  colliders: Aabb[],
) {
  const car = npc.vehicle;
  if (!car || npc.waypoints.length === 0) return;
  const pos = car.getPosition();
  let dest = npc.waypoints[npc.i];
  if (Math.hypot(dest.x - pos.x, dest.z - pos.z) < 4.2) {
    npc.i = (npc.i + 1) % npc.waypoints.length;
    dest = npc.waypoints[npc.i];
  }
  const dx = dest.x - pos.x;
  const dz = dest.z - pos.z;
  const want = Math.atan2(dx, dz);
  const kind = npc.vehicleKind ?? "sedan";
  const step = npc.speed * dt;
  const steer = 1 - Math.exp(-3.4 * dt);

  const blockerAt = (x: number, z: number, yaw: number) => {
    // Buildings count as blockers too. Without this the detour manoeuvre below
    // happily steers a car through a wall, which is how one ends up parked
    // inside the hospital.
    for (const wall of colliders) {
      if (npcVehicleHitsWall(x, z, yaw, kind, wall)) {
        return { x: (wall.minX + wall.maxX) / 2, z: (wall.minZ + wall.maxZ) / 2 };
      }
    }
    for (const other of npcs) {
      if (other === npc || !other.vehicle) continue;
      const q = other.vehicle.getPosition();
      const otherYaw = entityYaw(other.vehicle);
      if (npcVehiclesOverlap(x, z, yaw, kind, q.x, q.z, otherYaw, other.vehicleKind ?? "sedan")) {
        return q;
      }
    }
    for (const other of vehicleObstacles) {
      if (npcVehiclesOverlap(x, z, yaw, kind, other.x, other.z, other.yaw, other.kind)) return other;
    }
    return null;
  };

  const straight = lerpAngle(npc.yaw, want, steer);
  const blocker = blockerAt(pos.x + Math.sin(straight) * step, pos.z + Math.cos(straight) * step, straight);

  if (!blocker) {
    npc.yaw = straight;
    npc.blockedFor = 0;
    npc.detour = 0;
    car.setPosition(pos.x + Math.sin(straight) * step, WALK_Y, pos.z + Math.cos(straight) * step);
    driveVisuals(npc, car, phase, step);
    return;
  }

  // Commit to one side for the whole manoeuvre. Two cars meeting head-on each
  // read the other as being off their own nose and swing apart; re-deciding
  // every frame would just have them mirror each other and stay locked.
  if (!npc.detour) {
    const rightness =
      (blocker.x - pos.x) * Math.cos(npc.yaw) - (blocker.z - pos.z) * Math.sin(npc.yaw);
    npc.detour = rightness > 0 ? -1 : 1;
  }

  // Widen the swerve the longer the way stays shut, and keep turning even on
  // frames where no step is free so the nose works its way out of the jam.
  const blockedFor = (npc.blockedFor ?? 0) + dt;
  const bias = Math.min(1.5, 0.5 + blockedFor * 1.1) * npc.detour;
  const yaw = lerpAngle(npc.yaw, want + bias, steer);
  npc.yaw = yaw;

  const nx = pos.x + Math.sin(yaw) * step;
  const nz = pos.z + Math.cos(yaw) * step;
  if (!blockerAt(nx, nz, yaw)) {
    car.setPosition(nx, WALK_Y, nz);
    // Decay rather than clear, so a car that is squeezing past does not snap
    // its steering straight and clip the vehicle it is still alongside.
    npc.blockedFor = Math.max(0, blockedFor - dt * 2);
    driveVisuals(npc, car, phase, step);
    return;
  }

  npc.blockedFor = blockedFor;
  if (blockedFor > 1.2) {
    const rx = pos.x - Math.sin(yaw) * step * 0.6;
    const rz = pos.z - Math.cos(yaw) * step * 0.6;
    if (!blockerAt(rx, rz, yaw)) car.setPosition(rx, WALK_Y, rz);
  }
  if (blockedFor > 3.5) {
    // A car that is already inside a wall is blocked whichever way it turns, so
    // picking a new waypoint alone would leave it there for good. Put it back on
    // its route, which is on a road by construction.
    // Same oriented test as the movement check. With a centre-point circle this
    // never fired for a car buried nose-first: its centre was clear of the wall,
    // so the rescue decided it was not stuck and left it embedded for good.
    const insideWall = colliders.some((wall) => npcVehicleHitsWall(pos.x, pos.z, yaw, kind, wall));
    if (insideWall) {
      const target = npc.waypoints[npc.i];
      car.setPosition(target.x, WALK_Y, target.z);
      npc.yaw = Math.atan2(target.x - pos.x, target.z - pos.z);
    }
    npc.i = (npc.i + 1) % npc.waypoints.length;
    npc.blockedFor = 0;
    npc.detour = 0;
  }
  driveVisuals(npc, car, phase, 0);
}

function driveVisuals(npc: NpcAgent, car: pc.Entity, phase: number, step: number) {
  car.setEulerAngles(0, (npc.yaw * 180) / Math.PI, 0);
  const roll = step * 36;
  for (const name of ["wheel-fl", "wheel-fr", "wheel-bl", "wheel-br"]) {
    car.findByName(name)?.rotateLocal(roll, 0, 0);
  }
  applyCitizenMotion(npc.entity, "sit", phase);
}

function npcPedestrianBlocked(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  obstacles: VehicleObstacle[],
) {
  for (const vehicle of obstacles) {
    const size = npcVehicleHalfExtents(vehicle.kind);
    const depthAt = (x: number, z: number) => {
      const dx = x - vehicle.x;
      const dz = z - vehicle.z;
      const across = Math.abs(dx * Math.cos(vehicle.yaw) - dz * Math.sin(vehicle.yaw));
      const along = Math.abs(dx * Math.sin(vehicle.yaw) + dz * Math.cos(vehicle.yaw));
      return Math.min(size.halfWidth + 0.55 - across, size.halfLength + 0.55 - along);
    };
    const nextDepth = depthAt(toX, toZ);
    if (nextDepth <= 0) continue;
    const currentDepth = depthAt(fromX, fromZ);
    // Once an NPC is touching the expanded car footprint, permit movement that
    // is tangent to or exits it; only motion farther into the car remains blocked.
    if (currentDepth <= 0 || nextDepth > currentDepth + 0.002) return true;
  }
  return false;
}

function npcVehicleHalfExtents(kind: string) {
  if (kind === "sport") return { halfWidth: 1.025, halfLength: 2.45 };
  if (kind === "suv") return { halfWidth: 1.14, halfLength: 2.75 };
  return { halfWidth: 1.075, halfLength: 2.6 };
}

/**
 * Does this car, at this position and heading, overlap a building?
 *
 * Separating-axis test between the car's oriented box and the wall's
 * axis-aligned one. It replaces a circle of radius 1.9 centred on the car,
 * which was smaller than the car: a sedan reaches 2.6 forward and an SUV 2.75,
 * so the test cleared positions where the front of the car was already three
 * quarters of a metre inside the wall. Cars drove up to buildings and parked
 * their noses in them, which is how one ended up embedded in the hospital.
 *
 * Four axes suffice in 2D - the wall's two, which are world X and Z, and the
 * car's two.
 */
function npcVehicleHitsWall(x: number, z: number, yaw: number, kind: string, wall: Aabb) {
  const { halfWidth, halfLength } = npcVehicleHalfExtents(kind);
  const centreX = (wall.minX + wall.maxX) / 2;
  const centreZ = (wall.minZ + wall.maxZ) / 2;
  const wallHalfX = (wall.maxX - wall.minX) / 2;
  const wallHalfZ = (wall.maxZ - wall.minZ) / 2;
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const dx = centreX - x;
  const dz = centreZ - z;

  // The wall's own axes: project the car onto each.
  const carOnX = halfWidth * Math.abs(right.x) + halfLength * Math.abs(forward.x);
  if (Math.abs(dx) > wallHalfX + carOnX) return false;
  const carOnZ = halfWidth * Math.abs(right.z) + halfLength * Math.abs(forward.z);
  if (Math.abs(dz) > wallHalfZ + carOnZ) return false;

  // The car's own axes: project the wall onto each.
  const wallOnRight = wallHalfX * Math.abs(right.x) + wallHalfZ * Math.abs(right.z);
  if (Math.abs(dx * right.x + dz * right.z) > halfWidth + wallOnRight) return false;
  const wallOnForward = wallHalfX * Math.abs(forward.x) + wallHalfZ * Math.abs(forward.z);
  if (Math.abs(dx * forward.x + dz * forward.z) > halfLength + wallOnForward) return false;

  return true;
}

function npcVehiclesOverlap(
  ax: number,
  az: number,
  aYaw: number,
  aKind: string,
  bx: number,
  bz: number,
  bYaw: number,
  bKind: string,
) {
  const a = npcVehicleHalfExtents(aKind);
  const b = npcVehicleHalfExtents(bKind);
  const aRight = { x: Math.cos(aYaw), z: -Math.sin(aYaw) };
  const aForward = { x: Math.sin(aYaw), z: Math.cos(aYaw) };
  const bRight = { x: Math.cos(bYaw), z: -Math.sin(bYaw) };
  const bForward = { x: Math.sin(bYaw), z: Math.cos(bYaw) };
  const delta = { x: bx - ax, z: bz - az };
  const dot = (u: { x: number; z: number }, v: { x: number; z: number }) => u.x * v.x + u.z * v.z;
  for (const axis of [aRight, aForward, bRight, bForward]) {
    const centerDistance = Math.abs(dot(delta, axis));
    const aRadius = a.halfWidth * Math.abs(dot(aRight, axis)) + a.halfLength * Math.abs(dot(aForward, axis));
    const bRadius = b.halfWidth * Math.abs(dot(bRight, axis)) + b.halfLength * Math.abs(dot(bForward, axis));
    if (centerDistance >= aRadius + bRadius + 0.08) return false;
  }
  return true;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}

function addSky(app: pc.AppBase) {
  app.scene.ambientLight = new pc.Color(0.45, 0.45, 0.5);
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.start = 50;
  app.scene.fog.end = 220;
  app.scene.fog.color = new pc.Color(0.72, 0.82, 0.92);

  const sun = new pc.Entity("sun");
  sun.addComponent("light", {
    type: "directional",
    color: new pc.Color(1, 0.95, 0.85),
    intensity: 1.15,
    castShadows: false,
  });
  sun.setEulerAngles(42, 30, 0);
  app.root.addChild(sun);

  const fill = new pc.Entity("fill");
  fill.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.55, 0.65, 0.9),
    intensity: 0.25,
  });
  fill.setEulerAngles(20, -120, 0);
  app.root.addChild(fill);
}

function addBrickSlab(
  root: pc.Entity,
  name: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  topY: number,
  thick: number,
  fill: string,
  grout?: string,
  brickW = 2,
  brickD = 2,
) {
  box(root, name, [cx, topY - thick / 2, cz], [w, thick, d], fill);
  if (grout) addGrout(root, name, cx, cz, w, d, topY, grout, brickW, brickD);
}

function addGrout(
  root: pc.Entity,
  name: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  topY: number,
  grout: string,
  brickW: number,
  brickD: number,
) {
  const minX = cx - w / 2;
  const maxX = cx + w / 2;
  const minZ = cz - d / 2;
  const maxZ = cz + d / 2;
  const gy = topY + 0.008;
  let n = 0;
  for (let x = minX + brickW; x < maxX - 0.08; x += brickW) {
    box(root, `${name}-gx-${n++}`, [x, gy, cz], [0.07, 0.014, d * 0.998], grout);
  }
  n = 0;
  for (let z = minZ + brickD; z < maxZ - 0.08; z += brickD) {
    box(root, `${name}-gz-${n++}`, [cx, gy, z], [w * 0.998, 0.014, 0.07], grout);
  }
}

/**
 * A single slab under the entire playable square. Without it the gate belt and
 * the strip beneath each city's ring road have no geometry at all, and you see
 * straight through to the skybox.
 */
const PLAZA_HALF = 12;

function addWorldGround(root: pc.Entity) {
  const span = WORLD_HALF * 2 + 8;
  // Holed for the plaza as well: its top is WALK_Y - 0.02, two centimetres
  // under the plaza floor, so it is the next surface up the stack to compete
  // for the same pixels. The plaza slabs are a third of a metre thick and
  // cover the gap.
  const gap = PLAZA_HALF;
  const outerArm = span / 2 - gap;
  const outerMid = (span / 2 + gap) / 2;
  const groundY = WALK_Y - 0.02 - 0.5;
  box(root, "world-ground-n", [0, groundY, outerMid], [span, 1, outerArm], "#3A3833");
  box(root, "world-ground-s", [0, groundY, -outerMid], [span, 1, outerArm], "#3A3833");
  box(root, "world-ground-e", [outerMid, groundY, 0], [outerArm, 1, gap * 2], "#3A3833");
  box(root, "world-ground-w", [-outerMid, groundY, 0], [outerArm, 1, gap * 2], "#3A3833");
  // A hole where the plaza goes, rather than a sheet running under it. This
  // slab's top is a single centimetre below the plaza's, and at the angle a
  // player looks at the ground that is a fraction of a millimetre of depth -
  // not enough to keep the two apart. Drawn as a frame, nothing is beneath the
  // plaza but the dirt, a third of a metre down.
  const edge = span / 2;
  const arm = edge - PLAZA_HALF;
  const mid = (edge + PLAZA_HALF) / 2;
  addBrickSlab(root, "belt-ground-n", 0, mid, span, arm, WALK_Y - 0.01, 0.3, "#6E6A62");
  addBrickSlab(root, "belt-ground-s", 0, -mid, span, arm, WALK_Y - 0.01, 0.3, "#6E6A62");
  addBrickSlab(root, "belt-ground-e", mid, 0, arm, PLAZA_HALF * 2, WALK_Y - 0.01, 0.3, "#6E6A62");
  addBrickSlab(root, "belt-ground-w", -mid, 0, arm, PLAZA_HALF * 2, WALK_Y - 0.01, 0.3, "#6E6A62");
}

/**
 * The plaza floor is a frame around the ring, not a slab underneath it.
 *
 * The ring used to be a thin box hovering above the slab. However far apart
 * they were put, the two surfaces fought for the depth buffer - and the band
 * they have to share is only five centimetres tall, between the belt beneath
 * and the connector roads crossing above. Depth precision is not the limit
 * here; the gradient across a pixel is. At the grazing angle a player actually
 * looks at the ground, a few centimetres of height is a fraction of a
 * millimetre of depth, and which of the four corners breaks up depends on the
 * angle it is seen from rather than its distance. Measured: at eye height,
 * off-centre, the ring's area jitters as the camera creeps forward.
 *
 * So the two no longer overlap. The four frame pieces and the ring tile the
 * 24x24 exactly, edge to edge, and the ring sits flush at the same height
 * instead of proud of it. Nothing is drawn twice, so there is nothing to fight.
 */
function addPlaza(root: pc.Entity, colliders: Aabb[]) {
  box(root, "plaza-dirt", [0, -0.32, 0], [28, 0.28, 28], "#2A2A2A");
  const outer = 12;
  const inner = 9;
  const strip = outer - inner;
  const mid = (outer + inner) / 2;
  addBrickSlab(root, "plaza-n", 0, mid, outer * 2, strip, WALK_Y, 0.34, "#C9C4BB");
  addBrickSlab(root, "plaza-s", 0, -mid, outer * 2, strip, WALK_Y, 0.34, "#C9C4BB");
  addBrickSlab(root, "plaza-e", mid, 0, strip, inner * 2, WALK_Y, 0.34, "#C9C4BB");
  addBrickSlab(root, "plaza-w", -mid, 0, strip, inner * 2, WALK_Y, 0.34, "#C9C4BB");
  addBrickSlab(root, "plaza-ring", 0, 0, inner * 2, inner * 2, WALK_Y, 0.34, "#FFB830");
  box(root, "cube-logo", [0, 1.4, 0], [2.2, 2.2, 2.2], "#111111");
  box(root, "cube-logo-in", [0, 1.4, 0], [1.4, 1.4, 1.4], "#FFB830");
  const monument: Aabb = { minX: -1.4, maxX: 1.4, minZ: -1.4, maxZ: 1.4 };
  colliders.push(monument);
}

function addConnectorRoads(root: pc.Entity) {
  const span = WORLD_HALF * 2;
  addBrickSlab(root, "road-x", 0, 0, span, 14, WALK_Y + 0.05, 0.36, "#4A4A4A");
  addBrickSlab(root, "road-z", 0, 0, 14, span, WALK_Y + 0.05, 0.36, "#4A4A4A");
  addLaneLines(root, "conn-x", 0, 0, span, 14, "ew", []);
  addLaneLines(root, "conn-z", 0, 0, 14, span, "ns", []);
}

function addMapWalls(root: pc.Entity, colliders: Aabb[]) {
  const half = WORLD_HALF;
  const thick = 2.6;
  const h = 8.2;
  const mid = half + thick / 2;
  const span = half * 2;
  const y = h / 2;
  const wall = "#6A6660";
  const cap = "#8C8780";
  const post = "#3F3C38";
  const inner = "#4E4A46";

  const segs: { name: string; pos: [number, number, number]; scale: [number, number, number] }[] = [
    { name: "n", pos: [0, y, mid], scale: [span + thick, h, thick] },
    { name: "s", pos: [0, y, -mid], scale: [span + thick, h, thick] },
    { name: "e", pos: [mid, y, 0], scale: [thick, h, span] },
    { name: "w", pos: [-mid, y, 0], scale: [thick, h, span] },
  ];
  for (const seg of segs) {
    box(root, `map-wall-${seg.name}`, seg.pos, seg.scale, wall);
    box(root, `map-wall-${seg.name}-cap`, [seg.pos[0], h + 0.14, seg.pos[2]], [seg.scale[0] + 0.35, 0.28, seg.scale[2] + 0.35], cap);
    colliders.push(aabbFrom(seg.pos, seg.scale));
  }

  box(root, "map-wall-in-n", [0, y, half + 0.12], [span, h * 0.92, 0.18], inner);
  box(root, "map-wall-in-s", [0, y, -(half + 0.12)], [span, h * 0.92, 0.18], inner);
  box(root, "map-wall-in-e", [half + 0.12, y, 0], [0.18, h * 0.92, span], inner);
  box(root, "map-wall-in-w", [-(half + 0.12), y, 0], [0.18, h * 0.92, span], inner);

  const step = 18;
  let n = 0;
  for (let t = -half; t <= half + 0.01; t += step) {
    for (const [x, z] of [
      [t, mid],
      [t, -mid],
      [mid, t],
      [-mid, t],
    ] as [number, number][]) {
      box(root, `map-wall-post-${n++}`, [x, y + 0.15, z], [1.15, h + 0.3, 1.15], post);
    }
  }
  for (const [x, z] of [
    [mid, mid],
    [mid, -mid],
    [-mid, mid],
    [-mid, -mid],
  ] as [number, number][]) {
    box(root, `map-wall-corner-${x}-${z}`, [x, y + 0.35, z], [2.1, h + 0.7, 2.1], post);
    box(root, `map-wall-corner-cap-${x}-${z}`, [x, h + 0.55, z], [2.35, 0.32, 2.35], cap);
  }
}

function buildCity(
  root: pc.Entity,
  theme: CityTheme,
  colliders: Aabb[],
  interactables: Interactable[],
  interiors: Map<string, pc.Entity>,
  npcs: NpcAgent[],
  seats: Seat[],
  nightWashes: pc.Entity[],
  lamps: LampPost[],
) {
  const b = CITY_BOUNDS[theme.id];
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const rand = mulberry(theme.tier * 997 + 42);
  const size = CITY_SIZE;
  const cell = size / GRID;
  const xs = Array.from({ length: GRID + 1 }, (_, i) => b.minX + i * cell);
  const zs = Array.from({ length: GRID + 1 }, (_, i) => b.minZ + i * cell);

  // Reach past the ring road and the wall beyond it, or the outermost strip of
  // pavement is missing and the skybox shows through.
  const paved = size + 2 * (ROAD_W / 2 + CITY_WALL_OUTSET + 2);
  box(root, `${theme.id}-dirt`, [cx, -0.36, cz], [paved + 4, 0.32, paved + 4], "#2A241C");
  addBrickSlab(root, `${theme.id}-walk`, cx, cz, paved, paved, WALK_Y, 0.4, theme.sidewalk);
  const lot = cell - ROAD_W - 0.8;
  const grout = shade(theme.sidewalk, -28);
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const lotX = b.minX + cell * (gx + 0.5);
      const lotZ = b.minZ + cell * (gz + 0.5);
      addGrout(root, `${theme.id}-lot-${gx}-${gz}`, lotX, lotZ, lot, lot, WALK_Y, grout, 2.1, 2.1);
      addLotCurb(root, `${theme.id}-curb-${gx}-${gz}`, lotX, lotZ, lot + 0.5, lot + 0.5);
    }
  }

  // Every north-south road crosses every east-west one, and each slab spans the
  // whole grid - so at each of the crossings the two are exactly coplanar, as
  // is the grout drawn on top of both. That is the flicker at the corners of an
  // intersection. The east-west set is dropped by the same centimetre used for
  // the connectors, which settles the depth test everywhere they meet and is
  // far too small to see as a step.
  for (let i = 0; i <= GRID; i++) {
    addBrickSlab(root, `${theme.id}-ns-${i}`, xs[i], cz, ROAD_W, size, WALK_Y + 0.05, 0.4, theme.road);
    addBrickSlab(root, `${theme.id}-ew-${i}`, cx, zs[i], size, ROAD_W, WALK_Y + 0.05 - LAYER_STEP, 0.4, theme.road);
    addLaneLines(root, `${theme.id}-ns-m-${i}`, xs[i], cz, ROAD_W, size, "ns", zs);
    addLaneLines(root, `${theme.id}-ew-m-${i}`, cx, zs[i], size, ROAD_W, "ew", xs, MARK_Y - LAYER_STEP);
  }

  addCrosswalks(root, theme, xs, zs);
  addCityWall(root, theme, colliders);

  const benches: Seat[] = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const lotX = b.minX + cell * (gx + 0.5);
      const lotZ = b.minZ + cell * (gz + 0.5);
      const landmark = LANDMARKS.find((l) => l.gx === gx && l.gz === gz);
      if (landmark) {
        placeLandmark(root, theme, `${theme.id}-${landmark.kind}`, lotX, lotZ, landmark.kind, colliders, interactables, interiors, seats);
        continue;
      }

      // Each lot draws from its own stream. Adding a rand() call here, or
      // changing an earlier lot, no longer reshuffles the rest of the city.
      const lotRand = mulberry(lotSeed(theme.id, gx, gz));

      const skip = lotRand() > theme.density;
      if (skip && theme.id === "gas") {
        addTree(root, lotX + 6, lotZ + 6, theme);
        addTree(root, lotX - 6, lotZ - 4, theme);
        continue;
      }
      if (skip) {
        addTree(root, lotX + 5, lotZ - 5, theme);
        continue;
      }

      const facing = avenueFacing(gx, gz);
      // Consume the draw so every later roll in this lot is unchanged, but take
      // the value from shared: the server prices homes by floors and the two
      // must agree exactly.
      lotRand();
      const floors = homeFloors(theme.id, gx, gz);
      const color = theme.building[Math.floor(lotRand() * theme.building.length)];
      // Identity is the lot coordinate, never a running counter. Homes are sold
      // to wallets by this id, so it must not move when world gen changes.
      const id = homeId(theme.id, gx, gz);
      placeBuilding(root, theme, id, lotX, lotZ, floors, color, lotRand, colliders, interactables, interiors, seats, facing);

      if (lotRand() > 0.45) {
        const bx = lotX + 6.4;
        const bz = lotZ + 7.2;
        addBench(root, bx, bz, 0, seats);
        benches.push(seats[seats.length - 1]);
      }
      if (theme.id === "valhalla" || lotRand() > 0.35) addStreetLamp(root, lotX - 8, lotZ - 8, theme.id === "valhalla" ? "#FFD700" : theme.accent, lamps);
      if (theme.id === "realworld") addNeonSign(root, lotX, lotZ, floors, theme);
      if (theme.id === "trench" && lotRand() > 0.55) addTree(root, lotX + 8, lotZ - 7, theme);
      addBollard(root, lotX + 8.2, lotZ - 5.4);
    }
  }

  addNpcs(root, theme, rand, npcs, cell, benches);
  addWorkNode(root, theme, interactables);
  nightWashes.push(addNightWash(root, theme, cx, cz));
}

function addLotCurb(root: pc.Entity, name: string, cx: number, cz: number, w: number, d: number) {
  const y = WALK_Y + 0.07;
  const h = 0.14;
  const t = 0.38;
  box(root, `${name}-n`, [cx, y, cz + d / 2], [w, h, t], "#D8D4CC");
  box(root, `${name}-s`, [cx, y, cz - d / 2], [w, h, t], "#D8D4CC");
  box(root, `${name}-e`, [cx + w / 2, y, cz], [t, h, d], "#D8D4CC");
  box(root, `${name}-w`, [cx - w / 2, y, cz], [t, h, d], "#D8D4CC");
}

function lineSegments(start: number, end: number, cuts: number[], gap: number): { mid: number; len: number }[] {
  const sorted = [...cuts].sort((a, b) => a - b);
  const marks = [start, ...sorted, end];
  const out: { mid: number; len: number }[] = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const from = marks[i] + (i === 0 ? 0.4 : gap);
    const to = marks[i + 1] - (i === marks.length - 2 ? 0.4 : gap);
    const len = to - from;
    if (len > 1.2) out.push({ mid: (from + to) / 2, len });
  }
  return out;
}

function addLaneLines(
  root: pc.Entity,
  name: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  axis: "ns" | "ew",
  cuts: number[],
  markY = MARK_Y,
) {
  const edge = ROAD_W / 2 - 0.55;
  const gap = ROAD_W / 2 + 0.55;
  let n = 0;
  if (axis === "ns") {
    const segs = lineSegments(cz - d / 2, cz + d / 2, cuts, gap);
    for (const s of segs) {
      box(root, `${name}-el-${n}`, [cx - edge, markY, s.mid], [0.18, 0.04, s.len], LINE);
      box(root, `${name}-er-${n}`, [cx + edge, markY, s.mid], [0.18, 0.04, s.len], LINE);
      n += 1;
    }
    n = 0;
    for (let z = cz - d / 2 + 2; z < cz + d / 2 - 2; z += 5) {
      if (cuts.some((c) => Math.abs(c - z) < gap)) continue;
      box(root, `${name}-d-${n++}`, [cx, markY, z], [0.34, 0.045, 2.5], "#FFFFFF");
    }
  } else {
    const segs = lineSegments(cx - w / 2, cx + w / 2, cuts, gap);
    for (const s of segs) {
      box(root, `${name}-el-${n}`, [s.mid, markY, cz - edge], [s.len, 0.04, 0.18], LINE);
      box(root, `${name}-er-${n}`, [s.mid, markY, cz + edge], [s.len, 0.04, 0.18], LINE);
      n += 1;
    }
    n = 0;
    for (let x = cx - w / 2 + 2; x < cx + w / 2 - 2; x += 5) {
      if (cuts.some((c) => Math.abs(c - x) < gap)) continue;
      box(root, `${name}-d-${n++}`, [x, markY, cz], [2.5, 0.045, 0.34], "#FFFFFF");
    }
  }
}

function addCrosswalks(root: pc.Entity, theme: CityTheme, xs: number[], zs: number[]) {
  let n = 0;
  for (let i = 1; i < xs.length - 1; i++) {
    for (let j = 1; j < zs.length - 1; j++) {
      const x = xs[i];
      const z = zs[j];
      for (const side of [-1, 1]) {
        for (let s = -3; s <= 3; s++) {
          box(root, `${theme.id}-cw-ns-${n}-${side}-${s}`, [x + s * 0.7, MARK_Y, z + side * 5.5], [0.4, 0.05, 2.3], "#FFFFFF");
          box(root, `${theme.id}-cw-ew-${n}-${side}-${s}`, [x + side * 5.5, MARK_Y, z + s * 0.7], [2.3, 0.05, 0.4], "#FFFFFF");
        }
      }
      n += 1;
    }
  }
}

/**
 * 5x7 block font. The renderer has no textures — every surface is an untextured
 * box — so sign lettering is built from geometry like everything else here.
 */
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#..##", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["#...#", "#...#", "#...#", "#####", "....#", "....#", "....#"],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

/** Direction the text advances so it reads left-to-right from outside the gate. */
type SignFace = { outward: [number, number]; run: [number, number] };

/**
 * Lays a line of text out as boxes on a vertical face. Runs of lit pixels in a
 * row are merged into one box, which roughly halves the entity count.
 */
function addBlockText(
  root: pc.Entity,
  name: string,
  text: string,
  opts: {
    x: number;
    y: number;
    z: number;
    face: SignFace;
    px: number;
    depth: number;
    standoff: number;
    color: string;
    emissive?: string;
    intensity?: number;
  },
) {
  const chars = text.toUpperCase().split("");
  const cols = chars.length * (GLYPH_W + 1) - 1;
  const { run, outward } = opts.face;
  const halfCols = (cols - 1) / 2;

  chars.forEach((ch, ci) => {
    const glyph = GLYPHS[ch] ?? GLYPHS[" "];
    const colBase = ci * (GLYPH_W + 1);
    for (let r = 0; r < GLYPH_H; r++) {
      const row = glyph[r];
      let c = 0;
      while (c < GLYPH_W) {
        if (row[c] !== "#") {
          c++;
          continue;
        }
        let end = c;
        while (end + 1 < GLYPH_W && row[end + 1] === "#") end++;
        const centreCol = colBase + (c + end) / 2;
        const len = (end - c + 1) * opts.px;
        const along = (centreCol - halfCols) * opts.px;
        const px = opts.x + run[0] * along + outward[0] * opts.standoff;
        const pz = opts.z + run[1] * along + outward[1] * opts.standoff;
        const py = opts.y + (3 - r) * opts.px;
        const scale: [number, number, number] =
          run[1] === 0 ? [len, opts.px, opts.depth] : [opts.depth, opts.px, len];
        box(root, `${name}-${ci}-${r}-${c}`, [px, py, pz], scale, opts.color, {
          emissive: opts.emissive,
          intensity: opts.intensity,
          glow: opts.emissive ? "sign" : undefined,
        });
        c = end + 1;
      }
    }
  });
}

const CITY_WALL_H = 6.2;
const CITY_WALL_T = 1.3;
/** Wide enough for two cars to pass through the gate side by side. */
const GATE_W = 13;

/**
 * A solid wall around each city, with an opening on each of the two edges that
 * face the middle of the map. It sits just inside the perimeter road, so the
 * ring road and its traffic stay outside the walls and the building lots are
 * untouched. Tier gating still applies, but now a player is turned away at a
 * gate they can see rather than at an invisible plane in the middle of a field.
 */
function addCityWall(root: pc.Entity, theme: CityTheme, colliders: Aabb[]) {
  const b = CITY_BOUNDS[theme.id];
  // Outside the perimeter ring road, so every street in the grid terminates at
  // another street rather than running into the wall.
  const out = CITY_WALL_OUTSET;
  const x0 = b.minX - out;
  const x1 = b.maxX + out;
  const z0 = b.minZ - out;
  const z1 = b.maxZ + out;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;

  // The gates face the central belt, so they line up with the roads that
  // already run between the districts.
  const { south: southGate, north: northGate, east: eastGate, west: westGate } = cityGates(theme.id);

  wallRun(root, colliders, theme, "s", "x", z0, x0, x1, southGate ? cx : null);
  wallRun(root, colliders, theme, "n", "x", z1, x0, x1, northGate ? cx : null);
  wallRun(root, colliders, theme, "w", "z", x0, z0, z1, westGate ? cz : null);
  wallRun(root, colliders, theme, "e", "z", x1, z0, z1, eastGate ? cz : null);

  // A viewer looking along -Z sees +X on their right, so each face runs its
  // text in the direction that reads correctly from outside the city.
  if (southGate) addGatehouse(root, theme, "s", cx, z0, "x", { outward: [0, -1], run: [-1, 0] });
  if (northGate) addGatehouse(root, theme, "n", cx, z1, "x", { outward: [0, 1], run: [1, 0] });
  if (westGate) addGatehouse(root, theme, "w", x0, cz, "z", { outward: [-1, 0], run: [0, 1] });
  if (eastGate) addGatehouse(root, theme, "e", x1, cz, "z", { outward: [1, 0], run: [0, -1] });

  // Pave the short run from each gate out to the connector road in the belt,
  // so the route in and out is a road rather than open ground.
  if (southGate) addGateApproach(root, theme, `${theme.id}-app-s`, cx, z0, "z");
  if (northGate) addGateApproach(root, theme, `${theme.id}-app-n`, cx, z1, "z");
  if (westGate) addGateApproach(root, theme, `${theme.id}-app-w`, x0, cz, "x");
  if (eastGate) addGateApproach(root, theme, `${theme.id}-app-e`, x1, cz, "x");
}

/** A slab from the gate line back to the world axis the connector road runs on. */
function addGateApproach(root: pc.Entity, theme: CityTheme, name: string, x: number, z: number, axis: "x" | "z") {
  if (axis === "z") {
    const len = Math.abs(z);
    if (len < 1) return;
    addBrickSlab(root, name, x, z / 2, ROAD_W, len, WALK_Y + 0.05 + LAYER_STEP, 0.4, theme.road);
  } else {
    const len = Math.abs(x);
    if (len < 1) return;
    addBrickSlab(root, name, x / 2, z, len, ROAD_W, WALK_Y + 0.05 + LAYER_STEP, 0.4, theme.road);
  }
}

function wallRun(
  root: pc.Entity,
  colliders: Aabb[],
  theme: CityTheme,
  name: string,
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  gapAt: number | null,
) {
  const stone = shade(theme.sidewalk, -58);
  const cap = shade(theme.sidewalk, -18);
  const spans: [number, number][] =
    gapAt == null
      ? [[from, to]]
      : [
          [from, gapAt - GATE_W / 2],
          [gapAt + GATE_W / 2, to],
        ];

  spans.forEach(([a, c], i) => {
    const len = c - a;
    if (len <= 0.6) return;
    const mid = (a + c) / 2;
    const pos: [number, number, number] =
      axis === "x" ? [mid, CITY_WALL_H / 2, fixed] : [fixed, CITY_WALL_H / 2, mid];
    const scale: [number, number, number] =
      axis === "x" ? [len, CITY_WALL_H, CITY_WALL_T] : [CITY_WALL_T, CITY_WALL_H, len];
    box(root, `${theme.id}-wall-${name}-${i}`, pos, scale, stone);
    box(
      root,
      `${theme.id}-wall-${name}-${i}-cap`,
      [pos[0], CITY_WALL_H + 0.18, pos[2]],
      [scale[0] + 0.34, 0.36, scale[2] + 0.34],
      cap,
    );
    colliders.push(aabbFrom(pos, scale));

    // Buttresses every so often so a long run does not read as a flat slab.
    const step = 16;
    const count = Math.floor(len / step);
    for (let n = 1; n <= count; n++) {
      const at = a + (len * n) / (count + 1);
      const bp: [number, number, number] =
        axis === "x" ? [at, CITY_WALL_H / 2, fixed] : [fixed, CITY_WALL_H / 2, at];
      const bs: [number, number, number] =
        axis === "x" ? [1.1, CITY_WALL_H + 0.5, CITY_WALL_T + 0.9] : [CITY_WALL_T + 0.9, CITY_WALL_H + 0.5, 1.1];
      box(root, `${theme.id}-wall-${name}-${i}-b${n}`, bp, bs, cap);
    }
  });
}

/** Pillars and a lintel framing the opening, in the city's accent colour. */
function addGatehouse(
  root: pc.Entity,
  theme: CityTheme,
  name: string,
  x: number,
  z: number,
  axis: "x" | "z",
  face: SignFace,
) {
  // Flank the opening rather than narrowing it — a car has to fit through.
  const half = GATE_W / 2 + 1.2;
  const h = CITY_WALL_H + 1.6;
  const towers: [number, number][] =
    axis === "x"
      ? [
          [x - half, z],
          [x + half, z],
        ]
      : [
          [x, z - half],
          [x, z + half],
        ];

  towers.forEach(([tx, tz], i) => {
    box(root, `${theme.id}-gate-${name}-t${i}`, [tx, h / 2, tz], [2.4, h, 2.4], shade(theme.sidewalk, -58));
    box(root, `${theme.id}-gate-${name}-t${i}-cap`, [tx, h + 0.3, tz], [3, 0.6, 3], theme.accent, {
      emissive: theme.accent,
      intensity: 1.6,
      glow: "sign",
    });
  });

  // Lintel spanning the opening, high enough to drive under.
  const span = GATE_W + 2.4;
  const lintelY = h - 0.9;
  const pos: [number, number, number] = [x, lintelY, z];
  const scale: [number, number, number] = axis === "x" ? [span, 1.1, CITY_WALL_T + 0.6] : [CITY_WALL_T + 0.6, 1.1, span];
  box(root, `${theme.id}-gate-${name}-lintel`, pos, scale, shade(theme.sidewalk, -30));

  // The sign above the opening. Board size is derived from the lettering rather
  // than guessed, so the longest name still sits inside its frame.
  const label = theme.shortName;
  const boardW = span * 0.86;
  const boardT = CITY_WALL_T + 0.9;
  const nameCols = label.length * (GLYPH_W + 1) - 1;
  const px = Math.min(0.2, (boardW - 0.9) / nameCols);
  const tier = `TIER ${CITIES[theme.id].tier}`;
  const tierPx = px * 0.62;
  const nameH = GLYPH_H * px;
  const tierH = GLYPH_H * tierPx;
  const gap = 0.16;
  const stackH = nameH + gap + tierH;
  const boardY = h + 1.5;
  const boardH = stackH + 0.72;

  box(
    root,
    `${theme.id}-gate-${name}-board`,
    [x, boardY, z],
    axis === "x" ? [boardW, boardH, boardT] : [boardT, boardH, boardW],
    shade(theme.sidewalk, -66),
  );
  for (const edge of [1, -1]) {
    box(
      root,
      `${theme.id}-gate-${name}-board-trim${edge > 0 ? "t" : "b"}`,
      [x, boardY + edge * (boardH / 2 + 0.13), z],
      axis === "x" ? [boardW + 0.3, 0.26, boardT + 0.24] : [boardT + 0.24, 0.26, boardW + 0.3],
      theme.accent,
      { emissive: theme.accent, intensity: 2.6, glow: "sign" },
    );
  }

  addBlockText(root, `${theme.id}-gate-${name}-text`, label, {
    x,
    y: boardY + (tierH + gap) / 2,
    z,
    face,
    px,
    depth: 0.22,
    standoff: boardT / 2 + 0.11,
    color: "#F6F2E8",
    emissive: "#FFF6DC",
    intensity: 2.2,
  });

  addBlockText(root, `${theme.id}-gate-${name}-tier`, tier, {
    x,
    y: boardY - (nameH + gap) / 2,
    z,
    face,
    px: tierPx,
    depth: 0.18,
    standoff: boardT / 2 + 0.1,
    color: theme.accent,
    emissive: theme.accent,
    intensity: 2.6,
  });
}

function placeLandmark(
  root: pc.Entity,
  theme: CityTheme,
  id: string,
  x: number,
  z: number,
  kind: LandmarkKind,
  colliders: Aabb[],
  interactables: Interactable[],
  interiors: Map<string, pc.Entity>,
  seats: Seat[],
) {
  if (kind === "townhouse") {
    const w = 14;
    const d = 11;
    const h = 8.4;
    box(root, id, [x, h / 2, z], [w, h, d], "#C4B49A");
    box(root, `${id}-base`, [x, 0.35, z + d / 2 + 0.6], [w + 1.4, 0.7, 2.2], "#A89880");
    // Columns flank the entrance in pairs. The centre one used to land squarely
    // in the doorway - which is also why real porticos have an even number.
    for (const i of [-2, -1, 1, 2]) {
      box(root, `${id}-col-${i}`, [x + i * 2.2, 2.6, z + d / 2 + 0.35], [0.42, 5.2, 0.42], "#E8DCC8");
    }
    box(root, `${id}-pediment`, [x, h + 0.7, z + 0.2], [w + 0.6, 1.4, d * 0.35], "#B7A48A");
    box(root, `${id}-clock`, [x, h + 0.7, z + d / 2 + 0.2], [1.3, 1.3, 0.16], "#FFF8E8", { emissive: "#FFE7A0", intensity: 1.4, glow: "sign" });
    box(root, `${id}-sign`, [x, 4.4, z + d / 2 + 0.55], [3.8, 0.7, 0.14], theme.accent, {
      emissive: theme.accent,
      intensity: 2,
      glow: "sign",
    });
    addEnterable(root, theme, id, x, z, w, d, h, colliders, interactables, interiors, seats, "townhall", "Town Hall", h + 2.2);
    return;
  }

  if (kind === "fashion") {
    // Narrower and taller than its neighbours, with a glazed front: a boutique
    // reads as a shopfront rather than a civic block.
    const w = 13;
    const d = 10;
    const h = 8.6;
    const face = z + d / 2;
    box(root, id, [x, h / 2, z], [w, h, d], "#2B2438");
    // Full-height display window either side of the door, lit from inside so
    // the building still reads at night.
    for (const side of [-1, 1]) {
      box(root, `${id}-glass-${side}`, [x + side * 3.5, 2.3, face + 0.08], [4.2, 4.2, 0.14], "#F3E4C9", {
        emissive: "#FFD9A0",
        intensity: 1.8,
        glow: "sign",
      });
      box(root, `${id}-mullion-${side}`, [x + side * 3.5, 2.3, face + 0.16], [0.16, 4.2, 0.1], "#1A1520");
    }
    box(root, `${id}-canopy`, [x, 4.8, face + 0.9], [w * 0.92, 0.26, 1.8], "#C9A227");
    for (const side of [-1, 1]) {
      box(root, `${id}-canopy-post-${side}`, [x + side * (w * 0.4), 2.4, face + 1.7], [0.14, 4.6, 0.14], "#C9A227");
    }
    // Vertical blade sign, the way a boutique announces itself down a street
    // rather than across its own frontage.
    box(root, `${id}-blade`, [x - w / 2 - 0.3, 6.1, face - 1.2], [0.2, 3.4, 1.5], "#C9A227", {
      emissive: "#F0C548",
      intensity: 3,
      glow: "sign",
    });
    box(root, `${id}-sign`, [x, 6.2, face + 0.12], [5.2, 0.9, 0.14], "#E8B34A", {
      emissive: "#E8B34A",
      intensity: 2.4,
      glow: "sign",
    });
    addEnterable(root, theme, id, x, z, w, d, h, colliders, interactables, interiors, seats, "fashion", "Fashion House", h + 2.2);
    return;
  }

  if (kind === "hospital") {
    const w = 16;
    const d = 12;
    const h = 9.2;
    box(root, id, [x, h / 2, z], [w, h, d], "#F2F4F7");
    box(root, `${id}-wing`, [x + 7.4, 3.2, z], [4.2, 6.4, 8], "#E4E8EE");
    // Rooftop cross, standing upright rather than lying flat. Laid out in the XZ
    // plane it only read from directly overhead, which is not where anyone is.
    const red = { emissive: "#FF4D6D", intensity: 4, glow: "sign" } as const;
    box(root, `${id}-cross-h`, [x, h + 2.1, z], [3.4, 0.8, 0.34], "#E11D48", red);
    box(root, `${id}-cross-v`, [x, h + 2.1, z], [0.8, 3.4, 0.34], "#E11D48", red);
    box(root, `${id}-cross-post`, [x, h + 0.3, z], [0.5, 1.2, 0.5], "#D0D5DC");

    // And one on the facade, at eye level from the street.
    const face = z + d / 2 + 0.14;
    box(root, `${id}-face-h`, [x, 7.1, face], [2.6, 0.72, 0.16], "#E11D48", red);
    box(root, `${id}-face-v`, [x, 7.1, face], [0.72, 2.6, 0.16], "#E11D48", red);

    box(root, `${id}-bay`, [x - 5.2, 1.1, z + d / 2 + 0.7], [4.4, 2.2, 1.6], "#D0D5DC");
    box(root, `${id}-sign`, [x, 5.1, z + d / 2 + 0.12], [4.6, 0.9, 0.16], "#E11D48", {
      emissive: "#FF4D6D",
      intensity: 3,
    });
    addEnterable(root, theme, id, x, z, w, d, h, colliders, interactables, interiors, seats, "hospital", "Hospital", h + 2.4);
    colliders.push(aabbFrom([x + 7.4, 3.2, z], [4.2, 6.4, 8]));
    // The ambulance bay juts out of the front and had no collider of its own,
    // so it was solid to look at and empty to drive through. It sits well clear
    // of the doorway at x, so making it solid blocks nobody's way in.
    colliders.push(aabbFrom([x - 5.2, 1.1, z + d / 2 + 0.7], [4.4, 2.2, 1.6]));
    return;
  }

  if (kind === "store") {
    const w = 12;
    const d = 10;
    const h = 6.4;
    box(root, id, [x, h / 2, z], [w, h, d], "#1A1612");
    box(root, `${id}-awning`, [x, 3.4, z + d / 2 + 0.7], [w + 0.4, 0.18, 1.6], theme.accent);
    box(root, `${id}-glass`, [x, 1.7, z + d / 2 + 0.08], [w * 0.72, 2.2, 0.12], "#9EC4D8", { emissive: "#B9D7E6", intensity: 0.6 });
    box(root, `${id}-door`, [x, 1.3, z + d / 2 + 0.12], [1.7, 2.4, 0.16], "#111");
    box(root, `${id}-sign`, [x, 4.6, z + d / 2 + 0.18], [5.2, 0.9, 0.16], theme.accent, {
      emissive: theme.accent,
      intensity: 4,
    });
    box(root, `${id}-neon`, [x, h + 0.35, z], [4.8, 0.22, 0.5], theme.accent, { emissive: theme.accent, intensity: 5 });
    addEnterable(root, theme, id, x, z, w, d, h, colliders, interactables, interiors, seats, "store", "Store", h + 2.2);
    return;
  }

  if (kind === "park") {
    addPark(root, theme, id, x, z, seats, colliders);
    return;
  }

  if (kind === "dealer") {
    addDealership(root, theme, id, x, z, colliders, interactables, interiors, seats);
    return;
  }

  // Bigger than the store it often sits near, smaller than the hospital, which
  // stays the largest thing on a block. The detailing below is anchored to w, d
  // and h rather than to fixed coordinates, so it grows with the shell - only
  // the roof furniture keeps its own size, which is what roof furniture does.
  const w = 15;
  const d = 12;
  const h = 8.2;
  box(root, id, [x, h / 2, z], [w, h, d], "#1E3A5F");
  box(root, `${id}-stripe`, [x, 2.4, z + d / 2 + 0.05], [w * 0.92, 0.35, 0.12], "#F8FAFC");
  box(root, `${id}-lights`, [x, h + 0.28, z], [4.6, 0.28, 0.7], "#111");
  box(root, `${id}-light-r`, [x - 1.1, h + 0.42, z], [1.1, 0.22, 0.5], "#EF4444", { emissive: "#EF4444", intensity: 6 });
  box(root, `${id}-light-b`, [x + 1.1, h + 0.42, z], [1.1, 0.22, 0.5], "#3B82F6", { emissive: "#3B82F6", intensity: 6 });
  box(root, `${id}-antenna`, [x + 4.4, h + 1.6, z - 2], [0.12, 3.2, 0.12], "#9CA3AF");
  box(root, `${id}-badge`, [x, 4.6, z + d / 2 + 0.1], [1.2, 1.2, 0.14], "#FBBF24", { emissive: "#FBBF24", intensity: 2 });
  box(root, `${id}-sign`, [x, 5.6, z + d / 2 + 0.12], [4.2, 0.7, 0.14], "#111827");
  addEnterable(root, theme, id, x, z, w, d, h, colliders, interactables, interiors, seats, "police", "Police Station", h + 2.2);
}

function addEnterable(
  root: pc.Entity,
  theme: CityTheme,
  id: string,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  colliders: Aabb[],
  interactables: Interactable[],
  interiors: Map<string, pc.Entity>,
  seats: Seat[],
  kind: InteriorKind,
  label?: string,
  labelY?: number,
) {
  const pos: [number, number, number] = [x, h / 2, z];
  colliders.push(aabbFrom(pos, [w, h, d]));
  const doorX = x;
  const doorZ = z + d / 2 + 0.8;
  box(root, `${id}-door`, [doorX, 1.1, z + d / 2 + 0.06], [1.4, 2.2, 0.12], "#1A1A1A");
  attachInterior(root, theme, id, x, z, doorX, doorZ, kind, interiors, interactables, seats, 2.4, label, labelY);
}

export type Facing = { fx: -1 | 0 | 1; fz: -1 | 0 | 1 };

/**
 * Buildings front onto the nearest of the two main avenues - the central
 * north-south and east-west roads that the city gates open onto. A lot turns
 * toward whichever avenue it is closer to, so both main streets are lined with
 * frontage and the blocks either side of an avenue face each other across it.
 *
 * Because the chosen direction always points inward, a building can never end
 * up fronting onto the perimeter wall. That is a property of the rule rather
 * than a filter applied afterwards.
 */
function avenueFacing(gx: number, gz: number): Facing {
  const mid = (GRID - 1) / 2;
  const dx = Math.abs(gx - mid);
  const dz = Math.abs(gz - mid);
  if (dx < dz) return { fx: gx < mid ? 1 : -1, fz: 0 };
  return { fx: 0, fz: gz < mid ? 1 : -1 };
}

function placeBuilding(
  root: pc.Entity,
  theme: CityTheme,
  id: string,
  x: number,
  z: number,
  floors: number,
  color: string,
  rand: () => number,
  colliders: Aabb[],
  interactables: Interactable[],
  interiors: Map<string, pc.Entity>,
  seats: Seat[],
  facing: Facing,
) {
  const w = 8 + rand() * 4;
  const d = 8 + rand() * 3;
  const h = floors * 3.1;
  const pos: [number, number, number] = [x, h / 2, z];
  box(root, id, pos, [w, h, d], color);
  colliders.push(aabbFrom(pos, [w, h, d]));

  // The facade is built against whichever face the building fronts onto, so
  // depth and width swap roles when it faces along X.
  const alongX = facing.fx !== 0;
  const half = alongX ? w / 2 : d / 2;
  const across = alongX ? d : w;
  const faceScale = (widthAcross: number, height: number, thickness: number): [number, number, number] =>
    alongX ? [thickness, height, widthAcross] : [widthAcross, height, thickness];
  const at = (out: number, side: number): [number, number] => [
    pos[0] + facing.fx * out + (alongX ? 0 : side),
    pos[2] + facing.fz * out + (alongX ? side : 0),
  ];

  const windowHex = theme.window;
  for (let f = 0; f < floors; f++) {
    const wy = 1.1 + f * 3.1;
    const [w1x, w1z] = at(half + 0.04, 0);
    box(root, `${id}-w1-${f}`, [w1x, wy, w1z], faceScale(across * 0.28, 1.2, 0.08), windowHex, {
      emissive: theme.emissive,
      intensity: 5,
      glow: "windows",
    });
    const [w2x, w2z] = at(half + 0.04, across * 0.22);
    box(root, `${id}-w2-${f}`, [w2x, wy, w2z], faceScale(across * 0.22, 1.2, 0.08), windowHex, {
      emissive: theme.emissive,
      intensity: 5,
      glow: "windows",
    });
  }

  if (theme.id !== "gas" || rand() > 0.4) {
    const [awX, awZ] = at(half + 0.5, 0);
    box(root, `${id}-awning`, [awX, 2.3, awZ], faceScale(across * 0.7, 0.18, 1.2), theme.accent);
  }

  const [slabX, slabZ] = at(half + 0.06, 0);
  box(root, `${id}-door`, [slabX, 1.1, slabZ], faceScale(1.2, 2.1, 0.1), "#1A1A1A");
  const [doorX, doorZ] = at(half + 0.8, 0);
  // No label - homes are unnamed - but labelY still anchors the for-sale tag above the roof.
  attachInterior(root, theme, id, pos[0], pos[2], doorX, doorZ, "home", interiors, interactables, seats, 2.2, undefined, h + 2.4, facing);
}

function attachInterior(
  root: pc.Entity,
  theme: CityTheme,
  id: string,
  x: number,
  z: number,
  doorX: number,
  doorZ: number,
  kind: InteriorKind,
  interiors: Map<string, pc.Entity>,
  interactables: Interactable[],
  seats: Seat[],
  radius: number,
  label?: string,
  labelY?: number,
  facing: Facing = { fx: 0, fz: 1 },
) {
  // A home's interior is sized and furnished by what it cost; everything else
  // has one fixed layout.
  const { grade, luxury } = kind === "home" ? homeGradeById(id) : { grade: 0, luxury: 0 };
  const layout = interiorLayout(kind, luxury);
  const y = 80 + theme.tier * 12;
  const interior = new pc.Entity(`${id}-interior`);
  interior.setPosition(x, y, z);
  interior.enabled = false;
  root.addChild(interior);
  fillInterior(interior, kind, theme, luxury, grade);
  interiors.set(id, interior);

  interactables.push({
    kind: "door",
    id,
    x: doorX,
    z: doorZ,
    radius,
    city: theme.id,
    interior: { x, y: y + 0.1, z },
    obstacles: interiorObstacles(kind, layout).map((s) => ({
      minX: x + s.x - s.halfW,
      maxX: x + s.x + s.halfW,
      minZ: z + s.z - s.halfD,
      maxZ: z + s.z + s.halfD,
    })),
    platforms: interiorPlatforms(kind).map((s) => ({
      minX: x + s.x - s.halfW,
      maxX: x + s.x + s.halfW,
      minZ: z + s.z - s.halfD,
      maxZ: z + s.z + s.halfD,
      y: y + 0.1 + s.top,
    })),
    exterior: { x: doorX + facing.fx * 1.4, y: WALK_Y, z: doorZ + facing.fz * 1.4 },
    label,
    labelY,
    interiorKind: kind,
    halfW: layout.halfW - 0.55,
    halfD: layout.halfD - 0.55,
    ceiling: layout.height,
    spawnZ: layout.spawnZ,
  });
  for (const seat of interiorSeats(kind, layout)) {
    seats.push({
      x: x + seat.x,
      z: z + seat.z,
      yaw: seat.yaw,
      // Sitting drops the body so the hips meet the seat; lying puts the whole
      // body on top of the surface, so the offset would sink it into the bed.
      sitY: y + seat.top - (seat.lie ? 0 : SIT_HIP),
      lie: Boolean(seat.lie),
    });
  }
}

/** Open green block: lawn, paths, trees, benches and a fountain. No facade. */
function addPark(
  root: pc.Entity,
  theme: CityTheme,
  id: string,
  x: number,
  z: number,
  seats: Seat[],
  colliders: Aabb[],
) {
  const size = LOT_SIZE;
  const half = size / 2;
  const grass = theme.id === "gas" ? "#2F6B4F" : theme.id === "valhalla" ? "#3E7D4E" : "#2E7D46";
  box(root, `${id}-lawn`, [x, WALK_Y + 0.02, z], [size, 0.16, size], grass);

  // Crossing gravel paths, so the block still reads as walkable.
  const path = shade(theme.sidewalk, -10);
  box(root, `${id}-path-ns`, [x, WALK_Y + 0.11, z], [3.2, 0.06, size], path);
  box(root, `${id}-path-ew`, [x, WALK_Y + 0.11, z], [size, 0.06, 3.2], path);

  // Fountain at the crossing.
  box(root, `${id}-fountain-base`, [x, WALK_Y + 0.35, z], [5.2, 0.7, 5.2], shade(theme.sidewalk, -34));
  box(root, `${id}-fountain-water`, [x, WALK_Y + 0.62, z], [4.2, 0.22, 4.2], "#4FA8D8", {
    emissive: "#7FD4FF",
    intensity: 0.9,
  });
  box(root, `${id}-fountain-post`, [x, WALK_Y + 1.5, z], [0.7, 2.2, 0.7], shade(theme.sidewalk, -34));
  box(root, `${id}-fountain-top`, [x, WALK_Y + 2.7, z], [2.1, 0.3, 2.1], shade(theme.sidewalk, -20));
  colliders.push(aabbFrom([x, 1, z], [5.2, 2, 5.2]));

  // Trees in the four quadrants, benches facing the paths.
  const off = half * 0.55;
  for (const [tx, tz] of [
    [-off, -off],
    [off, -off],
    [-off, off],
    [off, off],
  ] as [number, number][]) {
    addTree(root, x + tx, z + tz, theme);
    addTree(root, x + tx * 0.45, z + tz, theme);
  }
  addBench(root, x - 4.6, z + 3.4, 0, seats);
  addBench(root, x + 4.6, z - 3.4, Math.PI, seats);
  addBench(root, x + 3.4, z + 4.6, -Math.PI / 2, seats);

  for (const [lx, lz] of [
    [-half + 3, -half + 3],
    [half - 3, half - 3],
  ] as [number, number][]) {
    addStreetLamp(root, x + lx, z + lz, theme.accent);
  }
}

/** Cars on display around a small sales office. Buying happens at each car. */
function addDealership(
  root: pc.Entity,
  theme: CityTheme,
  id: string,
  x: number,
  z: number,
  colliders: Aabb[],
  interactables: Interactable[],
  interiors: Map<string, pc.Entity>,
  seats: Seat[],
) {
  const size = LOT_SIZE;
  const half = size / 2;
  box(root, `${id}-apron`, [x, WALK_Y + 0.03, z], [size, 0.14, size], shade(theme.sidewalk, -46));

  // Office at the back of the lot so the display cars front the street.
  const w = 11;
  const d = 7;
  const h = 4.6;
  const officeZ = z - half + d / 2 + 1.2;
  box(root, id, [x, h / 2, officeZ], [w, h, d], shade(theme.building[0], 18));
  box(root, `${id}-glass`, [x, 1.9, officeZ + d / 2 + 0.08], [w * 0.72, 2.4, 0.12], "#9EC4D8", {
    emissive: "#B9D7E6",
    intensity: 0.7,
  });
  box(root, `${id}-sign`, [x, h + 0.6, officeZ], [w * 0.8, 1.1, 0.2], theme.accent, {
    emissive: theme.accent,
    intensity: 4,
    glow: "sign",
  });
  addEnterable(root, theme, id, x, officeZ, w, d, h, colliders, interactables, interiors, seats, "store", "Car Lot", h + 2.4);

  // Bunting posts along the street edge. Spread is derived from the lot so they
  // stay on the forecourt instead of standing in the road.
  const postCount = 5;
  const postSpread = half - 1.6;
  for (let i = 0; i < postCount; i++) {
    const t = (i / (postCount - 1)) * 2 - 1;
    box(root, `${id}-post-${i}`, [x + t * postSpread, 2.2, z + half - 1.2], [0.16, 4.4, 0.16], shade(theme.sidewalk, -40));
  }

  // One row across the front, facing the street. A second row would back into
  // the office, and the widest body is 2.28 so this keeps a margin either side.
  const carSpread = half - 2.4;
  const carZ = z + half - 7;
  DEALER_STOCK.forEach((spec, i) => {
    const t = DEALER_STOCK.length === 1 ? 0 : (i / (DEALER_STOCK.length - 1)) * 2 - 1;
    const cx = x + t * carSpread;
    createVehicle(root, {
      id: `${id}-display-${i}`,
      x: cx,
      z: carZ,
      rotY: 0,
      color: spec.color,
      kind: spec.kind,
    });
    colliders.push({ minX: cx - 1.3, maxX: cx + 1.3, minZ: carZ - 2.9, maxZ: carZ + 2.9 });
    interactables.push({
      kind: "buy-car",
      id: `${theme.id}-car-${spec.kind}`,
      x: cx,
      z: carZ + 3.6,
      radius: 3.2,
      city: theme.id,
      label: `${spec.name} - ${spec.price} ${CURRENCY}`,
      labelY: 3.2,
      carKind: spec.kind,
      carColor: spec.color,
      carPrice: spec.price,
    });
  });
}

function addTree(root: pc.Entity, x: number, z: number, theme: CityTheme) {
  box(root, `tree-t-${x}-${z}`, [x, 0.6, z], [0.5, 1.2, 0.5], "#3F2A14");
  const leaf = theme.id === "gas" ? "#3D6EAE" : "#2F9E44";
  box(root, `tree-l-${x}-${z}`, [x, 1.8, z], [1.6, 1.6, 1.6], leaf);
}

function addStreetLamp(root: pc.Entity, x: number, z: number, color: string, lamps?: LampPost[]) {
  box(root, `lamp-${x}-${z}`, [x, 1.6, z], [0.18, 3.2, 0.18], "#111");
  box(root, `lamp-h-${x}-${z}`, [x, 3.3, z], [0.7, 0.2, 0.7], color, { emissive: color, intensity: 2.4, glow: "sign" });
  // The pool of light on the road. Additive geometry rather than a real light:
  // there are dozens of lamps, clustered lighting is off, and a lamp that only
  // glows at the top leaves the street looking unlit.
  lightPool(root, `lamp-p-${x}-${z}`, [x, WALK_Y + 0.03, z], 4.2, color);
  lamps?.push({ x, z, color });
}

function addNeonSign(root: pc.Entity, x: number, z: number, floors: number, theme: CityTheme) {
  box(root, `neon-${x}-${z}`, [x, floors * 3.1 + 0.4, z + 5], [3.4, 0.7, 0.2], theme.emissive, {
    emissive: theme.emissive,
    intensity: 8,
    glow: "sign",
  });
}

/**
 * A tinted plane that gives each district its own night colour.
 *
 * Lightened now that the lamps throw pools onto the road: the darker tints were
 * compensating for streets that had no light sources at all, and they crushed
 * the pools into invisibility.
 */
function addNightWash(root: pc.Entity, theme: CityTheme, cx: number, cz: number) {
  const tint = theme.id === "realworld" ? "#16301F" : theme.id === "trench" ? "#241436" : theme.id === "gas" ? "#111F2E" : "#241F12";
  const e = box(root, `${theme.id}-night`, [cx, WALK_Y + 0.015, cz], [CITY_SIZE, 0.008, CITY_SIZE], tint);
  e.enabled = theme.night;
  return e;
}

function addBench(root: pc.Entity, x: number, z: number, yaw: number, seats: Seat[]) {
  const e = new pc.Entity(`bench-${x}-${z}`);
  e.setPosition(x, WALK_Y, z);
  e.setEulerAngles(0, yaw, 0);
  root.addChild(e);
  box(e, "seat", [0, 0.42, 0], [1.6, 0.12, 0.52], "#8B6914");
  box(e, "back", [0, 0.72, -0.22], [1.6, 0.52, 0.1], "#8B6914");
  box(e, "leg-l", [-0.65, 0.2, 0], [0.1, 0.4, 0.42], "#6B4423");
  box(e, "leg-r", [0.65, 0.2, 0], [0.1, 0.4, 0.42], "#6B4423");
  const rad = (yaw * Math.PI) / 180;
  seats.push({
    x: x - Math.sin(rad) * 0.08,
    z: z - Math.cos(rad) * 0.08,
    yaw: rad,
    sitY: WALK_Y + 0.48 - SIT_HIP,
    lie: false,
  });
}

function addBollard(root: pc.Entity, x: number, z: number) {
  box(root, `bollard-${x}-${z}`, [x, WALK_Y + 0.28, z], [0.28, 0.56, 0.28], "#8A8A8A");
}


function addNpcs(
  root: pc.Entity,
  theme: CityTheme,
  rand: () => number,
  npcs: NpcAgent[],
  cell: number,
  benches: Seat[],
) {
  const b = CITY_BOUNDS[theme.id];
  const looks: Appearance[] = [
    { bodyType: "regular", skinTone: "#F6D7B0", outfit: "hoodie", pantsColor: "#1E3A8A", shoe: "sneakers", shoeColor: "#F8FAFC", headwear: "cap", accessories: ["glasses"] },
    { bodyType: "slim", skinTone: "#C68642", outfit: "trench-coat", pantsColor: "#1C1917", shoe: "boots", shoeColor: "#78350F", headwear: "none", accessories: ["chain"] },
    { bodyType: "broad", skinTone: "#E8B878", outfit: "overalls", pantsColor: "#1E3A8A", shoe: "boots", shoeColor: "#111111", headwear: "hardhat", accessories: [] },
    { bodyType: "regular", skinTone: "#8D5524", outfit: "jersey", pantsColor: "#111827", shoe: "slides", shoeColor: "#B91C1C", headwear: "cap", accessories: ["watch"] },
    { bodyType: "regular", skinTone: "#D4A017", outfit: "puffer", pantsColor: "#14532D", shoe: "loafers", shoeColor: "#111111", headwear: "beanie", accessories: ["backpack", "earbuds"] },
  ];

  const loops: { x: number; z: number }[][] = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const x0 = b.minX + gx * cell + 6.4;
      const x1 = b.minX + (gx + 1) * cell - 6.4;
      const z0 = b.minZ + gz * cell + 6.4;
      const z1 = b.minZ + (gz + 1) * cell - 6.4;
      loops.push([
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
      ]);
    }
  }

  const count = theme.id === "gas" ? 7 : 11;
  for (let i = 0; i < count; i++) {
    const look = looks[i % looks.length];
    const entity = createCitizen(root, look, `${theme.id}-npc-${i}`);
    const agent: NpcAgent = {
      entity,
      waypoints: [],
      i: 0,
      wait: rand() * 1.5,
      speed: 1.7 + rand() * 1.1,
      hold: "idle",
      health: 100,
      hitUntil: 0,
      yaw: 0,
    };

    if (i === 0 && benches[0]) {
      const bench = benches[0];
      entity.setPosition(bench.x, bench.sitY, bench.z);
      entity.setEulerAngles(0, (bench.yaw * 180) / Math.PI, 0);
      agent.hold = "sit";
      agent.wait = 9999;
    } else if (i === 1) {
      const door = { x: b.spawn[0] + 4, z: b.spawn[2] - 2 };
      entity.setPosition(door.x, WALK_Y, door.z);
      entity.setEulerAngles(0, 180, 0);
      agent.hold = "wave";
      agent.waypoints = [
        door,
        { x: door.x + 10, z: door.z },
        { x: door.x + 10, z: door.z + 12 },
        { x: door.x, z: door.z + 12 },
      ];
    } else {
      const loop = loops[i % loops.length].map((p) => ({ ...p }));
      if (i % 2 === 1) loop.reverse();
      agent.waypoints = loop;
      agent.i = Math.floor(rand() * loop.length);
      const start = loop[agent.i];
      entity.setPosition(start.x, WALK_Y, start.z);
      if (i === 2) {
        agent.pet = spawnPet(root, "mutt", `${theme.id}-dog`);
        agent.pet.entity.setPosition(start.x, WALK_Y, start.z - 1.1);
      }
    }

    npcs.push(agent);
  }

  addNpcDrivers(root, theme, rand, npcs, cell, looks);
}

const NPC_CARS: Record<CityId, { color: string; kind: string }[]> = {
  trench: [
    { color: "#7C3AED", kind: "hatch" },
    { color: "#E5E7EB", kind: "sedan" },
  ],
  gas: [{ color: "#3B82F6", kind: "sedan" }],
  realworld: [
    { color: "#EA580C", kind: "hatch" },
    { color: "#166534", kind: "suv" },
  ],
  valhalla: [
    { color: "#FFB830", kind: "sport" },
    { color: "#111827", kind: "sedan" },
  ],
};

function addNpcDrivers(
  root: pc.Entity,
  theme: CityTheme,
  rand: () => number,
  npcs: NpcAgent[],
  cell: number,
  looks: Appearance[],
) {
  const cars = NPC_CARS[theme.id];
  for (let i = 0; i < cars.length; i++) {
    const clockwise = i % 2 === 0;
    const ring = i === 0 ? 0 : 1;
    const loop = cityRoadLoop(theme.id, cell, ring, clockwise);
    const startAt = Math.floor(rand() * loop.length);
    const from = loop[startAt];
    const to = loop[(startAt + 1) % loop.length];
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    const spec = cars[i];
    const car = createVehicle(root, {
      id: `${theme.id}-npc-car-${i}`,
      x: from.x,
      z: from.z,
      rotY: yaw,
      color: spec.color,
      kind: spec.kind,
    });
    const look = looks[(i + 2) % looks.length];
    const entity = createCitizen(root, look, `${theme.id}-driver-${i}`);
    car.addChild(entity);
    const seat = driverSeat(spec.kind);
    entity.setLocalPosition(-0.42, seat.y, 0.16);
    entity.setLocalScale(seat.scale, seat.scale, seat.scale);
    entity.setLocalEulerAngles(0, 0, 0);
    applyCitizenMotion(entity, "sit", 0);
    npcs.push({
      entity,
      vehicle: car,
      vehicleKind: spec.kind,
      waypoints: loop,
      i: startAt,
      wait: 0,
      speed: 7.8 + rand() * 3.4,
      hold: "sit",
      health: 100,
      hitUntil: 0,
      yaw,
    });
  }
}

function cityRoadLoop(city: CityId, cell: number, ring: number, clockwise: boolean) {
  const b = CITY_BOUNDS[city];
  const r = Math.max(0, Math.min(1, ring));
  const x0 = b.minX + r * cell;
  const x1 = b.minX + (GRID - r) * cell;
  const z0 = b.minZ + r * cell;
  const z1 = b.minZ + (GRID - r) * cell;
  const lane = clockwise ? 2.15 : -2.15;
  const corners = [
    { x: x0 + lane, z: z0 - lane },
    { x: x1 + lane, z: z0 - lane },
    { x: x1 + lane, z: z1 + lane },
    { x: x0 - lane, z: z1 + lane },
  ];
  const loop = clockwise ? corners : [...corners].reverse();
  const mid: { x: number; z: number }[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const c = loop[(i + 1) % loop.length];
    mid.push(a, { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 });
  }
  return mid;
}

function addWorkNode(root: pc.Entity, theme: CityTheme, interactables: Interactable[]) {
  const b = CITY_BOUNDS[theme.id];
  const x = b.spawn[0] + 8;
  const z = b.spawn[2] - 8;
  box(root, `${theme.id}-work`, [x, 0.8, z], [1.6, 1.6, 1.6], theme.accent, {
    emissive: theme.accent,
    intensity: 3,
  });
  interactables.push({ kind: "work", id: `${theme.id}-work`, x, z, radius: 2.4, city: theme.id });
}

function shade(hex: string, delta: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, v + delta));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
