import { randomUUID } from "node:crypto";
import { ACCOUNT_PREFIX, checkName, nameKey, nameProblemText, type AccountSession } from "@block/shared";
import { getDb } from "./localDb";

/**
 * Sandbox profiles.
 *
 * There is no authentication: a player picks a name and plays as it. Picking a
 * name that already exists plays as that profile, which is how you come back to
 * a character - and how you test as several people from several browser tabs.
 *
 * The player id (`acct:<uuid>`) is what every game table is keyed by, and it is
 * also the "token" the client sends back. Nothing is signed; this is for a
 * local, offline sandbox only.
 */

type AccountRow = {
  id: string;
  username: string;
  username_key: string;
};

export type AccountResult =
  | { ok: true; session: AccountSession }
  | { ok: false; status: number; error: string; problem?: string };

function playerIdOf(id: string) {
  return `${ACCOUNT_PREFIX}${id}`;
}

/** The uuid inside a player id, or null when it is not an account id. */
export function accountIdOf(playerId: string): string | null {
  if (!playerId.startsWith(ACCOUNT_PREFIX)) return null;
  const id = playerId.slice(ACCOUNT_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function toSession(row: AccountRow): AccountSession {
  const playerId = playerIdOf(row.id);
  return { playerId, username: row.username, token: playerId };
}

async function findByKey(key: string): Promise<AccountRow | null> {
  const { data, error } = await getDb().from("accounts").select("*").eq("username_key", key).maybeSingle();
  if (error) console.warn(`[db] find account failed: ${error.message}`);
  return (data as AccountRow | null) ?? null;
}

async function findById(id: string): Promise<AccountRow | null> {
  const { data, error } = await getDb().from("accounts").select("*").eq("id", id).maybeSingle();
  if (error) console.warn(`[db] fetch account failed: ${error.message}`);
  return (data as AccountRow | null) ?? null;
}

/** True when no profile has this name yet. */
export async function usernameAvailable(username: string): Promise<boolean> {
  return (await findByKey(nameKey(username))) === null;
}

/** Plays as this name: the existing profile if there is one, a new one if not. */
export async function playAs(username: unknown): Promise<AccountResult & { created?: boolean }> {
  const name = typeof username === "string" ? username.trim() : "";
  const problem = checkName(name);
  if (problem) return { ok: false, status: 400, error: nameProblemText(problem), problem };

  const key = nameKey(name);
  const existing = await findByKey(key);
  const db = getDb();
  if (existing) {
    void db.from("accounts").update({ last_login_at: new Date().toISOString() }).eq("id", existing.id);
    return { ok: true, session: toSession(existing), created: false };
  }

  const row: AccountRow = { id: randomUUID(), username: name, username_key: key };
  const { error } = await db.from("accounts").insert({ ...row, last_login_at: new Date().toISOString() });
  if (error) {
    console.warn(`[db] create account failed: ${error.message}`);
    return { ok: false, status: 500, error: "Could not create that profile. Try again." };
  }
  return { ok: true, session: toSession(row), created: true };
}

/** The profile behind a player id, or null. */
export async function accountSession(playerId: string): Promise<AccountSession | null> {
  const id = accountIdOf(playerId);
  if (!id) return null;
  const row = await findById(id);
  return row ? toSession(row) : null;
}

/** The token is the player id. Resolves it to the profile it names. */
export async function sessionFromToken(token: unknown): Promise<{ playerId: string; username: string } | null> {
  if (typeof token !== "string" || !token) return null;
  const session = await accountSession(token.trim());
  return session ? { playerId: session.playerId, username: session.username } : null;
}

/** Reads `Authorization: Bearer <player id>`. */
export async function sessionFromHeader(header: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match ? sessionFromToken(match[1]) : null;
}
