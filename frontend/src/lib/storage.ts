import type { CharacterRecord, GameSettings, WalletChainId } from "@tribe/shared";
import { apiUrl } from "./api";
import { DEFAULT_SETTINGS, isGunId, isPetId, parseAccessories, parseHexColor, parseShoe, seedInventory } from "@tribe/shared";

const CHAR = "tribe:character";
const SETTINGS = "tribe:settings";

function normalizeWallet(address: string, chain?: WalletChainId) {
  if (chain === "robinhood" || address.startsWith("0x")) return address.toLowerCase();
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
      tribute: Number.isFinite(parsed.tribute) ? parsed.tribute : 0,
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

/**
 * Returns null on success, or a message to show the player.
 *
 * Names are unique, so this can legitimately refuse - and the caller must not
 * save locally until it succeeds, or the browser ends up holding a name the
 * server rejected.
 */
export async function persistCharacter(
  record: CharacterRecord,
  chain: WalletChainId,
): Promise<string | null> {
  try {
    const res = await fetch(apiUrl("/api/characters"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...record, chain }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Could not save your character.";
  } catch {
    // Offline or the backend is down. The local copy still stands, and the name
    // is checked again on the next successful save.
    return null;
  }
}

/** Live uniqueness check for the create page. */
export async function checkNameAvailable(
  name: string,
  address: string,
  chain: WalletChainId,
): Promise<{ available: boolean; reason: string | null }> {
  try {
    const params = new URLSearchParams({ name, address, chain });
    const res = await fetch(apiUrl(`/api/names/check?${params}`));
    if (!res.ok) return { available: true, reason: null };
    const body = (await res.json()) as { available: boolean; reason: string | null };
    return body;
  } catch {
    // Do not block character creation because the check could not run.
    return { available: true, reason: null };
  }
}

export async function persistSettings(address: string, chain: WalletChainId, settings: GameSettings) {
  try {
    await fetch(apiUrl("/api/settings"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, chain, settings }),
    });
  } catch {
    // Keep the local copy even if Supabase is down.
  }
}
