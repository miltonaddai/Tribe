import type { WalletChainId } from "@tribe/shared";
import { getDb } from "./localDb";

export type MessageKind =
  | "bid"
  | "outbid"
  | "sold"
  | "bought"
  | "offer"
  | "listed"
  | "expired"
  | "friend"
  | "friend-request";

export type PlayerMessage = {
  id: string;
  kind: MessageKind;
  body: string;
  homeId: string;
  read: boolean;
  at: number;
};

const INBOX_LIMIT = 60;

/** Newest first, capped — the HUD only ever renders a short list. */
export async function loadMessages(wallet: string, chain: WalletChainId): Promise<PlayerMessage[]> {
  const db = getDb();
  if (!wallet) return [];
  const { data, error } = await db
    .from("player_messages")
    .select("*")
    .eq("wallet", wallet)
    .eq("chain", chain)
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);
  if (error) console.warn(`[db] load messages failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind as MessageKind,
    body: String(row.body),
    homeId: String(row.home_id ?? ""),
    read: Boolean(row.read),
    at: Date.parse(String(row.created_at)) || Date.now(),
  }));
}

export async function saveMessage(
  wallet: string,
  chain: WalletChainId,
  message: { kind: MessageKind; body: string; homeId?: string },
): Promise<PlayerMessage> {
  const local: PlayerMessage = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: message.kind,
    body: message.body,
    homeId: message.homeId ?? "",
    read: false,
    at: Date.now(),
  };
  const db = getDb();
  if (!wallet) return local;
  const { data, error } = await db
    .from("player_messages")
    .insert({
      wallet,
      chain,
      kind: message.kind,
      body: message.body,
      home_id: message.homeId ?? null,
    })
    .select("id, created_at")
    .single();
  if (error) console.warn(`[db] save message failed: ${error.message}`);
  if (!data) return local;
  return { ...local, id: String(data.id), at: Date.parse(String(data.created_at)) || local.at };
}

export async function markMessagesRead(wallet: string, chain: WalletChainId) {
  const db = getDb();
  if (!wallet) return;
  const { error } = await db
    .from("player_messages")
    .update({ read: true })
    .eq("wallet", wallet)
    .eq("chain", chain)
    .eq("read", false);
  if (error) console.warn(`[db] mark messages read failed: ${error.message}`);
}
