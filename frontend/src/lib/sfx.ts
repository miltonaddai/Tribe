/**
 * Sound effects, synthesised rather than loaded.
 *
 * The whole game is built from primitives - no models, no textures - so a
 * gunshot is built the same way: a burst of filtered noise for the crack, a
 * short low sine for the thump in the chest, and a tail of quieter noise for
 * the slap coming back off the buildings. No asset to ship, no load to wait on,
 * and each weapon is a few numbers rather than a separate file.
 */

let ctx: AudioContext | null = null;
/** Master gain, 0-1. Set from the settings sliders. */
let volume = 0.55;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/**
 * The context is created on the first shot, not at start-up: browsers refuse to
 * start audio until the page has been interacted with, and a context created
 * too early is stuck suspended.
 */
function audio(): { ctx: AudioContext; master: GainNode } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return master ? { ctx, master } : null;
  } catch {
    // Audio is a nice-to-have; never let it break the game loop.
    return null;
  }
}

/** One second of white noise, generated once and reused by every shot. */
function noiseBuffer(context: AudioContext) {
  if (noise) return noise;
  const buf = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

type Shot = { crack: number; body: number; decay: number; tail: number; level: number };

/** Per weapon: bigger guns are lower, longer and louder. */
const SHOTS: Record<string, Shot> = {
  pistol: { crack: 1800, body: 140, decay: 0.16, tail: 0.22, level: 0.9 },
  rifle: { crack: 1100, body: 90, decay: 0.26, tail: 0.42, level: 1 },
};

/**
 * `distance` attenuates a shot fired by someone else, so a gunfight across the
 * plaza does not sound like it is in your ear. Omit it for your own weapon.
 */
export function playGunshot(gun: string | null, distance = 0) {
  const a = audio();
  if (!a) return;
  const shot = SHOTS[gun ?? ""] ?? SHOTS.pistol;

  // Linear rolloff to silence at 60 units, which is roughly the render range.
  const near = Math.max(0, 1 - distance / 60);
  if (near <= 0.01) return;
  const level = shot.level * near * near;

  const { ctx: c, master: out } = a;
  const t = c.currentTime;

  // The crack: noise through a band-pass, gone almost immediately.
  const burst = c.createBufferSource();
  burst.buffer = noiseBuffer(c);
  burst.playbackRate.value = 1.4;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = shot.crack;
  band.Q.value = 0.8;
  const crackGain = c.createGain();
  crackGain.gain.setValueAtTime(level, t);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + shot.decay);
  burst.connect(band).connect(crackGain).connect(out);
  burst.start(t);
  burst.stop(t + shot.decay);

  // The thump: a short sine dropping in pitch, which is what gives it weight.
  const thump = c.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(shot.body, t);
  thump.frequency.exponentialRampToValueAtTime(shot.body * 0.4, t + shot.decay);
  const thumpGain = c.createGain();
  thumpGain.gain.setValueAtTime(level * 0.8, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + shot.decay * 1.2);
  thump.connect(thumpGain).connect(out);
  thump.start(t);
  thump.stop(t + shot.decay * 1.3);

  // The tail: quieter noise rolled off high, standing in for the buildings.
  const echo = c.createBufferSource();
  echo.buffer = noiseBuffer(c);
  echo.playbackRate.value = 0.7;
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 900;
  const echoGain = c.createGain();
  echoGain.gain.setValueAtTime(0, t);
  echoGain.gain.linearRampToValueAtTime(level * 0.18, t + 0.03);
  echoGain.gain.exponentialRampToValueAtTime(0.0001, t + shot.tail);
  echo.connect(low).connect(echoGain).connect(out);
  echo.start(t);
  echo.stop(t + shot.tail);
}

/**
 * Driven by the master and effects sliders, both 0-100.
 *
 * Applied to the shared gain rather than per shot, so changing a slider takes
 * effect on the next sound without threading settings through the game loop.
 */
export function setSfxVolume(masterPct: number, sfxPct: number) {
  const master01 = Math.max(0, Math.min(100, masterPct)) / 100;
  const sfx01 = Math.max(0, Math.min(100, sfxPct)) / 100;
  volume = 0.8 * master01 * sfx01;
  // Only touch the context if one already exists; creating it here would happen
  // outside a user gesture and start it suspended.
  if (ctx && master) master.gain.value = volume;
}
