/**
 * The game was called "The Block" before it was called Tribe, and its saved data
 * was namespaced to match. Characters, settings and the wallet session all live
 * in localStorage, so renaming the keys without moving the values would silently
 * wipe every existing player.
 *
 * Runs before React mounts, because the wallet and character stores read straight
 * from localStorage during their first render.
 */
const PREFIXES: [string, string][] = [
  ["the-block:", "tribe:"],
  ["the-block.", "tribe."],
];

export function migrateLegacyStorage() {
  try {
    for (const [from, to] of PREFIXES) {
      // Snapshot the keys first: we delete as we go.
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(from)) continue;
        const value = localStorage.getItem(key);
        const renamed = to + key.slice(from.length);
        // Never clobber a newer value that is already under the new name.
        if (value !== null && localStorage.getItem(renamed) === null) {
          localStorage.setItem(renamed, value);
        }
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Private windows and blocked site data can throw on any access. Losing the
    // migration only costs the player their saved character, so never throw here.
  }
}
