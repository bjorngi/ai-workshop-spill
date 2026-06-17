// Pure axis math + scoring. No React, no DOM. The UI imports valueToFraction
// and axisDomain to render, so this stays framework-free.

import type { Card, Placement, Scale, Theme } from "~/game/types";

/** Smallest positive value we allow on a log axis. */
const LOG_MIN_CLAMP = 1e-6;

/**
 * Derive the [min, max] domain for an axis. Uses AxisConfig.min/max when set,
 * otherwise derives from the theme's card values on that axis, with ~5% padding
 * so points aren't on the very edge. For log scales the domain is padded in log
 * space and min is clamped to a small positive value.
 */
export function axisDomain(
  theme: Theme,
  axis: "x" | "y",
): { min: number; max: number } {
  const cfg = axis === "x" ? theme.xAxis : theme.yAxis;
  const scale = cfg.scale;

  const values = theme.cards.map((c) => (axis === "x" ? c.x : c.y));

  let dataMin = values.length ? Math.min(...values) : 0;
  let dataMax = values.length ? Math.max(...values) : 1;

  if (scale === "log") {
    dataMin = Math.max(dataMin, LOG_MIN_CLAMP);
    dataMax = Math.max(dataMax, dataMin);

    let lo = cfg.min !== undefined ? Math.max(cfg.min, LOG_MIN_CLAMP) : dataMin;
    let hi = cfg.max !== undefined ? Math.max(cfg.max, LOG_MIN_CLAMP) : dataMax;

    const logLo = Math.log10(lo);
    const logHi = Math.log10(hi);
    const span = logHi - logLo;
    const pad = span > 0 ? span * 0.05 : 0.05;

    const min = cfg.min !== undefined ? lo : Math.pow(10, logLo - pad);
    const max = cfg.max !== undefined ? hi : Math.pow(10, logHi + pad);
    return { min: Math.max(min, LOG_MIN_CLAMP), max };
  }

  // linear
  const lo = cfg.min !== undefined ? cfg.min : dataMin;
  const hi = cfg.max !== undefined ? cfg.max : dataMax;
  const span = hi - lo;
  const pad = span > 0 ? span * 0.05 : Math.max(Math.abs(hi), 1) * 0.05;

  const min = cfg.min !== undefined ? lo : lo - pad;
  const max = cfg.max !== undefined ? hi : hi + pad;
  return { min, max };
}

/**
 * Map a value to a fraction in [0, 1] (clamped) given the domain and scale.
 * Log scales use log10.
 */
export function valueToFraction(
  value: number,
  min: number,
  max: number,
  scale: Scale,
): number {
  let f: number;
  if (scale === "log") {
    const v = Math.max(value, LOG_MIN_CLAMP);
    const lo = Math.log10(Math.max(min, LOG_MIN_CLAMP));
    const hi = Math.log10(Math.max(max, LOG_MIN_CLAMP));
    f = hi === lo ? 0 : (Math.log10(v) - lo) / (hi - lo);
  } else {
    f = max === min ? 0 : (value - min) / (max - min);
  }
  if (f < 0) return 0;
  if (f > 1) return 1;
  return f;
}

/**
 * Inverse of valueToFraction: map a fraction in [0, 1] back to a value in the
 * domain. Used to show the player what value they "read off" the axis.
 */
export function fractionToValue(
  fraction: number,
  min: number,
  max: number,
  scale: Scale,
): number {
  if (scale === "log") {
    const lo = Math.log10(Math.max(min, LOG_MIN_CLAMP));
    const hi = Math.log10(Math.max(max, LOG_MIN_CLAMP));
    return Math.pow(10, lo + fraction * (hi - lo));
  }
  return min + fraction * (max - min);
}

/**
 * "Nice" tick values for an axis within [min, max]. Linear axes use a
 * 1/2/5×10ᵏ step; log axes emit a 1-2-5 sequence across decades so a wide
 * range yields several readable ticks (e.g. 50k/100k/200k/500k) rather than a
 * lone power of ten.
 */
