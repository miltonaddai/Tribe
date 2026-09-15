import * as pc from "playcanvas";
import type { CityTheme } from "@the-block/shared";

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
    fill.light.intensity = 0.16 + night * 0.28;
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
  // Night-native districts still get a muted daylight so neon can read in the sun.
  return {
    sky: [0.4, 0.55, 0.52] as [number, number, number],
    fog: [0.42, 0.56, 0.5] as [number, number, number],
    ambient: [0.34, 0.44, 0.38] as [number, number, number],
    sun: [0.7, 0.85, 0.72] as [number, number, number],
    sunIntensity: 0.9,
  };
}

function nightLook(theme: CityTheme) {
  if (theme.night) {
    return {
      sky: theme.sky,
      fog: theme.fog,
      ambient: theme.ambient,
      sun: theme.sun,
      sunIntensity: 0.2,
    };
  }
  return {
    sky: mix3(theme.sky, [0.03, 0.04, 0.08], 0.88),
    fog: mix3(theme.fog, [0.05, 0.06, 0.1], 0.82),
    ambient: mix3(theme.ambient, [0.07, 0.08, 0.14], 0.78),
    sun: [0.32, 0.4, 0.68] as [number, number, number],
    sunIntensity: 0.22,
  };
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
