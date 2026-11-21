import type { WalletChainId } from "@block/shared";
import { getDb } from "./localDb";

export type FriendLink = {
  wallet: string;
  chain: WalletChainId;
  name: string;
  /** "friend" once accepted; otherwise which way the pending request points. */
  status: "friend" | "incoming" | "outgoing";
};

function warn(action: string, error: { message: string } | null) {
  if (error) console.warn(`[db] ${action} failed: ${error.message}`);
}

/** Everything involving this wallet, flattened to the other party's view. */
export async function loadFriends(wallet: string, chain: WalletChainId): Promise<FriendLink[]> {
  const db = getDb();
  if (!wallet) return [];
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .or(`and(requester_wallet.eq.${wallet},requester_chain.eq.${chain}),and(addressee_wallet.eq.${wallet},addressee_chain.eq.${chain})`);
  warn("load friends", error);

  return (data ?? []).map((row) => {
    const iAmRequester = row.requester_wallet === wallet && row.requester_chain === chain;
    const other = iAmRequester
      ? { wallet: row.addressee_wallet, chain: row.addressee_chain, name: row.addressee_name }
      : { wallet: row.requester_wallet, chain: row.requester_chain, name: row.requester_name };
    const status: FriendLink["status"] =
      row.status === "accepted" ? "friend" : iAmRequester ? "outgoing" : "incoming";
    return { wallet: other.wallet, chain: other.chain as WalletChainId, name: String(other.name ?? "citizen"), status };
  });
}

/** Returns null when the pair are already linked or a request is outstanding. */
export async function createRequest(
  from: { wallet: string; chain: WalletChainId; name: string },
  to: { wallet: string; chain: WalletChainId; name: string },
) {
  const db = getDb();

  const existing = await loadFriends(from.wallet, from.chain);
  const already = existing.find((link) => link.wallet === to.wallet && link.chain === to.chain);
  if (already?.status === "friend") return { ok: false as const, reason: `You are already friends with ${to.name}.` };
  if (already?.status === "outgoing") return { ok: false as const, reason: `You already asked ${to.name}.` };
  // They asked first, so treat this as accepting rather than a rival request.
  if (already?.status === "incoming") {
    const accepted = await respondToRequest(to, from, true);
    return accepted.ok ? { ok: true as const, accepted: true } : accepted;
  }

  const { error } = await db.from("friendships").insert({
    requester_wallet: from.wallet,
    requester_chain: from.chain,
    requester_name: from.name,
    addressee_wallet: to.wallet,
    addressee_chain: to.chain,
    addressee_name: to.name,
    status: "pending",
  });
  warn("create friend request", error);
  if (error) return { ok: false as const, reason: "Could not send that request." };
  return { ok: true as const, accepted: false };
}

/** `requester` asked `addressee`; the addressee is the one answering. */
export async function respondToRequest(
  requester: { wallet: string; chain: WalletChainId },
  addressee: { wallet: string; chain: WalletChainId },
  accept: boolean,
) {
  const db = getDb();
  // The filter has to hang off update/delete, not off from().
  const table = db.from("friendships");
  const query = accept
    ? table.update({ status: "accepted", responded_at: new Date().toISOString() })
    : table.delete();
  const { error } = await query
    .eq("requester_wallet", requester.wallet)
    .eq("requester_chain", requester.chain)
    .eq("addressee_wallet", addressee.wallet)
    .eq("addressee_chain", addressee.chain);
  warn(accept ? "accept friend" : "reject friend", error);
  if (error) return { ok: false as const, reason: "Could not answer that request." };
  return { ok: true as const };
}

/** Removes the link whichever direction it was created in. */
export async function removeFriend(
  a: { wallet: string; chain: WalletChainId },
  b: { wallet: string; chain: WalletChainId },
) {
  const db = getDb();
  const { error } = await db
    .from("friendships")
    .delete()
    .or(
      `and(requester_wallet.eq.${a.wallet},addressee_wallet.eq.${b.wallet}),and(requester_wallet.eq.${b.wallet},addressee_wallet.eq.${a.wallet})`,
    );
  warn("remove friend", error);
}
