import * as pc from "playcanvas";
import type { CityTheme } from "@block/shared";

export const TIME_OF_DAY = ["Local Time", "Always Day", "Always Night"] as const;

/** 1 = midday, 0 = night. Smooth dawn ~5:30–7:45 and dusk ~17:15–20:00 in local time. */
export function dayFactor(mode?: string, now = new Date()) {
  if (mode === "Always Day") return 1;
  if (mode === "Always Night") return 0;
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  return smoothstep(5.5, 7.75, h) * (1 - smoothstep(17.25, 20, h));
}

export function applySkyCycle(app: pc.AppBase, theme: CityTheme, day: number) {
  const pal = mixPalette(theme, day);
  app.scene.ambientLight = new pc.Color(pal.ambient[0], pal.ambient[1], pal.ambient[2]);
  app.scene.fog.color = new pc.Color(pal.fog[0], pal.fog[1], pal.fog[2]);
  const sun = app.root.findByName("sun") as pc.Entity | null;
  const fill = app.root.findByName("fill") as pc.Entity | null;
  if (sun?.light) {
    sun.light.color = new pc.Color(pal.sun[0], pal.sun[1], pal.sun[2]);
    sun.light.intensity = pal.sunIntensity;
    sun.setEulerAngles(8 + day * 50, 18 + day * 32, 0);
  }
  if (fill?.light) {
    const night = 1 - day;
    fill.light.color = new pc.Color(0.38 + night * 0.08, 0.48, 0.72 + night * 0.1);
    fill.light.intensity = 0.16 + night * 0.4;
  }
  return pal;
}

function mixPalette(theme: CityTheme, day: number) {
  const dayPal = dayLook(theme);
  const nightPal = nightLook(theme);
  return {
    sky: mix3(nightPal.sky, dayPal.sky, day),
    fog: mix3(nightPal.fog, dayPal.fog, day),
    ambient: mix3(nightPal.ambient, dayPal.ambient, day),
    sun: mix3(nightPal.sun, dayPal.sun, day),
    sunIntensity: nightPal.sunIntensity + (dayPal.sunIntensity - nightPal.sunIntensity) * day,
  };
}

function dayLook(theme: CityTheme) {
  if (!theme.night) {
    return {
      sky: theme.sky,
      fog: theme.fog,
      ambient: theme.ambient,
      sun: theme.sun,
      sunIntensity: 1.15,
    };
  }
  // A night-native district still gets its own daylight - green-cast rather
  // than blue, so it never reads as the same city as its neighbours - but a
  // full one. Muting it to protect the neon cost 40% of the light the other
  // districts get (lit luma 0.37 against their 0.62) on top of a building
  // palette that is already near-black, and midday looked like dusk. The neon
  // is dimmed by setCycleGlow in daylight anyway, which is the right lever.
  return {
    sky: [0.52, 0.72, 0.66] as [number, number, number],
    fog: [0.62, 0.76, 0.7] as [number, number, number],
    ambient: [0.5, 0.58, 0.52] as [number, number, number],
    sun: [0.92, 1.0, 0.9] as [number, number, number],
    sunIntensity: 1.12,
  };
}

/**
 * How far a district's daytime palette is pulled toward night.
 *
 * Ambient is the main lever: it lifts every surface uniformly, so raising it
 * brightens the streets without washing out the sky or flattening the lamps'
 * pools. The sky stays deep - a bright sky at midnight reads as dusk, not night.
 */
const NIGHT_FLOOR = {
  sky: [0.04, 0.05, 0.1] as [number, number, number],
  fog: [0.08, 0.1, 0.16] as [number, number, number],
  ambient: [0.14, 0.16, 0.24] as [number, number, number],
};
/** Ambient keeps more of the district's own colour than sky or fog do. */
const NIGHT_MIX = { sky: 0.86, fog: 0.76, ambient: 0.68 };
/** Moonlight. Enough to shape geometry so buildings are not flat silhouettes. */
const MOONLIGHT = 0.34;

function nightLook(theme: CityTheme) {
  if (theme.night) {
    return {
      sky: theme.sky,
      fog: theme.fog,
      // Night-native districts are lit by their own neon, so they only need a
      // nudge above their base ambient rather than the full lift.
      ambient: mix3(theme.ambient, [0.16, 0.22, 0.18], 0.45),
      sun: theme.sun,
      sunIntensity: 0.3,
    };
  }
  return {
    sky: mix3(theme.sky, NIGHT_FLOOR.sky, NIGHT_MIX.sky),
    fog: mix3(theme.fog, NIGHT_FLOOR.fog, NIGHT_MIX.fog),
    ambient: mix3(theme.ambient, NIGHT_FLOOR.ambient, NIGHT_MIX.ambient),
    sun: [0.42, 0.5, 0.78] as [number, number, number],
    sunIntensity: MOONLIGHT,
  };
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
