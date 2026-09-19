/**
 * The hospital ward. Nobody is put in these beds - being downed spits you out
 * on the pavement at full health - but a player can lie on one with C, and the
 * list is what keeps the lying spot on a mattress rather than beside it.
 */

/**
 * Beds along the east wall of the ward, in interior-local coordinates.
 *
 * `yaw` points at the pillow, matching how lying down works everywhere else:
 * the body is laid out from the feet towards the head, so the head ends up at
 * the wall and the patient faces down the ward.
 */
export const HOSPITAL_BEDS: { x: number; z: number; yaw: number; top: number }[] = [
  { x: 10.0, z: -7.5, yaw: Math.PI / 2, top: 1.04 },
  { x: 10.0, z: -4.5, yaw: Math.PI / 2, top: 1.04 },
  { x: 10.0, z: -1.5, yaw: Math.PI / 2, top: 1.04 },
  { x: 10.0, z: 1.5, yaw: Math.PI / 2, top: 1.04 },
  { x: 10.0, z: 4.5, yaw: Math.PI / 2, top: 1.04 },
  { x: 10.0, z: 7.5, yaw: Math.PI / 2, top: 1.04 },
];

/** Centre of the bed frame for a slot - the geometry, not the lying spot. */
export function bedFrameX(): number {
  // The body lies from its feet at HOSPITAL_BEDS[i].x towards the head, so the
  // frame sits further along that axis than the spot a patient is placed at.
  return 11.2;
}
