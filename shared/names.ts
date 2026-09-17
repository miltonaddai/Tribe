/**
 * Display names are unique, because they are the identity players actually see.
 *
 * Nametags, the friends list and the map roster all show a name, and the game
 * moves real value between players - trades, whispers, home sales in $TRIBE. Two
 * players sharing a name makes impersonating someone's friend a working scam.
 *
 * Uniqueness alone would not achieve much, though. "Milton" and "milton" are
 * different strings, and so are "milton", "milt0n" and "rnilton" - which read
 * identically on a nametag. So a name is stored as typed and *compared* by its
 * normalized key, and the character set is deliberately narrow: letters, digits
 * and underscore only. Rejecting everything else at the door removes most
 * lookalike attacks without needing a confusables table.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/** Names nobody may claim, because they read as authority. */
const RESERVED_WORDS = [
  "admin", "administrator", "mod", "moderator", "staff", "support", "help",
  "system", "server", "official", "tribe", "tribute", "team", "owner", "root",
  "null", "undefined", "anonymous", "everyone", "here",
];

/**
 * Characters that read as one another at nametag size, each group folded to a
 * single canonical letter so "milt0n" cannot sit next to "milton".
 *
 * Whole groups, not pairs: "1" reads as both "l" and "i", so mapping 1 -> l
 * still leaves "adm1n" distinct from "admin". Folding 1, l and i together
 * catches every spelling. Letters map too, which is why "milton" keys to
 * "miiton" - the key is lossy on purpose and never shown.
 */
const CONFUSABLE: Record<string, string> = {
  "0": "o",
  "1": "i", l: "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
};

/**
 * Characters that take up no space, or none that can be seen: control codes,
 * zero-width joiners, directional overrides, the byte-order mark.
 *
 * Tested by codepoint rather than matched by a regex class on purpose. Writing
 * these as escapes inside a character class invites a tool somewhere in the
 * chain to helpfully interpret them, and a source file that contains a literal
 * NUL looks fine right up until an editor silently strips it.
 */
function invisible(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    c < 0x20 ||
    c === 0x7f ||
    (c >= 0x200b && c <= 0x200f) ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2060 && c <= 0x206f) ||
    c === 0xfeff
  );
}

function stripInvisible(raw: string): string {
  return [...raw].filter((ch) => !invisible(ch)).join("");
}

/**
 * The form two names are compared by. Never shown to anyone - it is lossy on
 * purpose, and the name as typed is what gets displayed.
 */
export function nameKey(raw: string): string {
  let key = stripInvisible(raw.normalize("NFKC")).trim().toLowerCase();
  key = [...key].map((ch) => CONFUSABLE[ch] ?? ch).join("");
  // "rn" reads as "m" in most UI fonts at nametag size.
  return key.replace(/rn/g, "m").replace(/_/g, "");
}

/**
 * Held in key form, built through nameKey rather than written out. Writing the
 * words directly would silently fail for any that contain a folded character -
 * "official" keys to "officiai", so a literal entry would never match.
 */
const RESERVED = new Set(RESERVED_WORDS.map(nameKey));

export type NameProblem = "short" | "long" | "charset" | "reserved";

/** Null when the name is acceptable, otherwise why it is not. */
export function checkName(raw: string): NameProblem | null {
  const trimmed = raw.trim();
  if (trimmed.length < NAME_MIN) return "short";
  if (trimmed.length > NAME_MAX) return "long";
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) return "charset";
  if (RESERVED.has(nameKey(trimmed))) return "reserved";
  return null;
}

export function nameProblemText(problem: NameProblem): string {
  switch (problem) {
    case "short":
      return `Names need at least ${NAME_MIN} characters.`;
    case "long":
      return `Names can be at most ${NAME_MAX} characters.`;
    case "charset":
      return "Letters, numbers and underscores only.";
    case "reserved":
      return "That name is reserved.";
  }
}

/**
 * What the in-game currency is called on screen.
 *
 * It is the $TRIBE token itself, so the label is the ticker rather than a
 * separate name - a player holding TRIBE in their wallet should see TRIBE in
 * the game. Kept in one place so it cannot drift between the HUD, the store,
 * the notice text and the inbox.
 */
export const CURRENCY = "TRIBE";

export const HOME_NAME_MAX = 24;

/**
 * Cleans a name an owner gives their home.
 *
 * Deliberately looser than player names: a house name is decoration, not an
 * identity anyone can be impersonated through, so it needs no uniqueness and no
 * confusable folding. It still gets trimmed, length-capped and stripped of
 * anything invisible, which could otherwise draw outside the sign.
 *
 * Returns "" when nothing usable is left, which clears the name.
 */
export function cleanHomeName(raw: string): string {
  return cleanText(raw, HOME_NAME_MAX);
}

/**
 * Normalizes a free-text field: no invisible characters, no runs of
 * whitespace, trimmed, and hard-capped.
 *
 * Shared by every player-authored string that is shown to other people but is
 * not an identity - home names, crime report notes. It does not judge content;
 * it only guarantees the text occupies the space it appears to and cannot draw
 * outside its box or smuggle direction overrides into a list.
 */
export function cleanText(raw: string, max: number): string {
  return stripInvisible(raw.normalize("NFKC")).replace(/\s+/g, " ").trim().slice(0, max);
}
