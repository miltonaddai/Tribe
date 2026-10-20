import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  ACCOUNT_PREFIX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  checkName,
  nameKey,
  nameProblemText,
  type AccountSession,
} from "@moonville/shared";
import { getSupabase } from "./supabase";

/**
 * Username accounts.
 *
 * Anyone can play with a username and password; a Solana wallet is linked later
 * and only matters for paying and for $MOON-gated districts. The account's
 * player id (`acct:<uuid>`) is what every game table is keyed by - it sits in
 * the columns that used to hold a wallet address.
 *
 * Usernames follow the display-name rules in shared/names.ts and ARE the
 * player's nametag. Two separate unique names - one to log in, one to show -
 * would let a character borrow someone else's login name.
 */

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Signs session tokens. Must be set and stable in production: a random
 * per-boot secret logs everyone out on every restart.
 */
const SESSION_SECRET = (() => {
  const raw = (process.env.SESSION_SECRET ?? "").trim();
  if (raw.length >= 32) return raw;
  console.warn(
    "[moonville] SESSION_SECRET is unset or shorter than 32 characters - using a random one. " +
      "Every restart will sign everyone out. Set it in .env.",
  );
  return randomBytes(32).toString("hex");
})();

type AccountRow = {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  solana_address: string | null;
};

/**
 * Used only when Supabase is not configured, so the game still runs locally.
 * Gone on restart, which is fine for a laptop and never true in production.
 */
const memory = new Map<string, AccountRow>();
let warnedMemory = false;
function memoryStore() {
  if (!warnedMemory) {
    console.warn("[moonville] Supabase is not configured - accounts are kept in memory and lost on restart.");
    warnedMemory = true;
  }
  return memory;
}

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

// --- passwords ---------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Spent on unknown usernames so a login's timing does not reveal which exist. */
const DUMMY_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

/**
 * Stored for accounts created with a wallet and no password. Not a hash of
 * anything, so no password can ever match it; the column stays NOT NULL.
 */
const NO_PASSWORD = "none";

function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

// --- session tokens ----------------------------------------------------------

type TokenClaims = { pid: string; u: string; exp: number };

