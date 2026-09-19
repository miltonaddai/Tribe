/**
 * The hospital ward: where a player wakes up after being downed.
 *
 * Bed positions live here rather than in the renderer because both sides need
 * them and neither owns them. The server allocates a bed by index - it has no
 * idea where the furniture is - and the client turns that index into a place to
 * lie down. One list, so a bed can never be assigned where there is no bed.
 */

/** How long it takes to get back to full health, flat on your back. */
export const RECOVERY_MS = 30_000;

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

export const HOSPITAL_BED_COUNT = HOSPITAL_BEDS.length;

/** -1 means every bed is taken and the patient recovers on their feet. */
export const NO_BED = -1;
