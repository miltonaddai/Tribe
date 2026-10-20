import { cityFromBalance, DEFAULT_CHAIN, type AccountSession, type CharacterRecord, type CityId, type WalletChainId } from "@moonville/shared";
import { apiUrl, assertJson, authHeaders } from "./api";
import { moonThresholds } from "./cityThresholds";
import { hydrateCharacter, saveCharacter } from "./storage";
import { connectSolanaWallet, forgetWallet, signWithWallet, type SolanaProvider } from "./solanaWallets";

/**
 * Who is playing.
 *
 * A player is a username account; nobody needs a wallet to play. A Solana
 * wallet can be linked later, and only matters for paying for things and for
 * buying homes, which are what open the upper districts.
 */
export type Session = {
  /** What every game table is keyed by: `acct:<uuid>`, or `demo:<n>` in dev. */
  playerId: string;
  username: string;
  /** Bearer token for the API and the game room. Empty for demo players. */
  token: string;
  solanaAddress: string | null;
  /** $MOON held by the linked wallet, as of the last refresh. */
  balance: number;
  city: CityId;
  demo: boolean;
  chain: WalletChainId;
};

const KEY = "moonville:session";

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
  forgetWallet();
}

export function shorten(address: string) {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

type AuthResponse = {
  ok?: boolean;
  error?: string;
  session?: AccountSession;
  character?: CharacterRecord | null;
  balance?: number;
  city?: CityId;
};

async function post(path: string, body: unknown, auth = false): Promise<AuthResponse & { status: number }> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? authHeaders() : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the game server. Check your connection and try again.");
  }
  assertJson(res);
  return { ...((await res.json()) as AuthResponse), status: res.status };
}

function fromAccount(account: AccountSession, balance = 0, city?: CityId): Session {
  return {
    playerId: account.playerId,
    username: account.username,
    token: account.token,
    solanaAddress: account.solanaAddress,
    balance,
    // The server's answer when it gave one. Accounts start in the Trenches:
    // districts open with homes, which the room checks again on join.
    city: city ?? "trenches",
    demo: false,
    chain: DEFAULT_CHAIN,
  };
}

function adopt(body: AuthResponse): Session {
  if (!body.session) throw new Error(body.error ?? "Something went wrong. Try again.");
  const session = fromAccount(body.session, body.balance ?? 0, body.city);
  saveSession(session);
  // A returning player on a new device gets their character from the server.
  const existing = hydrateCharacter(body.character);
  if (existing) saveCharacter({ ...existing, wallet: session.playerId, displayName: session.username });
  return session;
}

export async function register(username: string, password: string): Promise<Session> {
  const body = await post("/api/accounts/register", { username, password });
  if (!body.ok) throw new Error(body.error ?? "Could not create the account.");
  return adopt(body);
}

export async function login(username: string, password: string): Promise<Session> {
  const body = await post("/api/accounts/login", { username, password });
  if (!body.ok) throw new Error(body.error ?? "Could not sign in.");
  return adopt(body);
}

/**
 * Re-reads the account: a fresh token, the linked wallet, current holdings.
 * Null means the session is no longer valid and the player must sign in again.
 */
export async function refreshSession(): Promise<Session | null> {
  const current = loadSession();
  if (!current || current.demo) return current;
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/accounts/me"), { headers: authHeaders() });
  } catch {
    // Offline: keep what we have rather than signing the player out.
    return current;
  }
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) return current;
  try {
    assertJson(res);
    const body = (await res.json()) as AuthResponse;
    return body.session ? adopt(body) : current;
  } catch {
    return current;
  }
}

/** Live availability for the sign-up form. */
export async function checkUsername(name: string): Promise<{ available: boolean; reason: string | null }> {
  try {
    const res = await fetch(apiUrl(`/api/accounts/check?username=${encodeURIComponent(name)}`));
    if (!res.ok) return { available: true, reason: null };
    return (await res.json()) as { available: boolean; reason: string | null };
  } catch {
    return { available: true, reason: null };
  }
}

/**
 * Links a Solana wallet to the signed-in account: the wallet signs a one-time
 * message naming the account, so nobody can link a wallet they do not hold.
 */
export async function linkWallet(walletId: string): Promise<Session> {
  const current = loadSession();
  if (!current || current.demo) throw new Error("Sign in first.");
  const { provider, address } = await connectSolanaWallet(walletId);
  const signed = await signChallenge("/api/wallet/nonce", address, provider, true);
  const body = (await post("/api/wallet/link", signed, true)) as AuthResponse & {
    solanaAddress?: string;
    status: number;
  };
  if (!body.ok) throw new Error(body.error ?? "Could not link the wallet.");

  const next: Session = {
    ...current,
    solanaAddress: address,
    balance: body.balance ?? current.balance,
    city: body.city ?? current.city,
  };
  saveSession(next);
  return next;
}

