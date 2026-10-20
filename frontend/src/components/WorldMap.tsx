import {
  CITIES,
  CITY_BOUNDS,
  CITY_GRID,
  CITY_ORDER,
  CITY_SIZE,
  CITY_WALL_OUTSET,
  GATE_HALF,
  LANDMARKS,
  WORLD_HALF,
  cityAtPosition,
  cityGates,
  lotCentre,
  parseHomeId,
  type CityId,
} from "@moonville/shared";
import { CarMarker, HomeMarker } from "./ItemArt";
import type { MapCitizen, OwnedCar, OwnedHome } from "../game/engine";

const OUTER = WORLD_HALF;
const S = OUTER * 2;
const CELL = CITY_SIZE / CITY_GRID;
const ROAD_W = 10;
const LOT = CELL - ROAD_W - 0.8;
const GATE_W = 13;

/** World coordinates to SVG, with z flipped so north is up. */
const px = (x: number) => x + OUTER;
const pz = (z: number) => OUTER - z;

const LANDMARK_LABEL: Record<string, string> = {
  townhouse: "H",
  hospital: "+",
  police: "P",
  store: "S",
  dealer: "C",
  park: "",
};

/** Wall runs for one edge, split around the gate opening if it has one. */
function wallRuns(from: number, to: number, gapAt: number | null): [number, number][] {
  if (gapAt == null) return [[from, to]];
  return [
    [from, gapAt - GATE_W / 2],
    [gapAt + GATE_W / 2, to],
  ];
}

function District({ id, locked }: { id: CityId; locked: boolean }) {
  const theme = CITIES[id];
  const b = CITY_BOUNDS[id];
  const gates = cityGates(id);
  const x0 = b.minX - CITY_WALL_OUTSET;
  const x1 = b.maxX + CITY_WALL_OUTSET;
  const z0 = b.minZ - CITY_WALL_OUTSET;
  const z1 = b.maxZ + CITY_WALL_OUTSET;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;

  return (
    <g opacity={locked ? 0.45 : 1}>
      <rect x={px(b.minX)} y={pz(b.maxZ)} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="#14171c" />

      {/* Streets on every lot boundary. */}
      {Array.from({ length: CITY_GRID + 1 }).map((_, i) => (
        <g key={i}>
          <rect x={px(b.minX + i * CELL) - ROAD_W / 2} y={pz(b.maxZ)} width={ROAD_W} height={CITY_SIZE} fill="#1e232a" />
          <rect x={px(b.minX)} y={pz(b.minZ + i * CELL) - ROAD_W / 2} width={CITY_SIZE} height={ROAD_W} fill="#1e232a" />
        </g>
      ))}

      {/* Blocks, with landmarks picked out. */}
      {Array.from({ length: CITY_GRID }).flatMap((_, gx) =>
        Array.from({ length: CITY_GRID }).map((_, gz) => {
          const c = lotCentre(id, gx, gz);
          const mark = LANDMARKS.find((l) => l.gx === gx && l.gz === gz);
          return (
            <g key={`${gx}-${gz}`}>
              <rect
                x={px(c.x) - LOT / 2}
                y={pz(c.z) - LOT / 2}
                width={LOT}
                height={LOT}
                fill={mark ? (mark.kind === "park" ? "#1d3a26" : "#2b3038") : "#191d22"}
                stroke={mark ? theme.accent + "66" : "#23272e"}
                strokeWidth="0.8"
              />
              {mark && LANDMARK_LABEL[mark.kind] && (
                <text x={px(c.x)} y={pz(c.z) + 4} className="wm-landmark" textAnchor="middle">
                  {LANDMARK_LABEL[mark.kind]}
                </text>
              )}
            </g>
          );
        }),
      )}

      {/* City wall, broken at the gates. */}
      <g stroke={theme.accent} strokeWidth="2.4" opacity="0.85">
        {wallRuns(x0, x1, gates.south ? cx : null).map(([a, c], i) => (
          <line key={`s${i}`} x1={px(a)} y1={pz(z0)} x2={px(c)} y2={pz(z0)} />
        ))}
        {wallRuns(x0, x1, gates.north ? cx : null).map(([a, c], i) => (
          <line key={`n${i}`} x1={px(a)} y1={pz(z1)} x2={px(c)} y2={pz(z1)} />
        ))}
        {wallRuns(z0, z1, gates.west ? cz : null).map(([a, c], i) => (
          <line key={`w${i}`} x1={px(x0)} y1={pz(a)} x2={px(x0)} y2={pz(c)} />
        ))}
        {wallRuns(z0, z1, gates.east ? cz : null).map(([a, c], i) => (
          <line key={`e${i}`} x1={px(x1)} y1={pz(a)} x2={px(x1)} y2={pz(c)} />
        ))}
      </g>

      <text x={px(cx)} y={pz(cz)} className="wm-city" textAnchor="middle" fill={theme.accent}>
        {theme.shortName}
      </text>
      <text x={px(cx)} y={pz(cz) + 13} className="wm-tier" textAnchor="middle">
        {locked ? `LOCKED - TIER ${theme.tier}` : `TIER ${theme.tier}`}
      </text>
    </g>
  );
}

