import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");

/**
 * Reads .env from disk on every call so tuning values can be changed while the
 * server is running. Used by the knobs that get adjusted during testing.
 */
export function liveEnv(): Record<string, string | undefined> {
  let fromFile: Record<string, string> = {};
  try {
    fromFile = dotenv.parse(fs.readFileSync(ENV_PATH, "utf8"));
  } catch {
    // Fall back to process.env when .env is missing.
  }
  return { ...process.env, ...fromFile };
}

export function envNumber(key: string, fallback: number) {
  const raw = liveEnv()[key];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Ceiling on a player's Bucks balance, 1B.
 *
 * An overflow guard, not an economic limit. It is applied with Math.min, so
 * keep it far above anything a player could realistically earn.
 */
export const BUCKS_CAP = 1_000_000_000;

/**
 * Bucks handed to a brand new player in the sandbox.
 *
 * Bucks are not a token on any chain - just a number on the character
 * row in the local database. 2M is enough to buy a home in every district, so the
 * whole map is reachable without grinding. Change SANDBOX_STARTING_BUCKS to test
 * a poorer economy.
 */
export const STARTING_BUCKS = envNumber("SANDBOX_STARTING_BUCKS", 2_000_000);

/**
 * How many cars players may own across the whole world, ever.
 *
 * A hard ceiling rather than a per-session one: cars persist, so without it the
 * fleet only grows. 150 is roughly a third of a full 500-player world, which
 * keeps a car worth having, and spread over four districts it leaves the
 * per-district vehicle count near what the movement collision scan was measured
 * comfortable with.
 *
 * The six pre-placed street cars are not counted - nobody owns those.
 */
export const MAX_PLAYER_VEHICLES = envNumber("MAX_PLAYER_VEHICLES", 150);