export async function unlinkWallet(): Promise<Session> {
  const current = loadSession();
  if (!current) throw new Error("Sign in first.");
  const body = await post("/api/wallet/unlink", {}, true);
  if (!body.ok) throw new Error(body.error ?? "Could not unlink the wallet.");
  forgetWallet();
  const next: Session = { ...current, solanaAddress: null, balance: 0, city: "trenches" };
  saveSession(next);
  return next;
}

/** `held` is $MOON, matching the demo:<n> holdings the server reads back. */
export function connectDemo(held = 150_000, username = "citizen"): Session {
  const session: Session = {
    playerId: `demo:${held}`,
    username,
    token: "",
    solanaAddress: null,
    balance: held,
    city: cityFromBalance(held, moonThresholds()),
    demo: true,
    chain: DEFAULT_CHAIN,
  };
  saveSession(session);
  return session;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Fetches the message the server wants signed and has the wallet sign it.
 *
 * The server writes the message, including which site is asking, from its own
 * view of the request - the page only supplies the address.
 */
async function signChallenge(
  noncePath: string,
  address: string,
  provider: SolanaProvider,
  auth: boolean,
): Promise<{ address: string; message: string; signature: string }> {
  let res: Response;
  try {
    res = await fetch(apiUrl(`${noncePath}?address=${encodeURIComponent(address)}`), {
      headers: auth ? authHeaders() : {},
    });
  } catch {
    throw new Error("Cannot reach the game server.");
  }
  assertJson(res);
  const issued = (await res.json()) as { message?: string; error?: string };
  if (!res.ok || !issued.message) throw new Error(issued.error ?? "Could not start the wallet sign-in.");
  const signature = await signWithWallet(provider, issued.message);
  return { address, message: issued.message, signature: toBase64(signature) };
}

/** Where a wallet sign-in landed. */
export type WalletSignIn =
  | { kind: "session"; session: Session }
  /** The wallet is not linked to any account yet: create one or claim one. */
  | { kind: "needs-account"; ticket: string; address: string };

/**
 * Signs in with a wallet: straight into the account it is linked to, or a
 * ticket to create a new account or attach the wallet to an existing one.
 */
export async function walletSignIn(walletId: string): Promise<WalletSignIn> {
  const { provider, address } = await connectSolanaWallet(walletId);
  const signed = await signChallenge("/api/accounts/wallet/nonce", address, provider, false);
  const body = (await post("/api/accounts/wallet", signed)) as AuthResponse & {
    needsAccount?: boolean;
    ticket?: string;
  };
  if (body.ok) return { kind: "session", session: adopt(body) };
  if (body.needsAccount && body.ticket) return { kind: "needs-account", ticket: body.ticket, address };
  throw new Error(body.error ?? "Could not sign in with that wallet.");
}

/** A new account for a wallet that has none: just a username. */
export async function walletRegister(ticket: string, username: string): Promise<Session> {
  const body = await post("/api/accounts/wallet/register", { ticket, username });
  if (!body.ok) throw new Error(body.error ?? "Could not create the account.");
  return adopt(body);
}

/** Attaches the wallet to an existing account, proven by its password. */
export async function walletClaim(ticket: string, username: string, password: string): Promise<Session> {
  const body = await post("/api/accounts/wallet/claim", { ticket, username, password });
  if (!body.ok) throw new Error(body.error ?? "Could not sign in.");
  return adopt(body);
}

/**
 * Step one of recovery: the wallet linked to an account proves itself and the
 * server names the account. Throws when the wallet is not linked to any.
 */
export async function recoverStart(walletId: string): Promise<{ ticket: string; username: string; address: string }> {
  const { provider, address } = await connectSolanaWallet(walletId);
  const signed = await signChallenge("/api/accounts/recover/nonce", address, provider, false);
  const body = (await post("/api/accounts/recover", signed)) as AuthResponse & { ticket?: string; username?: string };
  if (!body.ok || !body.ticket || !body.username) throw new Error(body.error ?? "Could not start recovery.");
  return { ticket: body.ticket, username: body.username, address };
}

/** Step two: a new password for the account, and signed in to it. */
export async function recoverFinish(ticket: string, password: string): Promise<Session> {
  const body = await post("/api/accounts/recover/finish", { ticket, password });
  if (!body.ok) throw new Error(body.error ?? "Could not save the new password.");
  return adopt(body);
}
