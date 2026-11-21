import type { InventoryStack } from "@block/shared";
import type { TradeView } from "../game/engine";
import { itemName } from "./InventoryPanel";

/**
 * The live trade window: both stakes side by side, and a lock each.
 *
 * Everything shown comes from the server's view of the session rather than from
 * local state. That matters more than it looks: the whole point of a two-sided
 * trade is that you are looking at what the other person is actually offering
 * at the moment you commit, so the panel must never render an optimistic guess
 * at either stake.
 *
 * Any change to either offer clears both locks, server-side. The panel shows
 * that happening rather than hiding it - a lock that quietly survived the other
 * side swapping their goods would be exactly the trap this design exists to
 * close.
 */
export function TradePanel({
  trade,
  inventory,
  onOffer,
  onLock,
  onCancel,
}: {
  trade: TradeView;
  inventory: InventoryStack[];
  onOffer: (items: string[]) => void;
  onLock: (locked: boolean) => void;
  onCancel: () => void;
}) {
  // What is left to stake: your stacks, less what is already on the table.
  const staked = new Map<string, number>();
  for (const id of trade.yourItems) staked.set(id, (staked.get(id) ?? 0) + 1);
  const available = inventory
    .map((stack) => ({ id: stack.id, qty: stack.qty - (staked.get(stack.id) ?? 0) }))
    .filter((stack) => stack.qty > 0);

  const add = (id: string) => onOffer([...trade.yourItems, id]);
  const remove = (index: number) => onOffer(trade.yourItems.filter((_, i) => i !== index));

  return (
    <div className="trade-window">
      <header className="trade-window-head">
        <h3>Trading with {trade.withName}</h3>
        <button className="btn btn-ghost trade-close" type="button" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <div className="trade-cols">
        <section className="trade-col">
          <h4>
            Your offer
            <span className={trade.youLocked ? "trade-tag locked" : "trade-tag"}>
              {trade.youLocked ? "Locked" : "Open"}
            </span>
          </h4>
          <ul className="trade-stake">
            {trade.yourItems.length === 0 && <li className="trade-empty">Nothing offered yet</li>}
            {trade.yourItems.map((id, i) => (
              <li key={`${id}-${i}`}>
                <button type="button" onClick={() => remove(i)} disabled={trade.youLocked}>
                  {itemName(id)} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="trade-col">
          <h4>
            {trade.withName}
            <span className={trade.theyLocked ? "trade-tag locked" : "trade-tag"}>
              {trade.theyLocked ? "Locked" : "Open"}
            </span>
          </h4>
          <ul className="trade-stake">
            {trade.theirItems.length === 0 && <li className="trade-empty">Nothing offered yet</li>}
            {trade.theirItems.map((id, i) => (
              <li key={`${id}-${i}`} className="trade-theirs">
                {itemName(id)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <h4 className="trade-sub">Your inventory</h4>
      <ul className="trade-pool">
        {available.length === 0 && <li className="trade-empty">Nothing left to offer</li>}
        {available.map((stack) => (
          <li key={stack.id}>
            <button type="button" onClick={() => add(stack.id)} disabled={trade.youLocked}>
              {itemName(stack.id)}
              {stack.qty > 1 ? ` ×${stack.qty}` : ""}
            </button>
          </li>
        ))}
      </ul>

      <p className="trade-hint">
        {trade.youLocked && trade.theyLocked
          ? "Swapping…"
          : trade.theyLocked
            ? `${trade.withName} is locked in. Lock yours to complete the trade.`
            : trade.youLocked
              ? `Waiting for ${trade.withName} to lock in.`
              : "Changing either offer unlocks both sides."}
      </p>

      <button
        className={trade.youLocked ? "btn btn-outline" : "btn btn-accent"}
        type="button"
        disabled={trade.yourItems.length === 0 && trade.theirItems.length === 0}
        onClick={() => onLock(!trade.youLocked)}
      >
        {trade.youLocked ? "Unlock" : "Lock in my offer"}
      </button>
    </div>
  );
}
