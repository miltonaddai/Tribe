/**
 * Crime reports: the station blotter.
 *
 * A player inside a police station can file a report, and anyone else inside a
 * station in the same city can read what has been filed in the last 72 hours.
 * It is a record, not a mechanic - filing changes nothing about the accused,
 * who is neither notified nor penalised. That is deliberate: a report that
 * carried consequences would be a weapon, and the first thing players would do
 * is point it at each other.
 *
 * The shape is fixed rather than free-form. An offence comes from this list, the
 * accused is a name, and the note is short and capped. A durable board attached
 * to wallets and readable by strangers is the likeliest place for scam links to
 * appear, and structure is what keeps it a blotter instead of a billboard.
 */

export const OFFENCES = [
  { id: "assault", label: "Assault" },
  { id: "armed_assault", label: "Armed assault" },
  { id: "theft", label: "Theft" },
  { id: "trespass", label: "Trespass" },
  { id: "scam", label: "Scam or fraud" },
  { id: "reckless", label: "Reckless driving" },
  { id: "other", label: "Other" },
] as const;

export type OffenceId = (typeof OFFENCES)[number]["id"];

const OFFENCE_IDS = new Set<string>(OFFENCES.map((o) => o.id));

export function isOffenceId(id: string): id is OffenceId {
  return OFFENCE_IDS.has(id);
}

export function offenceLabel(id: string): string {
  return OFFENCES.find((o) => o.id === id)?.label ?? "Incident";
}

/** Long enough to say what happened, short enough not to become a message board. */
export const REPORT_NOTE_MAX = 120;

/** How far back the station board reaches. */
export const REPORT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Anti-spam, enforced server-side. A board is only readable while it is mostly
 * signal, and one player filing repeatedly is the cheapest way to drown it.
 */
export const REPORT_COOLDOWN_MS = 30_000;
export const REPORT_MAX_PER_WINDOW = 20;

/** Most recent first, which is the order the board renders. */
export type CrimeReport = {
  id: string;
  city: string;
  offence: OffenceId;
  reporterName: string;
  /** Empty when the report names nobody, which is allowed. */
  accusedName: string;
  note: string;
  /** Epoch ms. */
  at: number;
};

/** "12m ago", "3h ago" - the board never shows a date, since nothing on it is
 *  older than three days. */
export function agoLabel(at: number, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
