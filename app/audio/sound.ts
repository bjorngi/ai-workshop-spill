// Tiny synthesized sound engine — no asset files, just the Web Audio API.
//
// Everything routes through a single master GainNode whose gain is the
// persisted "volume". There is intentionally NO mute: the on-screen button is a
// gag that only ever turns the volume UP (see bumpVolume / VolumeButton).

export type SoundName =
  | "click"
  | "drop"
  | "lockIn"
  | "reveal"
  | "win"
  | "lose"
  | "roundStart"
  | "louder";

const STORAGE_KEY = "spill-volume";
const DEFAULT_VOLUME = 0.6;
const VOLUME_STEP = 0.35; // how much each "louder" press adds
const VOLUME_CAP = 3; // safety ceiling so it can't truly blow out

let volume = readStoredVolume();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const listeners = new Set<(v: number) => void>();

function readStoredVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const raw = window.localStorage?.getItem(STORAGE_KEY);
  const n = raw == null ? NaN : Number.parseFloat(raw);
  return Number.isFinite(n) ? clampVolume(n) : DEFAULT_VOLUME;
}

function clampVolume(v: number): number {
  return Math.min(VOLUME_CAP, Math.max(0, v));
}

function persist() {
  try {
    window.localStorage?.setItem(STORAGE_KEY, String(volume));
  } catch {
    /* ignore */
  }
}

/** Lazily create the AudioContext on first use (must be a user gesture). */
function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && master) return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  return ctx;
}

/** A single oscillator "note" with an attack/decay envelope. */
function note(
  c: AudioContext,
  out: GainNode,
  opts: {
    freq: number;
    endFreq?: number;
    type?: OscillatorType;
    start?: number;
    dur: number;
    gain?: number;
  },
) {
  const t = c.currentTime + (opts.start ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, opts.endFreq),
      t + opts.dur,
    );
  }
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + opts.dur + 0.02);
}

const A4 = 440;
const semis = (n: number) => A4 * Math.pow(2, n / 12);

/** Play one of the synthesized one-shots. No-op on the server. */
export function playSound(name: SoundName) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume();
  const m = master;

  switch (name) {
    case "click":
      note(c, m, { freq: 660, type: "square", dur: 0.06, gain: 0.18 });
      break;
    case "drop":
      note(c, m, { freq: 520, endFreq: 180, type: "triangle", dur: 0.16 });
      break;
    case "lockIn":
      note(c, m, { freq: 200, endFreq: 90, type: "sawtooth", dur: 0.18, gain: 0.28 });
      note(c, m, { freq: 740, type: "square", dur: 0.09, gain: 0.16, start: 0.02 });
      break;
    case "reveal":
      [0, 4, 7, 12].forEach((s, i) =>
        note(c, m, { freq: semis(s), type: "triangle", dur: 0.22, start: i * 0.05 }),
      );
      break;
    case "roundStart":
      note(c, m, { freq: 300, endFreq: 900, type: "sawtooth", dur: 0.18, gain: 0.18 });
      break;
    case "win":
      [0, 4, 7, 12, 16].forEach((s, i) =>
        note(c, m, { freq: semis(s), type: "square", dur: 0.3, start: i * 0.08, gain: 0.22 }),
      );
      break;
    case "lose":
      [4, 2, 0, -3].forEach((s, i) =>
        note(c, m, { freq: semis(s), type: "sawtooth", dur: 0.28, start: i * 0.1, gain: 0.2 }),
      );
      break;
    case "louder":
      note(c, m, { freq: 320, endFreq: 1100, type: "square", dur: 0.28, gain: 0.3 });
      break;
  }
}

export function getVolume(): number {
  return volume;
}

export function getVolumeCap(): number {
  return VOLUME_CAP;
}

/** The gag: nudge the master volume UP (never down, never mute). */
export function bumpVolume(): number {
  volume = clampVolume(volume + VOLUME_STEP);
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  persist();
  listeners.forEach((cb) => cb(volume));
  playSound("louder");
  return volume;
}

export function subscribeVolume(cb: (v: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
