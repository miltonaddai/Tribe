import "./loadEnv";
import cors from "cors";
import express, { type Request, type Response } from "express";
import colyseusConfig, { listen } from "@colyseus/tools";
import { matchMaker } from "@colyseus/core";
import {
  CITIES,
  CITY_ORDER,
  DEFAULT_CHAIN,
  checkName,
  nameProblemText,
  type CharacterRecord,
  type GameSettings,
  type WalletChainId,
} from "@moonville/shared";
import { WorldRoom } from "./rooms/WorldRoom";
import { startingCityForWallet, rpcsConfigured } from "./services/alchemy";
import { r2Configured, assetUrl } from "./services/r2";
import { redisEnabled } from "./services/redis";
import { getSupabase } from "./services/supabase";
import { issueNonce, buildSignMessage, verifySignedMessage } from "./services/auth";
import {
  accountSession,
  claimWithWallet,
  finishRecovery,
  loginAccount,
  registerAccount,
  registerWithWallet,
  signInWithWallet,
  startRecovery,
  sessionFromHeader,
  setLinkedWallet,
  usernameAvailable,
} from "./services/accounts";
import { isSolanaAddress } from "./services/base58";
import { nameAvailable, fetchCharacter, upsertCharacter, upsertSettings, upsertWallet } from "./services/db";
import {
  TOKEN_MINT,
  initToken,
  tokenDecimals,
  tokenMeta,
  tokenConfigured,
  paymentsConfigured,
} from "./services/token";
import { MOON_DEV_GRANT } from "./services/liveEnv";
import { SOLANA_CLUSTER, SOLANA_EXPLORER } from "./services/chain";

const port = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());
// One proxy hop (Colyseus Cloud, a load balancer) so req.ip is the player, which
// the login brute-force guard keys on. Not `true`: that would let anyone set
// their own IP with an X-Forwarded-For header.
app.set("trust proxy", 1);

/** Only one chain is supported. */
const CHAIN: WalletChainId = DEFAULT_CHAIN;

type Authed = { playerId: string; username: string };

/**
 * Every route that reads or writes a player's data takes the player from the
 * session token, never from the body. These used to trust a wallet address
 * sent by the client, so anyone could save over anyone's character.
 */
function requireSession(req: Request, res: Response): Authed | null {
  const session = sessionFromHeader(req.headers.authorization);
  if (!session) {
    res.status(401).json({ error: "Sign in again." });
    return null;
  }
  return session;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "moonville",
    redis: redisEnabled(),
    supabase: Boolean(getSupabase()),
    r2: r2Configured(),
    rpcs: rpcsConfigured(),
    // Reported so a blank or malformed mint is visible rather than silently
    // falling back to an off-chain balance.
    token: {
      configured: tokenConfigured(),
      mint: TOKEN_MINT,
      cluster: SOLANA_CLUSTER,
      symbol: tokenMeta()?.symbol ?? null,
      decimals: tokenDecimals(),
      reachable: tokenMeta() !== null,
      payments: paymentsConfigured(),
      devGrant: MOON_DEV_GRANT,
    },
  });
});

/**
 * What the client needs to pay for something: which mint to burn, and at what
 * scale. Served rather than duplicated into VITE_ vars so there is one source
 * of truth - drift here means players burning a token nothing is watching.
 */
app.get("/api/token", (_req, res) => {
  res.json({
    mint: TOKEN_MINT,
    decimals: tokenDecimals(),
    symbol: tokenMeta()?.symbol ?? null,
    cluster: SOLANA_CLUSTER,
    explorer: SOLANA_EXPLORER,
  });
});

/**
 * How many players are in the world right now, for the landing page.
 *
 * The real count, always: this is shown to people deciding whether to play and
 * whether to buy the token, so it must never be padded. Cached for a few
 * seconds so a busy landing page cannot turn into a matchmaker query storm.
 */
let liveCache: { players: number; at: number } | null = null;
const LIVE_CACHE_MS = 10_000;

app.get("/api/live", async (_req, res) => {
  if (!liveCache || liveCache.at < Date.now() - LIVE_CACHE_MS) {
    try {
      const rooms = await matchMaker.query({ name: "world" });
      liveCache = { players: rooms.reduce((sum, room) => sum + (room.clients ?? 0), 0), at: Date.now() };
    } catch (error) {
      console.warn("[moonville] live player count failed", error);
      res.status(503).json({ error: "unavailable" });
      return;
    }
  }
  res.json({ players: liveCache.players, at: liveCache.at });
});

app.get("/api/cities", (_req, res) => {
  res.json(CITY_ORDER.map((id) => CITIES[id]));
});

// --- accounts ---------------------------------------------------------------

app.post("/api/accounts/register", async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const result = await registerAccount(username, password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, problem: result.problem ?? null });
    return;
  }
  res.json({ ok: true, session: result.session, character: null });
});

app.post("/api/accounts/login", async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const result = await loginAccount(username, password, req.ip ?? "");
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const character = await fetchCharacter(result.session.playerId, CHAIN);
  res.json({ ok: true, session: result.session, character });
});

