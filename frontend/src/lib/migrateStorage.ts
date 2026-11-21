/**
 * Brings localStorage written by earlier versions of the game up to date.
 *
 * - The game was called Moonville, then Block, and saved its session,
 *   characters, settings and speaker choice under `moonville:` / `block:` keys
 *   (and `moonville.` / `block.` for the speaker). It is Tribe now, so those
 *   move to `tribe:` / `tribe.` - same values, new names - and a returning
 *   player keeps their character. A key already present under the new name
 *   wins, so this is safe to run on every load.
 * - Older still, the game was The Block. Those players were wiped long ago, so
 *   their keys are simply dropped. (Tribe was also an early name, but `tribe:`
 *   is the current prefix again, so nothing under it is ever dropped.)
 *
 * Runs before React mounts, because the session and character stores read
 * straight from localStorage during their first render.
 */
const RENAMED_PREFIXES: [from: string, to: string][] = [
  ["moonville:", "tribe:"],
  ["moonville.", "tribe."],
  ["block:", "tribe:"],
  ["block.", "tribe."],
];

const DROPPED_PREFIXES = ["the-block:", "the-block."];

/** A saved character's balance used to be called `moon`; it is `bucks` now. */
function renameBalanceField(key: string, value: string): string {
  if (!key.startsWith("tribe:character")) return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && "moon" in parsed && !("bucks" in parsed)) {
      parsed.bucks = parsed.moon;
      delete parsed.moon;
      return JSON.stringify(parsed);
    }
  } catch {
    // Not JSON: carry it over untouched.
  }
  return value;
}

export function migrateLegacyStorage() {
  try {
    // Snapshot the keys first: we add and delete as we go.
    for (const key of Object.keys(localStorage)) {
      if (DROPPED_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
        continue;
      }
      const rename = RENAMED_PREFIXES.find(([from]) => key.startsWith(from));
      if (!rename) continue;
      const next = rename[1] + key.slice(rename[0].length);
      const value = localStorage.getItem(key);
      if (value !== null && localStorage.getItem(next) === null) {
        localStorage.setItem(next, renameBalanceField(next, value));
      }
      localStorage.removeItem(key);
    }
  } catch {
    // Private windows and blocked site data can throw on any access. Nothing
    // here is worth failing the page over.
  }
}
