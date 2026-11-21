import { CURRENCY, CATALOG, CITIES, catalogItem, itemName, stackCount, type CityId, type InventoryStack, type ItemId } from "@tribe/shared";
import { HomeArt, ItemArt, VehicleArt } from "./ItemArt";

type OwnedHome = {
  id: string;
  name: string;
  city: string;
  lastPrice: number;
  forSale: boolean;
  askingPrice: number;
  highBid: number;
  awaitingSeller: boolean;
  locked: boolean;
};

type OwnedCar = {
  id: string;
  kind: string;
  color: string;
  city: string;
  locked: boolean;
  forSale: boolean;
  askingPrice: number;
};

function cityName(id: string) {
  return CITIES[id as CityId]?.shortName ?? id;
}

function homeStatus(home: OwnedHome) {
  // Homes sell outright now, so a listing is an asking price with no bidding
  // behind it and nothing for the seller to accept.
  if (home.forSale) return `listed at ${home.askingPrice} ${CURRENCY}`;
  return home.lastPrice > 0 ? `bought for ${home.lastPrice} ${CURRENCY}` : "owned";
}

export function InventoryPanel({
  bucks,
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
  bucks: number;
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
  // Every item still on sale is shown, above your tier included, so you can
  // see what exists and what it takes to carry it - only your access tier
  // decides what you can actually buy. Retired items are the exception: they
  // cannot be bought at any tier, so listing them would only mislead.
  // Outfits are sold at the fashion house, not here - listing them in the
  // general store would offer a purchase with no way to put the thing on.
  const stock = CATALOG.filter((item) => item.listed !== false && item.kind !== "outfit");
  const equipped = new Set<string>([...accessories, gun ?? "", pet ?? ""].filter(Boolean));

  return (
    <div className="inv-panel">
      <div className="inv-head">
        <div>
          <h2>{inStore ? "Store" : "Inventory"}</h2>
          <p>
            {bucks} {CURRENCY}
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
                    <ItemArt id={stack.id} />
                    <div>
                      <strong>{item?.name ?? stack.id}</strong>
                      <span>
                        {item?.kind ?? "item"}
                        {stack.qty > 1 ? ` · ×${stack.qty}` : ""}
                        {on ? " · equipped" : ""}
                      </span>
                    </div>
                  </div>
                  {item && (
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
                  <HomeArt id={home.id} city={home.city} />
                  <div>
                    <strong>{home.name || `Home in ${cityName(home.city)}`}</strong>
                    <span>
                      {home.name ? `${cityName(home.city)} · ` : ""}
                      {homeStatus(home)} · {home.locked ? "locked" : "unlocked"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
            {cars.map((car) => (
              <li key={car.id}>
                <div className="inv-item-main">
                  <VehicleArt kind={car.kind} color={car.color} />
                  <div>
                    <strong>{car.kind.charAt(0).toUpperCase() + car.kind.slice(1)}</strong>
                    <span>
                      {car.forSale
                        ? `listed at ${car.askingPrice} ${CURRENCY}`
                        : `parked in ${cityName(car.city)}`}{" "}
                      · {car.locked ? "locked" : "unlocked"}
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
                      <ItemArt id={item.id} />
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {item.kind} · {item.price} {CURRENCY}
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