export function axisTicks(
  min: number,
  max: number,
  scale: Scale,
  count = 5,
): number[] {
  if (!(max > min)) return [min];

  if (scale === "log") {
    const lo = Math.max(min, LOG_MIN_CLAMP);
    const loExp = Math.floor(Math.log10(lo));
    const hiExp = Math.ceil(Math.log10(max));
    const ticks: number[] = [];
    for (let e = loExp; e <= hiExp; e++) {
      for (const m of [1, 2, 5]) {
        const v = m * Math.pow(10, e);
        if (v >= min && v <= max) ticks.push(v);
      }
    }
    // Thin out if we somehow produced too many.
    if (ticks.length > 8) {
      const step = Math.ceil(ticks.length / 8);
      return ticks.filter((_, i) => i % step === 0);
    }
    return ticks.length ? ticks : [min, max];
  }

  // Linear: pick a nice step (1/2/5×10ᵏ) at least range/count.
  const rawStep = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 1e-9; v += step) {
    // Snap away tiny floating-point dust around zero.
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

/** Within this fraction of an axis from the true value counts as fully correct. */
export const SLACK = 0.1;
/** Distance (fraction of axis) at which partial credit reaches zero. */
const ZERO_CREDIT_DISTANCE = 0.5;

/**
 * Per-axis accuracy in [0, 1]: full credit within SLACK, fading linearly to 0
 * at ZERO_CREDIT_DISTANCE away.
 */
export function axisAccuracy(distance: number): number {
  if (distance <= SLACK) return 1;
  return Math.max(
    0,
    (ZERO_CREDIT_DISTANCE - distance) / (ZERO_CREDIT_DISTANCE - SLACK),
  );
}

export interface PlacementScore {
  /** Distance from the true X position, in fraction space [0, 1]. */
  xError: number;
  /** Distance from the true Y position, in fraction space [0, 1]. */
  yError: number;
  /** xError + yError — lower is better (used for multiplayer comparison). */
  total: number;
  /** Within the slack band on the X axis. */
  xCorrect: boolean;
  /** Within the slack band on the Y axis. */
  yCorrect: boolean;
}

/**
 * Score a placement by distance, not rank. Each axis: the player's dropped
 * fraction vs. the card's true fraction; the error is the absolute distance in
 * [0, 1]. Within SLACK on an axis counts as correct. Deterministic from the
 * card + theme + placement alone (no dependence on the anchor set), so both
 * peers compute identical results.
 *
 * Placement origin is bottom-left, so fy maps directly to the Y axis fraction.
 */
export function scorePlacement(
  card: Card,
  theme: Theme,
  placement: Placement,
): PlacementScore {
  const xDomain = axisDomain(theme, "x");
  const yDomain = axisDomain(theme, "y");

  const trueFx = valueToFraction(
    card.x,
    xDomain.min,
    xDomain.max,
    theme.xAxis.scale,
  );
  const trueFy = valueToFraction(
    card.y,
    yDomain.min,
    yDomain.max,
    theme.yAxis.scale,
  );

  const xError = Math.abs(placement.fx - trueFx);
  const yError = Math.abs(placement.fy - trueFy);
  return {
    xError,
    yError,
    total: xError + yError,
    xCorrect: xError <= SLACK,
    yCorrect: yError <= SLACK,
  };
}

/** Solo round points (0–3): both axes within slack ⇒ 3, fading with distance. */
export function roundPoints(score: PlacementScore): number {
  const accuracy = (axisAccuracy(score.xError) + axisAccuracy(score.yError)) / 2;
  return Math.round(3 * accuracy);
}

/** Lower total wins. Equal totals tie. */
export function compareScores(
  a: PlacementScore,
  b: PlacementScore,
): "a" | "b" | "tie" {
  if (a.total < b.total) return "a";
  if (b.total < a.total) return "b";
  return "tie";
}
