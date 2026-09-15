import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CITIES, CITY_ORDER, seedInventory, type CityId, type CharacterRecord, type OutfitId, type HeadwearId } from "@the-block/shared";
import { isDevToolsEnabled } from "../lib/devTools";
import { connectDemo } from "../lib/wallet";
import { loadCharacter, saveCharacter } from "../lib/storage";
import { useWallet } from "../state/WalletStore";

const LOOKS: Record<CityId, { outfit: OutfitId; headwear: HeadwearId; name: string; balance: number }> = {
  trench: { outfit: "hi-vis", headwear: "hardhat", name: "trenchrat", balance: 0.001 },
  gas: { outfit: "hoodie", headwear: "beanie", name: "gasser", balance: 0.006 },
  realworld: { outfit: "neon", headwear: "cap", name: "realone", balance: 0.011 },
  valhalla: { outfit: "gold", headwear: "crown", name: "valhallan", balance: 0.02 },
};

const PAGES = [
  { to: "/", label: "Landing" },
  { to: "/docs", label: "Docs" },
  { to: "/create", label: "Create Character" },
  { to: "/play", label: "Play" },
  { to: "/play?settings=1", label: "Settings" },
];

export function DevLauncher() {
  const enabled = isDevToolsEnabled();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const { setWallet } = useWallet();
  const inGame = location.pathname === "/play";

  if (!enabled) return null;

  async function seedCity(city: CityId) {
    const look = LOOKS[city];
    const wallet = await connectDemo(look.balance);
    setWallet(wallet);
    const existing = loadCharacter();
    const record: CharacterRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      wallet: wallet.address,
      displayName: existing?.displayName || look.name,
      bodyType: existing?.bodyType ?? "regular",
      skinTone: existing?.skinTone ?? "#D4A017",
      outfit: look.outfit,
      pantsColor: existing?.pantsColor ?? "#3A3A3A",
      shoe: existing?.shoe ?? "sneakers",
      shoeColor: existing?.shoeColor ?? "#111111",
      headwear: look.headwear,
      accessories: existing?.accessories ?? [],
      homeCity: city,
      accessTier: CITIES[city].tier,
      brokemeter: 100,
      credits: existing?.credits ?? 500,
      inventory: existing?.inventory ?? seedInventory(existing?.accessories ?? []),
      equippedGun: existing?.equippedGun ?? null,
      equippedPet: existing?.equippedPet ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    saveCharacter(record, wallet.chain);
    setOpen(false);
    nav(`/play?city=${city}`);
  }

  async function go(to: string) {
    if (to.startsWith("/play") && !loadCharacter()) {
      await seedCity("trench");
      if (to.includes("settings")) nav("/play?city=trench&settings=1");
      return;
    }
    setOpen(false);
    nav(to);
  }

  return (
    <div className={`dev-launcher ${inGame ? "in-game" : ""}`}>
      {open && (
        <div className="dev-panel">
          <div className="dev-panel-head">
            <span>DEV TOOLS</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <p className="dev-kicker">Pages</p>
          {PAGES.map((page) => (
            <button key={page.to} type="button" className="dev-link" onClick={() => void go(page.to)}>
              {page.label}
            </button>
          ))}
          <p className="dev-kicker">Game modes</p>
          {CITY_ORDER.map((id) => {
            const city = CITIES[id];
            return (
              <button
                key={id}
                type="button"
                className="dev-link"
                onClick={() => void seedCity(id)}
                style={{ borderLeftColor: city.accent }}
              >
                <span>{city.name}</span>
                <em>Tier {city.tier}</em>
              </button>
            );
          })}
        </div>
      )}
      <button
        className="dev-fab"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open dev tools"
        title="Dev tools"
      >
        <svg viewBox="0 0 32 32" fill="none" width="22" height="22">
          <path d="M6 12 L16 7 L26 12 L16 17 Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6 12 L6 21 L16 26 L16 17" stroke="currentColor" strokeWidth="1.8" />
          <path d="M26 12 L26 21 L16 26" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
    </div>
  );
}