/** Refreshes a stored session: a new token, the linked wallet, the character. */
app.get("/api/accounts/me", async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  const session = await accountSession(auth.playerId);
  if (!session) {
    res.status(401).json({ error: "Sign in again." });
    return;
  }
  const [character, holdings] = await Promise.all([
    fetchCharacter(session.playerId, CHAIN),
    startingCityForWallet(session.playerId, CHAIN),
  ]);
  res.json({ ok: true, session, character, ...holdings });
});

/** Live availability for the sign-up form. */
app.get("/api/accounts/check", async (req, res) => {
  const name = String(req.query.username ?? "");
  const problem = checkName(name);
  if (problem) {
    res.json({ available: false, problem, reason: nameProblemText(problem) });
    return;
  }
  const available = await usernameAvailable(name);
  res.json({ available, problem: available ? null : "taken", reason: available ? null : "That username is taken." });
});

// --- wallet messages -------------------------------------------------------

/**
 * The site a wallet message is being signed for, from the browser's own
 * headers. The page cannot set these, so a lookalike site asking a player to
 * sign gets a message that names the lookalike - which is the warning.
 *
 * SITE_ORIGINS (comma-separated) refuses everything else outright. Leave it
 * blank locally; set it to the real site in production.
 */
const SITE_ORIGINS = (process.env.SITE_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function requestOrigin(req: Request): string | null {
  let origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (!origin && typeof req.headers.referer === "string") {
    try {
      origin = new URL(req.headers.referer).origin;
    } catch {
      origin = "";
    }
  }
  if (!origin) return SITE_ORIGINS[0] ?? null;
  if (SITE_ORIGINS.length > 0 && !SITE_ORIGINS.includes(origin)) return null;
  return origin;
}

function walletFromQuery(req: Request, res: Response): string | null {
  const address = String(req.query.address ?? "");
  if (!isSolanaAddress(address)) {
    res.status(400).json({ error: "That is not a Solana address." });
    return null;
  }
  return address;
}

type SignedBody = { address?: string; message?: string; signature?: string };

function signedBody(req: Request, res: Response): Required<SignedBody> | null {
  const { address, message, signature } = (req.body ?? {}) as SignedBody;
  if (!address || !message || !signature) {
    res.status(400).json({ error: "address, message, and signature required" });
    return null;
  }
  return { address, message, signature };
}

// --- signing in with a wallet ------------------------------------------------

app.get("/api/accounts/wallet/nonce", (req, res) => {
  const address = walletFromQuery(req, res);
  if (!address) return;
  const origin = requestOrigin(req);
  if (!origin) {
    res.status(403).json({ error: "Sign in from the official site." });
    return;
  }
  const nonce = issueNonce("sign-in", address);
  res.json({ nonce, message: buildSignMessage({ purpose: "sign-in", address, nonce, origin }) });
});

/**
 * The wallet's account if it has one, or a short-lived ticket to create or
 * claim one - so the player signs exactly once either way.
 */
app.post("/api/accounts/wallet", async (req, res) => {
  const body = signedBody(req, res);
  if (!body) return;
  if (!verifySignedMessage({ purpose: "sign-in", ...body })) {
    res.status(401).json({ error: "The wallet signature did not check out. Try again." });
    return;
  }
  const result = await signInWithWallet(body.address);
  if (result.ok) {
    const character = await fetchCharacter(result.session.playerId, CHAIN);
    res.json({ ok: true, session: result.session, character });
    return;
  }
  if ("needsAccount" in result) {
    res.json({ ok: false, needsAccount: true, ticket: result.ticket });
    return;
  }
  res.status(result.status).json({ error: result.error });
});

app.post("/api/accounts/wallet/register", async (req, res) => {
  const { ticket, username } = (req.body ?? {}) as { ticket?: unknown; username?: unknown };
  const result = await registerWithWallet(ticket, username);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, problem: result.problem ?? null });
    return;
  }
  res.json({ ok: true, session: result.session, character: null });
});

app.post("/api/accounts/wallet/claim", async (req, res) => {
  const { ticket, username, password } = (req.body ?? {}) as { ticket?: unknown; username?: unknown; password?: unknown };
  const result = await claimWithWallet(ticket, username, password, req.ip ?? "");
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const character = await fetchCharacter(result.session.playerId, CHAIN);
  res.json({ ok: true, session: result.session, character });
});

// --- recovering an account with its linked wallet -----------------------------

app.get("/api/accounts/recover/nonce", (req, res) => {
  const address = walletFromQuery(req, res);
  if (!address) return;
  const origin = requestOrigin(req);
  if (!origin) {
    res.status(403).json({ error: "Recover your account from the official site." });
    return;
  }
  const nonce = issueNonce("recover", address);
  res.json({ nonce, message: buildSignMessage({ purpose: "recover", address, nonce, origin }) });
});

/** Proves the wallet, and names the account it can recover. */
app.post("/api/accounts/recover", async (req, res) => {
  const body = signedBody(req, res);
  if (!body) return;
  if (!verifySignedMessage({ purpose: "recover", ...body })) {
    res.status(401).json({ error: "The wallet signature did not check out. Try again." });
    return;
  }
  const result = await startRecovery(body.address);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, ticket: result.ticket, username: result.username });
});

