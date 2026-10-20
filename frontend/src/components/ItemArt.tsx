import { CITIES, homeFloors, parseHomeId, type CityId, type ItemId } from "@moonville/shared";

/**
 * Flat 2D icons for the store and inventory.
 *
 * Drawn rather than rendered. Snapshotting the 3D models looked faithful on
 * paper but failed in practice: half the catalog is near-black, several items
 * are only a few centimetres across, and at 62px they came out as dark smudges.
 * A legible icon beats an accurate one nobody can identify.
 *
 * Colours are taken from the in-game geometry, so a gold chain is the same gold
 * and a hi-vis pack the same grey - close enough to recognise, without pretending
 * to be a render.
 */

const V = "0 0 48 48";

/** Colours lifted from character.ts and vehicles.ts. */
const C = {
  dark: "#1B1F27",
  darker: "#111111",
  steel: "#6B7280",
  slate: "#374151",
  pack: "#1F2937",
  buckle: "#9CA3AF",
  gold: "#FFD700",
  neon: "#39FF14",
  blue: "#60A5FA",
  wood: "#3F2A14",
  dog: "#8B5A2B",
  dogDark: "#6B4423",
  cat: "#D4D4D8",
  catDark: "#9CA3AF",
  glass: "#2A3140",
};

function Art({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg className="item-art" viewBox={V} role="img" aria-label={label} focusable="false">
      {children}
    </svg>
  );
}

