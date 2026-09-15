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
 * Ceiling on a wallet's credit balance. Raised well past the old 99999 so that
 * an uncapped asking price is actually payable.
 */
export const CREDIT_CAP = 1_000_000_000;
