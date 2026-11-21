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
} from "@block/shared";
import { WorldRoom } from "./rooms/WorldRoom";
import { startingCityForWallet } from "./services/holdings";
import { accountSession, playAs, sessionFromHeader, usernameAvailable } from "./services/accounts";
import { getDb } from "./services/localDb";
import { nameAvailable, fetchCharacter, upsertCharacter, upsertSettings } from "./services/db";
import { STARTING_BUCKS } from "./services/liveEnv";

const port = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());

/** Only one chain is supported. */
const CHAIN: WalletChainId = DEFAULT_CHAIN;

type Authed = { playerId: string; username: string };

/**
 * Which profile a request acts for. There is no authentication in the sandbox:
 * the bearer is the player id handed out by /api/accounts/play.
 */
async function requireSession(req: Request, res: Response): Promise<Authed | null> {
  const session = await sessionFromHeader(req.headers.authorization);
  if (!session) {
    res.status(401).json({ error: "Pick a name to play." });
    return null;
  }
  return session;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "block", mode: "offline-sandbox", startingBucks: STARTING_BUCKS });
});

/**
 * How many players are in the world right now, for the landing page.
 *
 * The real count, always: this is shown to people deciding whether to play, so
 * it must never be padded. Cached for a few seconds so a busy landing page
 * cannot turn into a matchmaker query storm.
 */
let liveCache: { players: number; at: number } | null = null;
const LIVE_CACHE_MS = 10_000;

app.get("/api/live", async (_req, res) => {
  if (!liveCache || liveCache.at < Date.now() - LIVE_CACHE_MS) {
    try {
      const rooms = await matchMaker.query({ name: "world" });
      liveCache = { players: rooms.reduce((sum, room) => sum + (room.clients ?? 0), 0), at: Date.now() };
    } catch (error) {
      console.warn("[block] live player count failed", error);
      res.status(503).json({ error: "unavailable" });
      return;
    }
  }
  res.json({ players: liveCache.players, at: liveCache.at });
});

app.get("/api/cities", (_req, res) => {
  res.json(CITY_ORDER.map((id) => CITIES[id]));
});

// --- sandbox profiles ---------------------------------------------------------

/** Play as a name: the existing profile with that name, or a new one. */
app.post("/api/accounts/play", async (req, res) => {
  const { username } = (req.body ?? {}) as { username?: unknown };
  const result = await playAs(username);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, problem: result.problem ?? null });
    return;
  }
  const [character, holdings] = await Promise.all([
    fetchCharacter(result.session.playerId, CHAIN),
    startingCityForWallet(result.session.playerId, CHAIN),
  ]);
  res.json({ ok: true, created: result.created ?? false, session: result.session, character, ...holdings });
});

/** Re-reads a stored profile: the character and current simulated balance. */
app.get("/api/accounts/me", async (req, res) => {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const session = await accountSession(auth.playerId);
  if (!session) {
    res.status(401).json({ error: "Pick a name to play." });
    return;
  }
  const [character, holdings] = await Promise.all([
    fetchCharacter(session.playerId, CHAIN),
    startingCityForWallet(session.playerId, CHAIN),
  ]);
  res.json({ ok: true, session, character, ...holdings });
});

/** For the name form: is the name valid, and does a profile already use it? */
app.get("/api/accounts/check", async (req, res) => {
  const name = String(req.query.username ?? "");
  const problem = checkName(name);
  if (problem) {
    res.json({ valid: false, exists: false, reason: nameProblemText(problem) });
    return;
  }
  res.json({ valid: true, exists: !(await usernameAvailable(name)), reason: null });
});

// --- bug reports ---------------------------------------------------------------

/** Saved to the local database's bug_reports table. */
app.post("/api/bug-reports", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const report = typeof body.report === "string" ? body.report.trim().slice(0, 2000) : "";
  if (!report) {
    res.status(400).json({ error: "report required" });
    return;
  }
  const { error } = await getDb().from("bug_reports").insert({ ...body, report });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  console.log(`[bug-report] ${report.slice(0, 120)}`);
  res.json({ ok: true });
});

// --- characters and settings ------------------------------------------------

app.get("/api/characters", async (req, res) => {
  const auth = await requireSession(req, res);
  if (!auth) return;
  res.json({ character: await fetchCharacter(auth.playerId, CHAIN) });
});

app.post("/api/characters", async (req, res) => {
  const auth = await requireSession(req, res);
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
  const auth = await requireSession(req, res);
  if (!auth) return;
  const { settings } = (req.body ?? {}) as { settings?: GameSettings };
  if (!settings) {
    res.status(400).json({ error: "settings required" });
    return;
  }
  await upsertSettings(auth.playerId, CHAIN, settings);
  res.json({ ok: true });
});

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
    beforeListen: () => {
      console.log(`[block] offline sandbox - no external services, ${STARTING_BUCKS.toLocaleString()} Block Bucks to start`);
    },
  }),
  port,
);