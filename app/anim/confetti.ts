// Emoji confetti shown on every round reveal. The emoji set scales with how
// good the placement was — from a sad face for a bad guess all the way up to
// the eggplant for a (near-)perfect drop. Browser-only (canvas-confetti uses
// the DOM/canvas), so all entry points guard on `window` and reduced motion.

import confetti from "canvas-confetti";

import { prefersReducedMotion } from "~/anim/gsap";

/**
 * Emoji tiers keyed by placement quality in [0, 1] (1 = perfect). Each tier is
 * a small set of emojis fired together; quality climbs from despair to triumph.
 */
const TIERS: { max: number; emojis: string[] }[] = [
  { max: 0.2, emojis: ["😢", "😭", "💀"] }, // total miss
  { max: 0.4, emojis: ["😟", "😕", "😬"] }, // poor
  { max: 0.6, emojis: ["😐", "🤔", "😅"] }, // meh
  { max: 0.8, emojis: ["🙂", "😄", "👍"] }, // decent
  { max: 0.95, emojis: ["😎", "🔥", "🤩"] }, // great
  { max: Infinity, emojis: ["🍆", "💦", "🎉", "🥵"] }, // (near-)perfect
];

function emojisForQuality(quality: number): string[] {
  const q = Math.max(0, Math.min(1, quality));
  return (TIERS.find((t) => q <= t.max) ?? TIERS[TIERS.length - 1]).emojis;
}

/**
 * Fire emoji confetti reflecting how good the round was.
 * @param quality 0 (worst) … 1 (perfect placement).
 */
export function celebrateResult(quality: number): void {
  if (typeof window === "undefined") return;
  if (prefersReducedMotion()) return;

  const emojis = emojisForQuality(quality);
  const scalar = 4; // big emojis so they're easy to read
  const shapes = emojis.map((char) =>
    confetti.shapeFromText({ text: char, scalar }),
  );

  // Better results get a slightly fuller burst.
  const particleCount = Math.round(14 + quality * 26);

  // One gentle burst from the middle of the screen. Low velocity + low gravity
  // + long lifetime so the emojis float slowly and stay readable.
  confetti({
    particleCount,
    spread: 70,
    startVelocity: 22 + quality * 10,
    gravity: 0.4,
    decay: 0.92,
    ticks: 400,
    scalar,
    shapes,
    origin: { x: 0.5, y: 0.5 },
    disableForReducedMotion: true,
  });
}
