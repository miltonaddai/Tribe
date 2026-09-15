import { CATALOG, CITIES, catalogItem, itemName, stackCount, type CityId, type InventoryStack, type ItemId } from "@the-block/shared";

type OwnedHome = {
  id: string;
  city: string;
  lastPrice: number;
  forSale: boolean;
  askingPrice: number;
  highBid: number;
  awaitingSeller: boolean;
  locked: boolean;
};

type OwnedCar = { id: string; kind: string; color: string; city: string; locked: boolean };

function cityName(id: string) {
  return CITIES[id as CityId]?.shortName ?? id;
}

function homeStatus(home: OwnedHome) {
  if (home.awaitingSeller) return `offer of ${home.highBid} cr to answer`;
  if (home.forSale && home.highBid > 0) return `bidding at ${home.highBid} cr`;
  if (home.forSale) return `listed at ${home.askingPrice} cr`;
  return home.lastPrice > 0 ? `bought for ${home.lastPrice} cr` : "owned";
}

const ITEM_SPRITES: Record<ItemId, { column: number; row: number }> = {
  glasses: { column: 0, row: 0 },
  backpack: { column: 1, row: 0 },
  earbuds: { column: 2, row: 0 },
  visor: { column: 3, row: 0 },
  watch: { column: 0, row: 1 },
  chain: { column: 1, row: 1 },
  pipe: { column: 2, row: 1 },
  pistol: { column: 3, row: 1 },
  rifle: { column: 0, row: 2 },
  mutt: { column: 1, row: 2 },
  cat: { column: 2, row: 2 },
  "mystery-crate": { column: 3, row: 2 },
};

function ItemImage({ id }: { id: ItemId }) {
  const sprite = ITEM_SPRITES[id];
  return (
    <span
      className="inv-item-art"
      role="img"
      aria-label={itemName(id)}
      style={{ backgroundPosition: `${(sprite.column / 3) * 100}% ${(sprite.row / 2) * 100}%` }}
    />
  );
}

export function InventoryPanel({
  credits,
  inventory,
  inStore,
  accessTier,
  gun,
  pet,
  accessories,
  buyError,
  onClose,
  onBuy,
  onEquip,
  homes,
  cars,
}: {
  credits: number;
  inventory: InventoryStack[];
  inStore: boolean;
  accessTier: number;
  gun: string | null;
  pet: string | null;
  accessories: string[];
  buyError: string | null;
  onClose: () => void;
  onBuy: (id: ItemId) => void;
  onEquip: (id: ItemId) => void;
  homes: OwnedHome[];
  cars: OwnedCar[];
}) {
  // Everything is listed, so you can see what exists and what it takes to
  // carry it. Only your access tier decides what you can actually buy.
  const stock = CATALOG;
  const equipped = new Set<string>([...accessories, gun ?? "", pet ?? ""].filter(Boolean));

  return (
    <div className="inv-panel">
      <div className="inv-head">
        <div>
          <h2>{inStore ? "Store" : "Inventory"}</h2>
          <p>
            {credits} credits
            {inStore ? " · buy with the city till" : " · equip or take it to trade"}
          </p>
        </div>
        <button type="button" className="whisper-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {buyError && <div className="inv-error">{buyError}</div>}

      <div className="inv-cols">
        <section>
          <h3>Your bag</h3>
          {inventory.length === 0 && <p className="inv-empty">Empty. Hit a Store.</p>}
          <ul className="inv-list">
            {inventory.map((stack) => {
              const item = catalogItem(stack.id);
              const on = equipped.has(stack.id);
              return (
                <li key={stack.id}>
                  <div className="inv-item-main">
                    <ItemImage id={stack.id} />
                    <div>
                      <strong>{item?.name ?? stack.id}</strong>
                      <span>
                        {item?.kind ?? "item"}
                        {stack.qty > 1 ? ` · ×${stack.qty}` : ""}
                        {on ? " · equipped" : ""}
                      </span>
                    </div>
                  </div>
                  {item && item.kind !== "crate" && (
                    <button type="button" className="btn btn-outline inv-mini" onClick={() => onEquip(stack.id)}>
                      {on ? "Unequip" : "Equip"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3>Property</h3>
          {homes.length === 0 && cars.length === 0 && (
            <p className="inv-empty">Nothing yet. Bid on an empty home, or visit a car lot.</p>
          )}
          <ul className="inv-list">
            {homes.map((home) => (
              <li key={home.id}>
                <div className="inv-item-main">
                  <span className="inv-prop-art inv-prop-home" aria-hidden />
                  <div>
                    <strong>Home in {cityName(home.city)}</strong>
                    <span>
                      {homeStatus(home)} · {home.locked ? "locked" : "unlocked"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
            {cars.map((car) => (
              <li key={car.id}>
                <div className="inv-item-main">
                  <span className="inv-prop-art" style={{ background: car.color }} aria-hidden />
                  <div>
                    <strong>{car.kind.charAt(0).toUpperCase() + car.kind.slice(1)}</strong>
                    <span>
                      parked in {cityName(car.city)} · {car.locked ? "locked" : "unlocked"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {inStore && (
          <section>
            <h3>For sale</h3>
            <ul className="inv-list">
              {stock.map((item) => {
                const owned = item.unique && stackCount(inventory, item.id) > 0;
                const locked = item.tier > accessTier;
                return (
                  <li key={item.id} className={locked ? "inv-locked" : ""}>
                    <div className="inv-item-main">
                      <ItemImage id={item.id} />
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {item.kind} · {item.price} cr
                          {locked && <span className="inv-tier-tag">TIER {item.tier}</span>}
                        </span>
                        <em>{locked ? `Work up to tier ${item.tier} to carry this.` : item.blurb}</em>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-accent inv-mini"
                      disabled={owned || locked}
                      onClick={() => onBuy(item.id)}
                    >
                      {owned ? "Owned" : locked ? `T${item.tier}` : "Buy"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export { itemName };