export function WorldMap({
  youCity,
  accessTier,
  citizens,
  homes,
  cars,
  heading,
  connected,
  onClose,
}: {
  youCity: CityId;
  accessTier: number;
  citizens: MapCitizen[];
  homes: OwnedHome[];
  cars: OwnedCar[];
  heading: number;
  connected: boolean;
  onClose: () => void;
}) {
  const others = citizens.filter((c) => !c.you);
  const you = citizens.find((c) => c.you);
  const friends = others.filter((c) => c.friend);
  const status = !connected
    ? "Not connected to the world server, other citizens will not appear"
    : `${others.length} citizen${others.length === 1 ? "" : "s"} online${
        friends.length ? ` · ${friends.length} friend${friends.length === 1 ? "" : "s"}` : ""
      }`;

  return (
    <div className="world-map-overlay" onClick={onClose} role="presentation">
      <div className="world-map-panel" onClick={(e) => e.stopPropagation()}>
        <div className="world-map-head">
          <div>
            <h2>World Map</h2>
            <p>{status}</p>
          </div>
          <button type="button" className="whisper-close" onClick={onClose} aria-label="Close map">
            ×
          </button>
        </div>

        <div className="world-map-body">
          <svg className="world-map" viewBox={`0 0 ${S} ${S}`} role="img" aria-label="World map">
            <rect x="0" y="0" width={S} height={S} fill="#0b0d10" />

            {/* Gate belt: the connector roads running between the districts. */}
            <rect x={px(-GATE_HALF)} y="0" width={GATE_HALF * 2} height={S} fill="#171b21" />
            <rect x="0" y={pz(GATE_HALF)} width={S} height={GATE_HALF * 2} fill="#171b21" />
            <rect
              x={px(-GATE_HALF)}
              y={pz(GATE_HALF)}
              width={GATE_HALF * 2}
              height={GATE_HALF * 2}
              fill="#20262e"
              stroke="#3a424c"
            />

            {CITY_ORDER.map((id) => (
              <District key={id} id={id} locked={CITIES[id].tier > accessTier} />
            ))}

            {/* Perimeter wall. */}
            <rect x="1.5" y="1.5" width={S - 3} height={S - 3} fill="none" stroke="#4a5058" strokeWidth="3" />

            {/* Property you own. */}
            {homes.map((home) => {
              const lot = parseHomeId(home.id);
              if (!lot) return null;
              const c = lotCentre(lot.city, lot.gx, lot.gz);
              return (
                <g key={home.id} transform={`translate(${px(c.x)} ${pz(c.z)})`}>
                  <HomeMarker accent={CITIES[lot.city].accent} size={1.3} />
                  <title>{`${home.name || "Your home"} · ${CITIES[lot.city].shortName}`}</title>
                </g>
              );
            })}
            {cars.map((car) => (
              <g key={car.id} transform={`translate(${px(car.x)} ${pz(car.z)})`}>
                <CarMarker color={car.color} size={1.2} />
                <title>{`Your ${car.kind}`}</title>
              </g>
            ))}

            {others.map((c) => (
              <circle
                key={c.sessionId}
                cx={px(c.x)}
                cy={pz(c.z)}
                r={c.friend ? 6 : 4.5}
                fill={c.friend ? "#3ddc84" : "#8a93a0"}
                stroke="#000"
                strokeWidth="1.2"
                opacity={c.indoors ? 0.55 : 1}
              >
                <title>{`${c.name}${c.friend ? " · friend" : ""}${c.indoors ? " · indoors" : ""}`}</title>
              </circle>
            ))}

            {you && (
              <g transform={`translate(${px(you.x)} ${pz(you.z)}) rotate(${(heading * 180) / Math.PI})`}>
                <path d="M0 -11 L8 9 L0 5 L-8 9 Z" fill="#ffb830" stroke="#1a1200" strokeWidth="1.6" />
              </g>
            )}

            <text x={S - 18} y="26" className="wm-north" textAnchor="middle">
              N
            </text>
          </svg>

          <aside className="world-map-list">
            <div className="world-map-legend">
              <span>
                <i style={{ background: "#ffb830" }} /> You
              </span>
              <span>
                <i style={{ background: "#3ddc84" }} /> Friends
              </span>
              <span>
                <i style={{ background: "#8a93a0" }} /> Others
              </span>
            </div>

            {friends.length > 0 && (
              <>
                <strong>Friends online</strong>
                {friends.map((c) => {
                  const zone = cityAtPosition(c.x, c.z);
                  return (
                    <div key={c.sessionId} className="world-map-row friend">
                      <b style={{ color: "#3ddc84" }}>{c.name}</b>
                      <span>
                        {zone === "gate" ? "Plaza" : zone === "void" ? "Out of bounds" : CITIES[zone].name}
                        {c.indoors ? " · inside" : ""}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            <strong>Everyone</strong>
            {citizens.map((c) => {
              const zone = cityAtPosition(c.x, c.z);
              const label = zone === "gate" ? "Plaza" : zone === "void" ? "Out of bounds" : CITIES[zone].name;
              return (
                <div key={c.sessionId} className={`world-map-row ${c.you ? "you" : ""}`}>
                  <b style={{ color: c.you ? "#ffb830" : c.friend ? "#3ddc84" : "#ddd" }}>{c.you ? "You" : c.name}</b>
                  <span>
                    {label}
                    {c.indoors ? " · inside" : ""}
                  </span>
                </div>
              );
            })}
            {others.length === 0 && (
              <p className="world-map-empty">
                {connected
                  ? "You are the only one on the street right now."
                  : "Start the backend (port 2567) so other players can join this world."}
              </p>
            )}

            {(homes.length > 0 || cars.length > 0) && (
              <>
                <strong>Your property</strong>
                {homes.map((h) => {
                  const lot = parseHomeId(h.id);
                  return (
                    <div key={h.id} className="world-map-row">
                      {/* Matches the marker on the map: same shape, same district colour. */}
                      <b style={{ color: lot ? CITIES[lot.city].accent : "#ffb830" }}>{h.name || "Home"}</b>
                      <span>
                        {lot ? CITIES[lot.city].shortName : h.city} · {h.locked ? "locked" : "unlocked"}
                      </span>
                    </div>
                  );
                })}
                {cars.map((c) => (
                  <div key={c.id} className="world-map-row">
                    <b style={{ color: c.color }}>{c.kind}</b>
                    <span>
                      {CITIES[c.city as CityId]?.shortName ?? c.city} · {c.locked ? "locked" : "unlocked"}
                    </span>
                  </div>
                ))}
              </>
            )}

            <p className="world-map-home">
              Home district: <span style={{ color: CITIES[youCity].accent }}>{CITIES[youCity].name}</span>
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
