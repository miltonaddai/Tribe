/**
 * Whether this device can actually play Moonville.
 *
 * The game is built around a keyboard and a mouse: WASD to walk, right-drag to
 * turn the camera, pointer lock to aim, and a HUD that assumes a wide screen. A
 * phone has none of that, so letting one in produces a session where the player
 * can look around and do almost nothing else - worse than a clear refusal.
 */

/** Narrower than this and the HUD panels overlap the play area entirely. */
export const MIN_PLAY_WIDTH = 900;

export type Blocked = "touch" | "narrow" | null;

/**
 * Null when the device can play, otherwise why not.
 *
 * Touch is tested with `(pointer: coarse) and (hover: none)` rather than by
 * sniffing the user agent or by width alone. Width catches a phone but also
 * catches a desktop window dragged narrow, and a laptop with a touchscreen is
 * `pointer: coarse` yet perfectly able to play - it is the *absence of hover*
 * that identifies a device with no mouse at all.
 *
 * The two reasons are kept apart because they are not equally final: a narrow
 * window is something the player can fix from where they are standing, and the
 * message should say so rather than turning them away.
 */
export function playBlock(): Blocked {
  if (typeof window === "undefined") return null;
  const touchOnly =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  if (touchOnly) return "touch";
  if (window.innerWidth < MIN_PLAY_WIDTH) return "narrow";
  return null;
}
