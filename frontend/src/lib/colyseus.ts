import { Client, type Room } from "@colyseus/sdk";

const url = import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567";

export type JoinFailure = "full" | "offline";

export type JoinResult = { room: Room; reason?: undefined } | { room: null; reason: JoinFailure };

/**
 * The server keeps a single world, so a full one fails matchmaking rather than
 * quietly creating a second city. Tell those two cases apart: one is a queue,
 * the other is the backend being down.
 */
export async function joinWorld(options: Record<string, unknown>): Promise<JoinResult> {
  try {
    const client = new Client(url);
    return { room: await client.joinOrCreate("world", options) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("WORLD_FULL") || message.includes("locked")) {
      return { room: null, reason: "full" };
    }
    console.warn("[colyseus] offline fallback", err);
    return { room: null, reason: "offline" };
  }
}
