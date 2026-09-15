import type { CharacterRecord, GameSettings, WalletChainId } from "@the-block/shared";
import { DEFAULT_SETTINGS, isGunId, isPetId, parseAccessories, parseHexColor, parseShoe, seedInventory } from "@the-block/shared";

const CHAR = "the-block:character";
const SETTINGS = "the-block:settings";

function normalizeWallet(address: string, chain?: WalletChainId) {
  if (chain === "robinhood-testnet" || address.startsWith("0x")) return address.toLowerCase();
  return address;
}

function charKey(address: string, chain?: WalletChainId) {
  return `${CHAR}:${normalizeWallet(address, chain)}`;
}

export function sameWallet(a: string | undefined, b: string | undefined, chain?: WalletChainId) {
  if (!a || !b) return false;
  return normalizeWallet(a, chain) === normalizeWallet(b, chain);
}

function parseCharacter(raw: unknown): CharacterRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as CharacterRecord;
  try {
    const accessories = parseAccessories(parsed.accessories);
    return {
      ...parsed,
      accessories,
      pantsColor: parseHexColor(parsed.pantsColor, "#3A3A3A"),
      shoe: parseShoe(parsed.shoe),
      shoeColor: parseHexColor(parsed.shoeColor, "#111111"),
      brokemeter: Number.isFinite(Number(parsed.brokemeter)) ? Math.min(100, Math.max(0, Number(parsed.brokemeter))) : 100,
      credits: Number.isFinite(parsed.credits) ? parsed.credits : 500,
      inventory: seedInventory(accessories, parsed.inventory),
      equippedGun: isGunId(String(parsed.equippedGun ?? "")) ? parsed.equippedGun : null,
      equippedPet: isPetId(String(parsed.equippedPet ?? "")) ? parsed.equippedPet : null,
    };
  } catch {
    return null;
  }
}

export function hydrateCharacter(raw: unknown): CharacterRecord | null {
  return parseCharacter(raw);
}

export function loadCharacter(): CharacterRecord | null {
  const raw = localStorage.getItem(CHAR);
  if (!raw) return null;
  try {
    return parseCharacter(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadCharacterForWallet(address: string, chain?: WalletChainId): CharacterRecord | null {
  const keyed = localStorage.getItem(charKey(address, chain));
  if (keyed) {
    try {
      const parsed = parseCharacter(JSON.parse(keyed));
      if (parsed && sameWallet(parsed.wallet, address, chain)) return parsed;
    } catch {
      // Fall through to the active slot.
    }
  }
  const current = loadCharacter();
  if (current && sameWallet(current.wallet, address, chain)) return current;
  return null;
}

export function saveCharacter(character: CharacterRecord, chain?: WalletChainId) {
  const payload = JSON.stringify(character);
  localStorage.setItem(CHAR, payload);
  if (character.wallet) localStorage.setItem(charKey(character.wallet, chain), payload);
}

export function loadSettings(): GameSettings {
  const raw = localStorage.getItem(SETTINGS);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as GameSettings & { brokemeterWarnings?: boolean };
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      healthWarnings: parsed.healthWarnings ?? parsed.brokemeterWarnings ?? DEFAULT_SETTINGS.healthWarnings,
      timeOfDay: ["Local Time", "Always Day", "Always Night"].includes(String(parsed.timeOfDay))
        ? parsed.timeOfDay
        : DEFAULT_SETTINGS.timeOfDay,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings) {
  localStorage.setItem(SETTINGS, JSON.stringify(settings));
}

export async function persistCharacter(record: CharacterRecord, chain: WalletChainId) {
  try {
    await fetch("/api/characters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...record, chain }),
    });
  } catch {
    // Keep the local copy even if Supabase is down.
  }
}

export async function persistSettings(address: string, chain: WalletChainId, settings: GameSettings) {
  try {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, chain, settings }),
    });
  } catch {
    // Keep the local copy even if Supabase is down.
  }
}
