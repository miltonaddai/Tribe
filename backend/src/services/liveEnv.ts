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
 * Ceiling on a wallet's Tribute balance: the whole $TRIBE supply, 1B tokens.
 *
 * This is an overflow guard, not an economic limit, and it MUST stay at or above
 * total supply. It is applied with Math.min, so a cap below what a wallet can
 * legitimately hold would silently destroy the excess on deposit. If the supply
 * ever changes, change this first.
 */
export const TRIBUTE_CAP = 1_000_000_000;

/**
 * Tribute handed to a brand new wallet. Must be 0 wherever the token is real:
 * Tribute is $TRIBE held as a deposited float, so a starting balance mints
 * tokens the treasury never received. Set it only on a throwaway database to
 * keep the game testable before the deposit flow exists.
 */
export const TRIBUTE_DEV_GRANT = envNumber("TRIBUTE_DEV_GRANT", 0);

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