app.post("/api/accounts/recover/finish", async (req, res) => {
  const { ticket, password } = (req.body ?? {}) as { ticket?: unknown; password?: unknown };
  const result = await finishRecovery(ticket, password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, problem: result.problem ?? null });
    return;
  }
  const character = await fetchCharacter(result.session.playerId, CHAIN);
  res.json({ ok: true, session: result.session, character });
});

// --- linking a Solana wallet ------------------------------------------------

app.get("/api/wallet/nonce", (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  const address = walletFromQuery(req, res);
  if (!address) return;
  const origin = requestOrigin(req);
  if (!origin) {
    res.status(403).json({ error: "Link wallets from the official site." });
    return;
  }
  const nonce = issueNonce("link", address, auth.playerId);
  res.json({
    nonce,
    message: buildSignMessage({ purpose: "link", address, nonce, origin, username: auth.username }),
  });
});

app.post("/api/wallet/link", async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  const body = signedBody(req, res);
  if (!body) return;
  const { address } = body;
  if (!verifySignedMessage({ purpose: "link", ...body, playerId: auth.playerId, username: auth.username })) {
    res.status(401).json({ error: "The wallet signature did not check out. Try again." });
    return;
  }
  const linked = await setLinkedWallet(auth.playerId, address);
  if (!linked.ok) {
    res.status(linked.status).json({ error: linked.error });
    return;
  }
  const lookup = await startingCityForWallet(auth.playerId, CHAIN);
  await upsertWallet({
    address: auth.playerId,
    chain: CHAIN,
    symbol: lookup.symbol,
    last_balance: lookup.balance,
    last_city: lookup.city,
  });
  res.json({ ok: true, solanaAddress: address, ...lookup });
});

app.post("/api/wallet/unlink", async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  const result = await setLinkedWallet(auth.playerId, null);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/assets/:key", (req, res) => {
  res.json({ url: assetUrl(req.params.key) });
});

// --- characters and settings ------------------------------------------------

app.get("/api/characters", async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  res.json({ character: await fetchCharacter(auth.playerId, CHAIN) });
});

app.post("/api/characters", async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  const record = req.body as CharacterRecord;
  if (!record || typeof record !== "object") {
    res.status(400).json({ error: "character required" });
    return;
  }
  // The username is the nametag. Whatever name the body carries is replaced, so
  // a character can never wear a name that belongs to another account.
  const owned: CharacterRecord = { ...record, wallet: auth.playerId, displayName: auth.username };
  if (!(await nameAvailable(owned.displayName, owned.wallet, CHAIN))) {
    res.status(409).json({ error: "That name is taken.", problem: "taken" });
    return;
  }
  const result = await upsertCharacter(owned, CHAIN);
  res.json({ ok: true, ...result });
});

app.put("/api/settings", async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) return;
  const { settings } = (req.body ?? {}) as { settings?: GameSettings };
  if (!settings) {
    res.status(400).json({ error: "settings required" });
    return;
  }
  await upsertSettings(auth.playerId, CHAIN, settings);
  res.json({ ok: true });
});

/**
 * The server is started through @colyseus/tools rather than by calling
 * gameServer.listen() directly.
 *
 * Colyseus Cloud refuses the direct route outright - "Please install
 * @colyseus/tools to be able to host on Colyseus Cloud", thrown from
 * Server.listen - because the platform needs to choose the transport, port and
 * process wiring itself. Locally this behaves the same as the hand-built
 * WebSocketTransport it replaces, so there is only one code path to reason
 * about rather than one for the laptop and one for production.
 */

// Opt-in load diagnostics: event-loop delay is the honest measure of whether
// the server is keeping up, independent of how busy any client happens to be.
if (process.env.PERF_LOG === "true") {
  const { monitorEventLoopDelay } = await import("node:perf_hooks");
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  setInterval(() => {
    const ms = (n: number) => (n / 1e6).toFixed(1);
    const mem = process.memoryUsage();
    console.log(
      `[perf] loop p50 ${ms(loop.percentile(50))}ms p99 ${ms(loop.percentile(99))}ms max ${ms(loop.max)}ms` +
        ` | heap ${(mem.heapUsed / 1048576).toFixed(0)}MB rss ${(mem.rss / 1048576).toFixed(0)}MB`,
    );
    loop.reset();
  }, 2000);
}

void listen(
  colyseusConfig({
    initializeGameServer: (gameServer) => {
      gameServer.define("world", WorldRoom);
    },
    // An express app is itself middleware, so the whole router built above -
    // CORS, JSON parsing and every /api route - mounts onto the app that tools
    // creates. Keeps the routes where they are instead of restructuring the
    // file around the new entry point.
    initializeExpress: (target) => {
      target.use(app);
    },
    // Awaited by tools before the port opens, which is the guarantee this needs:
    // every balance conversion, and so every district gate, depends on the
    // token's decimals being known.
    beforeListen: () => initToken(),
  }),
  port,
);
// trigger backend deploy 1
// trigger backend deploy 2
// trigger backend deploy 3