function sign(payload: string) {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function issueToken(playerId: string, username: string): string {
  const claims: TokenClaims = { pid: playerId, u: username, exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `v1.${payload}.${sign(payload)}`;
}

/**
 * Stateless: the signature is the check. Logging out forgets the token on the
 * client; a stolen token is good until it expires, which is the trade for not
 * needing a session table read on every request.
 */
export function verifySessionToken(token: unknown): { playerId: string; username: string } | null {
  if (typeof token !== "string") return null;
  const [version, payload, signature] = token.split(".");
  if (version !== "v1" || !payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
    if (typeof claims.pid !== "string" || typeof claims.u !== "string" || claims.exp < Date.now()) return null;
    return { playerId: claims.pid, username: claims.u };
  } catch {
    return null;
  }
}

/** Reads `Authorization: Bearer <token>`. */
export function sessionFromHeader(header: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match ? verifySessionToken(match[1].trim()) : null;
}

function toSession(row: AccountRow): AccountSession {
  const playerId = playerIdOf(row.id);
  return {
    playerId,
    username: row.username,
    token: issueToken(playerId, row.username),
    solanaAddress: row.solana_address,
  };
}

// --- brute-force guard -------------------------------------------------------

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; since: number }>();

function lockedOut(key: string) {
  const rec = failures.get(key);
  if (!rec) return false;
  if (rec.since < Date.now() - FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return rec.count >= MAX_FAILURES;
}

function noteFailure(key: string) {
  const rec = failures.get(key);
  if (!rec || rec.since < Date.now() - FAILURE_WINDOW_MS) failures.set(key, { count: 1, since: Date.now() });
  else rec.count += 1;
}

// --- storage -----------------------------------------------------------------

async function findByKey(key: string): Promise<AccountRow | null | "error"> {
  const supabase = getSupabase();
  if (!supabase) return [...memoryStore().values()].find((r) => r.username_key === key) ?? null;
  const { data, error } = await supabase.from("accounts").select("*").eq("username_key", key).maybeSingle();
  if (error) {
    console.warn(`[supabase] find account failed: ${error.message}`);
    return "error";
  }
  return (data as AccountRow | null) ?? null;
}

async function findById(id: string): Promise<AccountRow | null> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore().get(id) ?? null;
  const { data, error } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (error) console.warn(`[supabase] fetch account failed: ${error.message}`);
  return (data as AccountRow | null) ?? null;
}

/** True when a name is free, with no account check. Used by the live form. */
export async function usernameAvailable(username: string): Promise<boolean> {
  const found = await findByKey(nameKey(username));
  return found === null;
}

// --- public API --------------------------------------------------------------

export async function registerAccount(username: unknown, password: unknown): Promise<AccountResult> {
  const name = typeof username === "string" ? username.trim() : "";
  const problem = checkName(name);
  if (problem) return { ok: false, status: 400, error: nameProblemText(problem), problem };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { ok: false, status: 400, error: pwProblem, problem: "password" };

  const key = nameKey(name);
  const existing = await findByKey(key);
  if (existing === "error") return { ok: false, status: 503, error: "Accounts are unavailable. Try again." };
  if (existing) return { ok: false, status: 409, error: "That username is taken.", problem: "taken" };

  return createAccount(name, key, await hashPassword(password as string), null);
}

/** Inserts an account row. Both sign-up paths end here. */
async function createAccount(
  name: string,
  key: string,
  passwordHash: string,
  solanaAddress: string | null,
): Promise<AccountResult> {
  const row: AccountRow = {
    id: randomUUID(),
    username: name,
    username_key: key,
    password_hash: passwordHash,
    solana_address: solanaAddress,
  };

  const supabase = getSupabase();
  if (!supabase) {
    const store = memoryStore();
    if (solanaAddress && [...store.values()].some((r) => r.solana_address === solanaAddress)) {
      return { ok: false, status: 409, error: "That wallet is already linked to an account." };
    }
    store.set(row.id, row);
    return { ok: true, session: toSession(row) };
  }
  const { error } = await supabase.from("accounts").insert(row);
  if (error) {
    // 23505: a unique index refused it - the name, or the wallet, was taken
    // between the check and the insert.
    if (error.code === "23505") {
      return error.message.includes("solana")
        ? { ok: false, status: 409, error: "That wallet is already linked to an account." }
        : { ok: false, status: 409, error: "That username is taken.", problem: "taken" };
    }
    console.warn(`[supabase] create account failed: ${error.message}`);
    return { ok: false, status: 503, error: "Could not create the account. Try again." };
  }
  return { ok: true, session: toSession(row) };
}

export async function loginAccount(username: unknown, password: unknown, ip: string): Promise<AccountResult> {
  const name = typeof username === "string" ? username.trim() : "";
  if (!name || typeof password !== "string" || !password) {
    return { ok: false, status: 400, error: "Enter your username and password." };
  }
  const key = nameKey(name);
  const guard = `${ip}|${key}`;
  if (lockedOut(guard)) {
    return { ok: false, status: 429, error: "Too many attempts. Wait a few minutes and try again." };
  }

  const row = await findByKey(key);
  if (row === "error") return { ok: false, status: 503, error: "Accounts are unavailable. Try again." };
  // A wallet-only account has no password to match. It is checked against the
  // dummy like an unknown name, so neither the answer nor the time it takes
  // says which accounts sign in by wallet.
  const hasPassword = Boolean(row && row.password_hash !== NO_PASSWORD);
  const valid = await checkPassword(password, hasPassword && row ? row.password_hash : DUMMY_HASH);
  if (!row || !hasPassword || !valid) {
    noteFailure(guard);
    return { ok: false, status: 401, error: "Wrong username or password." };
  }
  failures.delete(guard);

  const supabase = getSupabase();
  if (supabase) {
    void supabase.from("accounts").update({ last_login_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { ok: true, session: toSession(row) };
}

/** The account behind a verified session, with a fresh token. */
export async function accountSession(playerId: string): Promise<AccountSession | null> {
  const id = accountIdOf(playerId);
  if (!id) return null;
  const row = await findById(id);
  return row ? toSession(row) : null;
}

/** The Solana wallet an account has linked, or null. */
export async function linkedWallet(playerId: string): Promise<string | null> {
  const id = accountIdOf(playerId);
  if (!id) return null;
  return (await findById(id))?.solana_address ?? null;
}

export async function setLinkedWallet(
  playerId: string,
  address: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const id = accountIdOf(playerId);
  if (!id) return { ok: false, status: 400, error: "Not an account." };

  // An account with no password signs in only with its wallet. Unlinking it
  // would leave no way back in, so it can be swapped for another but not removed.
  if (!address && (await findById(id))?.password_hash === NO_PASSWORD) {
    return {
      ok: false,
      status: 409,
      error: "This account signs in with its wallet, so it can't be unlinked. Link a different wallet instead.",
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    const store = memoryStore();
    const row = store.get(id);
    if (!row) return { ok: false, status: 404, error: "Account not found." };
    if (address && [...store.values()].some((r) => r.id !== id && r.solana_address === address)) {
      return { ok: false, status: 409, error: "That wallet is already linked to another account." };
    }
    row.solana_address = address;
    return { ok: true };
  }
  const { error } = await supabase.from("accounts").update({ solana_address: address }).eq("id", id);
  if (error) {
    // One wallet, one account: otherwise a single wallet's holdings could
    // unlock districts for any number of accounts.
    if (error.code === "23505") return { ok: false, status: 409, error: "That wallet is already linked to another account." };
    console.warn(`[supabase] link wallet failed: ${error.message}`);
    return { ok: false, status: 503, error: "Could not link the wallet. Try again." };
  }
  return { ok: true };
}

// --- signing in with a wallet ------------------------------------------------

async function findBySolana(address: string): Promise<AccountRow | null | "error"> {
  const supabase = getSupabase();
  if (!supabase) return [...memoryStore().values()].find((r) => r.solana_address === address) ?? null;
  const { data, error } = await supabase.from("accounts").select("*").eq("solana_address", address).maybeSingle();
  if (error) {
    console.warn(`[supabase] find account by wallet failed: ${error.message}`);
    return "error";
  }
  return (data as AccountRow | null) ?? null;
}

/**
 * Proof that a wallet signed a sign-in message, for the follow-up step when
 * that wallet has no account yet: the player then names a new account or
 * claims an existing one, without being asked to sign a second time.
 *
 * Short-lived and single-use, so a ticket that leaks cannot be spent later.
 */
const TICKET_TTL_MS = 10 * 60 * 1000;
const spentTickets = new Map<string, number>();

/**
 * "wt1": a wallet signed in but has no account (subject: the wallet address).
 * "rt1": a wallet proved it owns an account to recover (subject: account id).
 * The kind is part of what is signed, so one can never be spent as the other.
 */
type TicketKind = "wt1" | "rt1";

function issueTicket(kind: TicketKind, subject: string): string {
  const payload = Buffer.from(JSON.stringify({ a: subject, exp: Date.now() + TICKET_TTL_MS })).toString("base64url");
  return `${kind}.${payload}.${sign(`${kind}.${payload}`)}`;
}

const issueWalletTicket = (address: string) => issueTicket("wt1", address);
const redeemWalletTicket = (ticket: unknown) => redeemTicket("wt1", ticket);

function redeemTicket(kind: TicketKind, ticket: unknown): string | null {
  if (typeof ticket !== "string") return null;
  const [version, payload, signature] = ticket.split(".");
  if (version !== kind || !payload || !signature) return null;
  const expected = Buffer.from(sign(`${kind}.${payload}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let claims: { a?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.a !== "string" || typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
  const now = Date.now();
  for (const [t, exp] of spentTickets) if (exp < now) spentTickets.delete(t);
  if (spentTickets.has(ticket)) return null;
  spentTickets.set(ticket, claims.exp);
  return claims.a;
}

export type WalletSignInResult =
  | { ok: true; session: AccountSession }
  | { ok: false; needsAccount: true; ticket: string }
  | { ok: false; status: number; error: string };

/**
 * After the wallet's signature has been verified: sign in to the account it is
 * linked to, or hand back a ticket to create or claim one.
 */
export async function signInWithWallet(address: string): Promise<WalletSignInResult> {
  const row = await findBySolana(address);
  if (row === "error") return { ok: false, status: 503, error: "Accounts are unavailable. Try again." };
  if (!row) return { ok: false, needsAccount: true, ticket: issueWalletTicket(address) };
  const supabase = getSupabase();
  if (supabase) {
    void supabase.from("accounts").update({ last_login_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { ok: true, session: toSession(row) };
}

const BAD_TICKET: AccountResult = {
  ok: false,
  status: 401,
  error: "That wallet sign-in has expired. Connect your wallet again.",
};

/** A new account owned by a wallet. A username, no password. */
export async function registerWithWallet(ticket: unknown, username: unknown): Promise<AccountResult> {
  const name = typeof username === "string" ? username.trim() : "";
  const problem = checkName(name);
  if (problem) return { ok: false, status: 400, error: nameProblemText(problem), problem };
  const key = nameKey(name);
  const existing = await findByKey(key);
  if (existing === "error") return { ok: false, status: 503, error: "Accounts are unavailable. Try again." };
  if (existing) return { ok: false, status: 409, error: "That username is taken.", problem: "taken" };
  // Redeemed only once the name is known to be free, so a taken name does not
  // burn the ticket and force the player to sign again.
  const address = redeemWalletTicket(ticket);
  if (!address) return BAD_TICKET;
  return createAccount(name, key, NO_PASSWORD, address);
}

/**
 * An existing username account takes this wallet: the password proves the
 * account, the ticket proves the wallet. From then on the wallet alone signs in.
 */
export async function claimWithWallet(
  ticket: unknown,
  username: unknown,
  password: unknown,
  ip: string,
): Promise<AccountResult> {
  const login = await loginAccount(username, password, ip);
  if (!login.ok) return login;
  const address = redeemWalletTicket(ticket);
  if (!address) return BAD_TICKET;
  const linked = await setLinkedWallet(login.session.playerId, address);
  if (!linked.ok) return linked;
  const session = await accountSession(login.session.playerId);
  return session ? { ok: true, session } : { ok: false, status: 503, error: "Could not load the account. Try again." };
}

// --- account recovery ----------------------------------------------------------

/**
 * Accounts have no email, so a linked wallet is the recovery key: whoever can
 * sign with the wallet linked to an account may set that account a new password.
 *
 * Two steps, so the player sees which account they are about to recover before
 * choosing a password: the signature buys a single-use ticket naming the
 * account, and the ticket buys the password change.
 */
export type RecoveryStart =
  | { ok: true; ticket: string; username: string }
  | { ok: false; status: number; error: string };

export async function startRecovery(address: string): Promise<RecoveryStart> {
  const row = await findBySolana(address);
  if (row === "error") return { ok: false, status: 503, error: "Accounts are unavailable. Try again." };
  if (!row) {
    return {
      ok: false,
      status: 404,
      error:
        "That wallet isn't linked to any account, so it can't recover one. Try the wallet you linked in Settings.",
    };
  }
  return { ok: true, ticket: issueTicket("rt1", row.id), username: row.username };
}

export async function finishRecovery(ticket: unknown, password: unknown): Promise<AccountResult> {
  // The password is checked before the ticket is spent, so a too-short choice
  // does not force the player to sign with the wallet again.
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { ok: false, status: 400, error: pwProblem, problem: "password" };
  const id = redeemTicket("rt1", ticket);
  if (!id) return { ok: false, status: 401, error: "That recovery has expired. Connect your wallet again." };
  const row = await findById(id);
  if (!row) return { ok: false, status: 404, error: "Account not found." };

  const hash = await hashPassword(password as string);
  const supabase = getSupabase();
  if (!supabase) {
    row.password_hash = hash;
  } else {
    const { error } = await supabase.from("accounts").update({ password_hash: hash }).eq("id", id);
    if (error) {
      console.warn(`[supabase] reset password failed: ${error.message}`);
      return { ok: false, status: 503, error: "Could not save the new password. Try again." };
    }
  }
  // Any lockout from failed attempts on this name no longer applies.
  for (const key of failures.keys()) if (key.endsWith(`|${row.username_key}`)) failures.delete(key);
  return { ok: true, session: toSession({ ...row, password_hash: hash }) };
}
