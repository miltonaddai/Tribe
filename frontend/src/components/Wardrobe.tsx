import {
  CURRENCY,
  OUTFITS,
  catalogItem,
  outfitPrice,
  ownsOutfit,
  type InventoryStack,
} from "@tribe/shared";

/**
 * The fashion house floor: every outfit in the game, with the free ones wearable
 * on the spot and the styled ones for sale.
 *
 * Everything is listed, owned or not, so a visitor can see what exists and what
 * it costs - a shop that hides its stock until you can afford it gives nobody a
 * reason to come back. What changes is the button: wear, buy, or already on.
 */
export function Wardrobe({
  inventory,
  current,
  bucks,
  error,
  onWear,
  onBuy,
  onClose,
}: {
  inventory: InventoryStack[];
  current: string;
  bucks: number;
  /** Why the last purchase did not happen, if it did not. */
  error: string | null;
  onWear: (id: string) => void;
  onBuy: (id: string) => void;
  onClose: () => void;
}) {
  const free = OUTFITS.filter((o) => outfitPrice(o.id) === 0);
  const paid = OUTFITS.filter((o) => outfitPrice(o.id) > 0);

  const row = (id: string, label: string) => {
    const price = outfitPrice(id);
    const owned = ownsOutfit(inventory, id);
    const worn = current === id;
    const canAfford = bucks >= price;
    return (
      <li key={id} className={worn ? "fit-row worn" : "fit-row"}>
        <span className="fit-name">
          {label}
          {price > 0 && !owned && (
            <span className="fit-price">
              {price.toLocaleString()} {CURRENCY}
            </span>
          )}
          {catalogItem(id)?.blurb && !owned && price > 0 && (
            <span className="fit-blurb">{catalogItem(id)?.blurb}</span>
          )}
        </span>
        {worn ? (
          <span className="fit-worn">Wearing</span>
        ) : owned ? (
          <button className="btn btn-accent fit-btn" type="button" onClick={() => onWear(id)}>
            Wear
          </button>
        ) : (
          <button
            className="btn btn-outline fit-btn"
            type="button"
            disabled={!canAfford}
            title={canAfford ? undefined : `You need ${price.toLocaleString()} ${CURRENCY}`}
            onClick={() => onBuy(id)}
          >
            Buy
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="wardrobe">
      <header className="wardrobe-head">
        <div>
          <h2>Fashion House</h2>
          <p className="wardrobe-sub">
            {bucks.toLocaleString()} {CURRENCY} on hand
          </p>
        </div>
        <button className="btn btn-ghost wardrobe-x" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {/* A refused purchase has to say so here. The notice behind the panel is
          easy to miss, and a Buy button that does nothing reads as broken. */}
      {error && <p className="wardrobe-error">{error}</p>}

      <h4 className="wardrobe-group">Off the rack — free</h4>
      <ul className="fit-list">{free.map((o) => row(o.id, o.label))}</ul>

      <h4 className="wardrobe-group">The good stuff</h4>
      <ul className="fit-list">{paid.map((o) => row(o.id, o.label))}</ul>

      <p className="wardrobe-note">
        Bought outfits are yours for good — they stay in your wardrobe across sessions, and you can
        change back whenever you like.
      </p>
    </div>
  );
}