const ART: Partial<Record<ItemId, () => JSX.Element>> = {
  glasses: () => (
    <Art label="Glasses">
      <rect x="5" y="19" width="15" height="11" rx="3" fill={C.glass} stroke={C.darker} strokeWidth="2.5" />
      <rect x="28" y="19" width="15" height="11" rx="3" fill={C.glass} stroke={C.darker} strokeWidth="2.5" />
      <path d="M20 24h8" stroke={C.darker} strokeWidth="2.5" />
      <path d="M5 22 1 20M43 22l4-2" stroke={C.darker} strokeWidth="2.5" strokeLinecap="round" />
    </Art>
  ),
  earbuds: () => (
    <Art label="Earbuds">
      <rect x="7" y="13" width="13" height="13" rx="6.5" fill={C.buckle} />
      <rect x="10" y="24" width="7" height="12" rx="3.5" fill={C.darker} />
      <rect x="28" y="13" width="13" height="13" rx="6.5" fill={C.buckle} />
      <rect x="31" y="24" width="7" height="12" rx="3.5" fill={C.darker} />
    </Art>
  ),
  visor: () => (
    <Art label="Visor">
      <path d="M5 20a19 19 0 0 1 38 0v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill={C.darker} />
      <rect x="9" y="20" width="30" height="6" rx="3" fill={C.neon} />
    </Art>
  ),
  watch: () => (
    <Art label="Watch">
      <rect x="18" y="4" width="12" height="40" rx="4" fill={C.darker} />
      <rect x="11" y="15" width="26" height="18" rx="5" fill={C.slate} />
      <rect x="15" y="19" width="18" height="10" rx="3" fill={C.blue} />
    </Art>
  ),
  chain: () => (
    <Art label="Gold Chain">
      <path d="M11 9a16 16 0 0 0 26 0" stroke={C.gold} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M11 9a18 18 0 0 0 13 24 18 18 0 0 0 13-24" stroke={C.gold} strokeWidth="4.5" fill="none" />
      <path d="M24 33l4 7-4 4-4-4z" fill={C.gold} />
    </Art>
  ),
  backpack: () => (
    <Art label="Backpack">
      <path d="M14 12h20v3H14z" fill={C.darker} />
      <rect x="9" y="14" width="30" height="28" rx="6" fill={C.pack} />
      <rect x="9" y="14" width="30" height="9" rx="5" fill={C.slate} />
      <rect x="15" y="28" width="18" height="10" rx="3" fill={C.slate} />
      <rect x="15" y="31" width="18" height="2.5" fill={C.buckle} />
      <path d="M17 14c0-6 3-9 7-9s7 3 7 9" stroke={C.darker} strokeWidth="3" fill="none" />
    </Art>
  ),
  pipe: () => (
    <Art label="Lead Pipe">
      <rect x="6" y="20" width="32" height="8" rx="2" fill={C.steel} />
      <rect x="34" y="17" width="8" height="14" rx="2" fill={C.buckle} />
      <rect x="6" y="18" width="7" height="12" rx="2" fill={C.pack} />
    </Art>
  ),
  pistol: () => (
    <Art label="Sidearm">
      <path d="M7 16h30v9H22l-4 10h-8l3-10H7z" fill={C.darker} />
      <rect x="30" y="18" width="12" height="5" rx="1.5" fill={C.slate} />
      <rect x="10" y="25" width="8" height="12" rx="2" fill={C.pack} />
    </Art>
  ),
  rifle: () => (
    <Art label="Street Rifle">
      <rect x="4" y="19" width="12" height="9" rx="2" fill={C.wood} />
      <rect x="14" y="20" width="22" height="7" rx="2" fill={C.pack} />
      <rect x="34" y="21" width="12" height="4.5" rx="1.5" fill={C.darker} />
      <rect x="20" y="26" width="7" height="12" rx="2" fill={C.darker} />
      <rect x="15" y="26" width="5" height="8" rx="1.5" fill={C.pack} />
    </Art>
  ),
  mutt: () => (
    <Art label="Block Mutt">
      <rect x="8" y="20" width="24" height="13" rx="4" fill={C.dog} />
      <rect x="28" y="14" width="13" height="13" rx="4" fill={C.dog} />
      <rect x="37" y="19" width="7" height="6" rx="2" fill={C.dogDark} />
      <rect x="29" y="10" width="4" height="6" rx="1.5" fill={C.dogDark} />
      <rect x="11" y="31" width="5" height="9" rx="2" fill={C.dogDark} />
      <rect x="24" y="31" width="5" height="9" rx="2" fill={C.dogDark} />
      <path d="M8 24l-5-4" stroke={C.dogDark} strokeWidth="4" strokeLinecap="round" />
    </Art>
  ),
  cat: () => (
    <Art label="Alley Cat">
      <rect x="9" y="22" width="22" height="11" rx="5" fill={C.cat} />
      <rect x="27" y="15" width="12" height="12" rx="4" fill={C.cat} />
      <path d="M28 16l1-6 5 4zM38 16l-1-6-5 4z" fill={C.catDark} />
      <rect x="12" y="31" width="4.5" height="8" rx="2" fill={C.catDark} />
      <rect x="24" y="31" width="4.5" height="8" rx="2" fill={C.catDark} />
      <path d="M9 26c-6 0-6-9-1-11" stroke={C.catDark} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </Art>
  ),
};

export function ItemArt({ id }: { id: ItemId }) {
  const draw = ART[id];
  if (draw) return draw();
  // Anything without a drawing yet still gets a shape rather than a blank box.
  return (
    <Art label={String(id)}>
      <rect x="10" y="10" width="28" height="28" rx="6" fill={C.slate} />
    </Art>
  );
}

/** Cars, tinted with the colour the car actually is. */
export function VehicleArt({ kind, color }: { kind: string; color: string }) {
  const roof =
    kind === "sport"
      ? "M13 25l5-7h13l6 7z"
      : kind === "suv"
        ? "M11 24l4-9h18l5 9z"
        : "M12 24l5-8h14l5 8z";
  const height = kind === "suv" ? 12 : 10;
  return (
    <svg className="item-art" viewBox={V} role="img" aria-label={kind} focusable="false">
      <path d={roof} fill={color} opacity="0.75" />
      <rect x="5" y="24" width="38" height={height} rx="4" fill={color} />
      <rect x="15" y="19" width="12" height="5" rx="2" fill="#0B0E14" opacity="0.55" />
      <circle cx="14" cy={24 + height} r="4.5" fill="#15181F" />
      <circle cx="34" cy={24 + height} r="4.5" fill="#15181F" />
      <circle cx="14" cy={24 + height} r="1.8" fill={C.buckle} />
      <circle cx="34" cy={24 + height} r="1.8" fill={C.buckle} />
    </svg>
  );
}

