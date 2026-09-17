import "./loadEnv";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  CITIES,
  CITY_ORDER,
  DEFAULT_CHAIN,
  checkName,
  nameProblemText,
  type CharacterRecord,
  type GameSettings,
  type WalletChainId,
} from "@tribe/shared";
import { WorldRoom } from "./rooms/WorldRoom";
import { startingCityForWallet, rpcsConfigured } from "./services/alchemy";
import { r2Configured, assetUrl } from "./services/r2";
import { redisEnabled } from "./services/redis";
import { getSupabase } from "./services/supabase";
import { issueNonce, buildSignMessage, verifySignedMessage } from "./services/auth";
import { nameAvailable, fetchCharacter, upsertCharacter, upsertSettings, upsertWallet } from "./services/db";

const port = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());

/** Only one chain is supported; anything else falls back to it. */
import { TOKEN_ADDRESS, initToken, tokenDecimals, tokenMeta, tokenConfigured, paymentsConfigured, PAYMENT_ADDRESS } from "./services/token";
import { TRIBUTE_DEV_GRANT } from "./services/liveEnv";
import { CHAIN_ID } from "./services/chain";

function parseChain(_raw: unknown): WalletChainId {
  return DEFAULT_CHAIN;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "tribe",
    redis: redisEnabled(),
    supabase: Boolean(getSupabase()),
    r2: r2Configured(),
    rpcs: rpcsConfigured(),
    // Reported so a blank or malformed token address is visible rather than
    // silently falling back to an off-chain balance.
    token: {
      configured: tokenConfigured(),
      address: TOKEN_ADDRESS,
      // From the contract, so a wrong address shows up as nulls here rather
      // than as quietly wrong balances everywhere.
      symbol: tokenMeta()?.symbol ?? null,
      name: tokenMeta()?.name ?? null,
      decimals: tokenDecimals(),
      reachable: tokenMeta() !== null,
      payments: paymentsConfigured(),
      devGrant: TRIBUTE_DEV_GRANT,
    },
  });
});

/**
 * What the client needs to pay for something: which contract, where to send it,
 * and at what scale.
 *
 * Served rather than duplicated into VITE_ vars so there is one source of truth.
 * A frontend holding its own copy of the payment address could drift from the
 * server's, and drift here means players paying an address nothing is watching.
 */
app.get("/api/token", (_req, res) => {
  res.json({
    address: TOKEN_ADDRESS,
    payTo: PAYMENT_ADDRESS,
    decimals: tokenDecimals(),
    symbol: tokenMeta()?.symbol ?? null,
    chainId: CHAIN_ID,
  });
});

app.get("/api/cities", (_req, res) => {
  res.json(CITY_ORDER.map((id) => CITIES[id]));
});

app.get("/api/wallet/:address", async (req, res) => {
  const chain = parseChain(req.query.chain);
  const result = await startingCityForWallet(req.params.address, chain);
  res.json(result);
});

app.get("/api/auth/nonce", (req, res) => {
  const address = String(req.query.address ?? "");
  const chain = parseChain(req.query.chain);
  if (!address) {
    res.status(400).json({ error: "address required" });
    return;
  }
  const origin = String(req.query.origin || req.headers.origin || "http://localhost:5173");
  const nonce = issueNonce(address, chain);
  const message = buildSignMessage({ address, chain, nonce, origin });
  res.json({ nonce, message });
});

app.post("/api/auth/verify", async (req, res) => {
  const { address, chain, message, signature } = req.body as {
    address?: string;
    chain?: WalletChainId;
    message?: string;
    signature?: string;
  };
  if (!address || !message || !signature) {
    res.status(400).json({ error: "address, message, and signature required" });
    return;
  }
  const parsedChain = parseChain(chain);
  const ok = await verifySignedMessage({ address, chain: parsedChain, message, signature });
  if (!ok) {
    res.status(401).json({ error: "invalid signature" });
    return;
  }
  const lookup = await startingCityForWallet(address, parsedChain);
  await upsertWallet({
    address,
    chain: parsedChain,
    symbol: lookup.symbol,
    last_balance: lookup.balance,
    last_city: lookup.city,
  });
  const character = await fetchCharacter(address, parsedChain);
  res.json({ ok: true, ...lookup, address, character });
});

app.get("/api/assets/:key", (req, res) => {
  res.json({ url: assetUrl(req.params.key) });
});

app.get("/api/characters", async (req, res) => {
  const address = String(req.query.address ?? "");
  const chain = parseChain(req.query.chain);
  if (!address) {
    res.status(400).json({ error: "address required" });
    return;
  }
  const character = await fetchCharacter(address, chain);
  res.json({ character });
});

app.post("/api/characters", async (req, res) => {
  const { chain, ...record } = req.body as CharacterRecord & { chain?: WalletChainId };
  if (!record?.wallet || !record.displayName) {
    res.status(400).json({ error: "character wallet and displayName required" });
    return;
  }
  const parsedChain = parseChain(chain);
  // Validated here as well as in the browser: the client is not the authority
  // on what a name may be, and this endpoint is reachable without it.
  const problem = checkName(record.displayName);
  if (problem) {
    res.status(400).json({ error: nameProblemText(problem), problem });
    return;
  }
  if (!(await nameAvailable(record.displayName, record.wallet, parsedChain))) {
    res.status(409).json({ error: "That name is taken.", problem: "taken" });
    return;
  }
  const result = await upsertCharacter(record, parsedChain);
  res.json({ ok: true, ...result });
});

/** Live availability for the create page, so collisions surface before submit. */
app.get("/api/names/check", async (req, res) => {
  const name = String(req.query.name ?? "");
  const address = String(req.query.address ?? "");
  const problem = checkName(name);
  if (problem) {
    res.json({ available: false, problem, reason: nameProblemText(problem) });
    return;
  }
  const available = await nameAvailable(name, address, parseChain(req.query.chain));
  res.json({ available, problem: available ? null : "taken", reason: available ? null : "That name is taken." });
});

app.put("/api/settings", async (req, res) => {
  const { address, chain, settings } = req.body as {
    address?: string;
    chain?: WalletChainId;
    settings?: GameSettings;
  };
  if (!address || !settings) {
    res.status(400).json({ error: "address and settings required" });
    return;
  }
  await upsertSettings(address, parseChain(chain), settings);
  res.json({ ok: true });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("world", WorldRoom);

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

// Adopt the token's decimals before serving: every balance conversion, and so
// every district gate, depends on the answer.
void initToken().then(() =>
  gameServer.listen(port).then(() => {
    console.log(`[tribe] Colyseus listening on ws://localhost:${port}`);
    console.log(`[tribe] REST health at http://localhost:${port}/health`);
  }),
);
