/**
 * Clears what earlier versions of the game left in localStorage.
 *
 * The game was called The Block, then Tribe, and saved characters, settings and
 * sessions under those names. Those players were wiped with the move to
 * accounts, so their keys are dropped rather than carried over: a stale
 * character keyed to an identity that no longer exists can only confuse the
 * create and play pages.
 *
 * Runs before React mounts, because the session and character stores read
 * straight from localStorage during their first render.
 */
const LEGACY_PREFIXES = ["the-block:", "the-block.", "tribe:", "tribe."];

export function migrateLegacyStorage() {
  try {
    // Snapshot the keys first: we delete as we go.
    for (const key of Object.keys(localStorage)) {
      if (LEGACY_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch {
    // Private windows and blocked site data can throw on any access. Nothing
    // here is worth failing the page over.
  }
}