/**
 * A home, drawn to match the building it actually is.
 *
 * Floors come from the same lot derivation the world builder uses, so a
 * four-storey Uptown tower does not get the same icon as a one-storey Trenches
 * house, and the tint is the district accent.
 */
export function HomeArt({ id, city }: { id: string; city: string }) {
  const lot = parseHomeId(id);
  const district = (lot?.city ?? (city as CityId)) as CityId;
  const accent = CITIES[district]?.accent ?? "#9B59D0";
  const floors = lot ? homeFloors(lot.city, lot.gx, lot.gz) : 2;

  // Capped so a ten-storey tower still fits; the real count shows as a badge.
  const shown = Math.min(floors, 5);
  const floorH = shown > 3 ? 6.5 : 9;
  const bodyTop = 42 - shown * floorH;
  const w = 26;
  const left = 24 - w / 2;

  return (
    <svg className="item-art" viewBox={V} role="img" aria-label={`Home, ${floors} floors`} focusable="false">
      {/* Light body on a dark tile. A dark one reads as nothing at this size,
          leaving only the roof showing - which looks like an arrow. */}
      <rect x={left} y={bodyTop} width={w} height={42 - bodyTop} rx="1.5" fill="#B9C2CF" />
      <path
        d={`M${left - 4} ${bodyTop} L24 ${bodyTop - 9} L${left + w + 4} ${bodyTop} Z`}
        fill={accent}
        stroke={accent}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {Array.from({ length: shown }).map((_, i) => {
        const wy = bodyTop + i * floorH + floorH * 0.22;
        const wh = floorH * 0.38;
        // Ground floor keeps its middle clear for the door.
        const ground = i === shown - 1;
        return (
          <g key={i} fill="#2B3240">
            <rect x={left + 3.5} y={wy} width={5} height={wh} rx="1" />
            {!ground && <rect x={24 - 2.5} y={wy} width={5} height={wh} rx="1" />}
            <rect x={left + w - 8.5} y={wy} width={5} height={wh} rx="1" />
          </g>
        );
      })}
      <rect x="21" y="34" width="6" height="8" rx="1" fill={accent} />
      <rect x={left - 2} y="42" width={w + 4} height="3" rx="1" fill="#7C8798" />
      {floors > shown && (
        <circle cx="39" cy="11" r="7" fill={accent} />
      )}
      {floors > shown && (
        <text x="39" y="14.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#141019">
          {floors}
        </text>
      )}
    </svg>
  );
}

/**
 * Map markers: the same house and car shapes, simplified to read at a few
 * pixels across.
 *
 * Separate from the inventory icons on purpose. Those are 48 units of detail
 * meant for a 62px tile; on a map a home is about ten pixels wide, where windows
 * and wheels turn to mush. Both are drawn centred on the origin so a caller can
 * place one with a translate and nothing else.
 */
export function HomeMarker({ accent, size = 1 }: { accent: string; size?: number }) {
  return (
    <g transform={`scale(${size})`}>
      <path
        d="M-5 5 L-5 -1 L0 -5.5 L5 -1 L5 5 Z"
        fill={accent}
        stroke="#0A0A0C"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <rect x="-1.5" y="0.6" width="3" height="4.4" fill="#0A0A0C" opacity="0.55" />
    </g>
  );
}

export function CarMarker({ color, size = 1 }: { color: string; size?: number }) {
  return (
    <g transform={`scale(${size})`}>
      <path d="M-3.4 -1.2 L-1.8 -3 L1.8 -3 L3.4 -1.2 Z" fill={color} opacity="0.8" />
      <rect x="-5.2" y="-1.4" width="10.4" height="4.4" rx="1.6" fill={color} stroke="#0A0A0C" strokeWidth="1" />
      <circle cx="-3" cy="3" r="1.5" fill="#0A0A0C" />
      <circle cx="3" cy="3" r="1.5" fill="#0A0A0C" />
    </g>
  );
}
