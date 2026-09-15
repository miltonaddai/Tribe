/**
 * Area-of-interest bookkeeping.
 *
 * Players are bucketed into a coarse grid so each client only has to consider
 * the handful of cells around it, rather than every other player in the world.
 * Without this the per-tick cost is O(clients x players) — 250,000 distance
 * checks at 500 players — and the view sync becomes the new bottleneck.
 */

export type Positioned = { x: number; z: number };

/** One city block. Big enough that the 7x7 scan stays small, small enough to filter well. */
export const CELL_SIZE = 32;

/**
 * Enter at IN, leave at OUT. The gap stops a player walking a boundary from
 * thrashing in and out of view, which would churn entities on every client
 * that can see them.
 */
export const AOI_IN = 70;
export const AOI_OUT = 95;

const cellKey = (x: number, z: number) => `${Math.floor(x / CELL_SIZE)}:${Math.floor(z / CELL_SIZE)}`;

export class SpatialGrid<T extends Positioned> {
  private cells = new Map<string, T[]>();

  rebuild(items: Iterable<T>) {
    this.cells.clear();
    for (const item of items) {
      const key = cellKey(item.x, item.z);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(item);
      else this.cells.set(key, [item]);
    }
  }

  /** Everything in the cells overlapping a square of `radius` around a point. */
  near(x: number, z: number, radius: number): T[] {
    const span = Math.ceil(radius / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const out: T[] = [];
    for (let i = cx - span; i <= cx + span; i++) {
      for (let j = cz - span; j <= cz + span; j++) {
        const bucket = this.cells.get(`${i}:${j}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
}

/** True once inside AOI_IN, still true until past AOI_OUT. */
export function shouldSee(distance: number, alreadyVisible: boolean) {
  return alreadyVisible ? distance <= AOI_OUT : distance <= AOI_IN;
}
