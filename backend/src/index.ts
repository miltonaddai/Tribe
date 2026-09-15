import "./loadEnv";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CITIES, CITY_ORDER, DEFAULT_CHAIN, type CharacterRecord, type GameSettings, type WalletChainId } from "@the-block/shared";
import { WorldRoom } from "./rooms/WorldRoom";
import { startingCityForWallet, rpcsConfigured } from "./services/alchemy";
import { r2Configured, assetUrl } from "./services/r2";
import { redisEnabled } from "./services/redis";
import { getSupabase } from "./services/supabase";
import { issueNonce, buildSignMessage, verifySignedMessage } from "./services/auth";
import { fetchCharacter, upsertCharacter, upsertSettings, upsertWallet } from "./services/db";

const port = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());

/** Only one chain is supported; anything else falls back to it. */
function parseChain(_raw: unknown): WalletChainId {
  return DEFAULT_CHAIN;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "the-block",
    redis: redisEnabled(),
    supabase: Boolean(getSupabase()),
    r2: r2Configured(),
    rpcs: rpcsConfigured(),
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
    symbol: parsedChain === "robinhood-testnet" ? "ETH" : "SOL",
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
  const result = await upsertCharacter(record, parseChain(chain));
  res.json({ ok: true, ...result });
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

void gameServer.listen(port).then(() => {
  console.log(`[the-block] Colyseus listening on ws://localhost:${port}`);
  console.log(`[the-block] REST health at http://localhost:${port}/health`);
});
