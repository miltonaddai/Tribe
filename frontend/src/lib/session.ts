import { cityFromBalance, DEFAULT_CHAIN, type AccountSession, type CharacterRecord, type CityId, type WalletChainId } from "@block/shared";
import { apiUrl, assertJson, authHeaders } from "./api";
import { bucksThresholds } from "./cityThresholds";
import { hydrateCharacter, saveCharacter } from "./storage";

/**
 * Who is playing.
 *
 * The game runs as an offline sandbox: there is no sign-in. A player picks a
 * name and the local game server hands back the profile with that name,
 * creating it the first time. Block Bucks are simulated - a balance the server keeps
 * in its local database.
 */
export type Session = {
  /** What every game table is keyed by: `acct:<uuid>`, or `demo:<n>` in dev. */
  playerId: string;
  username: string;
  /** Sent to the API and the game room to say who is playing. Empty for demo players. */
  token: string;
  /** Block Bucks, as of the last refresh. */
  balance: number;
  city: CityId;
  demo: boolean;
  chain: WalletChainId;
};

const KEY = "block:session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.playerId || !parsed.username) return null;
    return { ...parsed, chain: DEFAULT_CHAIN };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function shorten(address: string) {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

type ProfileResponse = {
  ok?: boolean;
  error?: string;
  created?: boolean;
  session?: AccountSession;
  character?: CharacterRecord | null;
  balance?: number;
  city?: CityId;
};

function adopt(body: ProfileResponse): Session {
  if (!body.session) throw new Error(body.error ?? "Something went wrong. Try again.");
  const session: Session = {
    playerId: body.session.playerId,
    username: body.session.username,
    token: body.session.token,
    balance: body.balance ?? 0,
    city: body.city ?? "trenches",
    demo: false,
    chain: DEFAULT_CHAIN,
  };
  saveSession(session);
  // A returning name brings back its character from the local server.
  const existing = hydrateCharacter(body.character);
  if (existing) saveCharacter({ ...existing, wallet: session.playerId, displayName: session.username });
  return session;
}

/**
 * Plays as `username`: the existing profile with that name, or a new one.
 * `created` says which, so the caller can send a new player to character creation.
 */
export async function playAs(username: string): Promise<{ session: Session; created: boolean; hasCharacter: boolean }> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/accounts/play"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username }),
    });
  } catch {
    throw new Error("Cannot reach the local game server. Start it with `yarn dev:backend`.");
  }
  assertJson(res);
  const body = (await res.json()) as ProfileResponse;
  if (!body.ok) throw new Error(body.error ?? "Could not start playing.");
  return { session: adopt(body), created: Boolean(body.created), hasCharacter: Boolean(body.character) };
}

/**
 * Re-reads the stored profile and its simulated balance. Null means the local
 * database no longer has it (it was reset), so the player picks a name again.
 */
export async function refreshSession(): Promise<Session | null> {
  const current = loadSession();
  if (!current || current.demo) return current;
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/accounts/me"), { headers: authHeaders() });
  } catch {
    // Server not up yet: keep what we have.
    return current;
  }
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) return current;
  try {
    assertJson(res);
    const body = (await res.json()) as ProfileResponse;
    return body.session ? adopt(body) : current;
  } catch {
    return current;
  }
}

/** For the name form: is the name allowed, and is there already a profile with it? */
export async function checkUsername(name: string): Promise<{ valid: boolean; exists: boolean; reason: string | null }> {
  try {
    const res = await fetch(apiUrl(`/api/accounts/check?username=${encodeURIComponent(name)}`));
    if (!res.ok) return { valid: true, exists: false, reason: null };
    return (await res.json()) as { valid: boolean; exists: boolean; reason: string | null };
  } catch {
    return { valid: true, exists: false, reason: null };
  }
}

/** `held` is Block Bucks, matching the demo:<n> holdings the server reads back. */
export function connectDemo(held = 150_000, username = "citizen"): Session {
  const session: Session = {
    playerId: `demo:${held}`,
    username,
    token: "",
    balance: held,
    city: cityFromBalance(held, bucksThresholds()),
    demo: true,
    chain: DEFAULT_CHAIN,
  };
  saveSession(session);
  return session;
}
