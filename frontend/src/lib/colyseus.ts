import { Client, type Room } from "colyseus.js";

const url = import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567";

export async function joinWorld(options: Record<string, unknown>): Promise<Room | null> {
  try {
    const client = new Client(url);
    return await client.joinOrCreate("world", options);
  } catch (err) {
    console.warn("[colyseus] offline fallback", err);
    return null;
  }
}
