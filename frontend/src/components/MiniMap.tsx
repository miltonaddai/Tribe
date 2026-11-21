import { CarMarker, HomeMarker } from "./ItemArt";
import {
  CITIES,
  CITY_BOUNDS,
  CITY_GRID,
  CITY_SIZE,
  CITY_WALL_OUTSET,
  LANDMARKS,
  cityAtPosition,
  lotCentre,
  parseHomeId,
  type CityId,
} from "@tribe/shared";
import type { MapCitizen, OwnedCar, OwnedHome } from "../game/engine";

const W = 218;
const H = 150;
/** World units across the minimap. A local view, not the whole district. */
const SPAN = 132;
const CELL = CITY_SIZE / CITY_GRID;
const ROAD_W = 10;
const LOT = CELL - ROAD_W - 0.8;

const LANDMARK_LABEL: Record<string, string> = {
  townhouse: "H",
  hospital: "+",
  police: "P",
  store: "S",
  dealer: "C",
  park: "",
};

export function MiniMap({
  city,
  x,
  z,
  heading,
  citizens,
  homes,
  cars,
}: {
  city: CityId;
  x: number;
  z: number;
  heading: number;
  citizens: MapCitizen[];
  homes: OwnedHome[];
  cars: OwnedCar[];
}) {
  const theme = CITIES[city];
  const scale = W / SPAN;
  // North stays up; only the player marker turns. Rotating the whole map makes
  // a grid city much harder to read.
  const px = (wx: number) => W / 2 + (wx - x) * scale;
  const pz = (wz: number) => H / 2 - (wz - z) * scale;
  const half = SPAN / 2;
  const visible = (wx: number, wz: number, pad = 8) =>
    Math.abs(wx - x) < half + pad && Math.abs(wz - z) < (half * H) / W + pad;

  const b = CITY_BOUNDS[city];
  const lines: number[] = [];
  for (let i = 0; i <= CITY_GRID; i++) lines.push(i);

  const wall = {
    x0: px(b.minX - CITY_WALL_OUTSET),
    x1: px(b.maxX + CITY_WALL_OUTSET),
    z0: pz(b.maxZ + CITY_WALL_OUTSET),
    z1: pz(b.minZ - CITY_WALL_OUTSET),
  };

  return (
    <svg className="minimap-canvas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Local map">
      <defs>
        <clipPath id="mini-clip">
          <rect x="0" y="0" width={W} height={H} rx="4" />
        </clipPath>
      </defs>
      <g clipPath="url(#mini-clip)">
        <rect x="0" y="0" width={W} height={H} fill="#0d0f12" />

        {/* Roads run along every lot boundary. */}
        {lines.map((i) => {
          const wx = b.minX + i * CELL;
          return visible(wx, z, ROAD_W) ? (
            <rect key={`ns${i}`} x={px(wx) - (ROAD_W / 2) * scale} y={0} width={ROAD_W * scale} height={H} fill="#1c2027" />
          ) : null;
        })}
        {lines.map((i) => {
          const wz = b.minZ + i * CELL;
          return visible(x, wz, ROAD_W) ? (
            <rect key={`ew${i}`} x={0} y={pz(wz) - (ROAD_W / 2) * scale} width={W} height={ROAD_W * scale} fill="#1c2027" />
          ) : null;
        })}

        {/* Blocks, with landmarks picked out. */}
        {Array.from({ length: CITY_GRID }).flatMap((_, gx) =>
          Array.from({ length: CITY_GRID }).map((_, gz) => {
            const c = lotCentre(city, gx, gz);
            if (!visible(c.x, c.z, CELL)) return null;
            const mark = LANDMARKS.find((l) => l.gx === gx && l.gz === gz);
            const fill = mark ? (mark.kind === "park" ? "#1d3a26" : "#2b3038") : "#181b20";
            return (
              <g key={`lot${gx}-${gz}`}>
                <rect
                  x={px(c.x) - (LOT / 2) * scale}
                  y={pz(c.z) - (LOT / 2) * scale}
                  width={LOT * scale}
                  height={LOT * scale}
                  fill={fill}
                  stroke={mark ? theme.accent + "55" : "#22262d"}
                  strokeWidth="0.6"
                />
                {mark && LANDMARK_LABEL[mark.kind] && (
                  <text x={px(c.x)} y={pz(c.z) + 3.2} className="mini-landmark" textAnchor="middle">
                    {LANDMARK_LABEL[mark.kind]}
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* City wall, with the two gate gaps left open. */}
        <rect
          x={wall.x0}
          y={wall.z0}
          width={wall.x1 - wall.x0}
          height={wall.z1 - wall.z0}
          fill="none"
          stroke={theme.accent}
          strokeWidth="1.4"
          opacity="0.75"
        />

        {/* Things you own. */}
        {homes.map((home) => {
          const lot = parseHomeId(home.id);
          if (!lot || lot.city !== city) return null;
          const c = lotCentre(lot.city, lot.gx, lot.gz);
          if (!visible(c.x, c.z)) return null;
          return (
            <g key={home.id} transform={`translate(${px(c.x)} ${pz(c.z)})`}>
              <HomeMarker accent={theme.accent} />
            </g>
          );
        })}
        {cars.map((car) =>
          car.city === city && visible(car.x, car.z) ? (
            <g key={car.id} transform={`translate(${px(car.x)} ${pz(car.z)})`}>
              <CarMarker color={car.color} size={0.85} />
            </g>
          ) : null,
        )}

        {/* Other citizens; friends stand out. */}
        {citizens.map((c) =>
          !c.you && visible(c.x, c.z) ? (
            <circle
              key={c.sessionId}
              cx={px(c.x)}
              cy={pz(c.z)}
              r={c.friend ? 3.4 : 2.4}
              fill={c.friend ? "#3ddc84" : "#8a93a0"}
              opacity={c.indoors ? 0.5 : 1}
            />
          ) : null,
        )}

        {/* You, pointing where you are facing. */}
        <g transform={`translate(${W / 2} ${H / 2}) rotate(${(heading * 180) / Math.PI})`}>
          <path d="M0 -7 L5 6 L0 3 L-5 6 Z" fill="#ffb830" stroke="#1a1200" strokeWidth="0.8" />
        </g>
      </g>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="4" fill="none" stroke="rgba(255,255,255,0.12)" />
    </svg>
  );
}

export function zoneLabel(x: number, z: number) {
  const zone = cityAtPosition(x, z);
  if (zone === "gate") return "GATE BELT";
  if (zone === "void") return "OUTSIDE";
  return CITIES[zone].shortName;
}
