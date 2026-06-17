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
 * Count of anchors whose valueToFraction(...) is strictly less than the given
 * fraction. This is the "slot" the player dropped into.
 */
export function fractionToSlot(
  fraction: number,
  anchorValues: number[],
  min: number,
  max: number,
  scale: Scale,
): number {
  let count = 0;
  for (const v of anchorValues) {
    if (valueToFraction(v, min, max, scale) < fraction) count++;
  }
  return count;
}

/**
 * Count of anchors whose raw value is strictly less than the given value.
 * This is the "true slot" the card belongs in.
 */
export function trueSlot(value: number, anchorValues: number[]): number {
  let count = 0;
  for (const v of anchorValues) {
    if (v < value) count++;
  }
  return count;
}

export interface PlacementScore {
  xError: number;
  yError: number;
  total: number;
}

/**
 * Score a placement. For each axis: the true slot from the card's real value vs.
 * the player's slot derived from the dropped fraction and the anchor set. The
 * error per axis is the absolute slot difference; total is their sum.
 *
 * Placement origin is bottom-left, so fy maps directly to the Y axis fraction.
 */
export function scorePlacement(
  card: Card,
  anchors: Card[],
  theme: Theme,
  placement: Placement,
): PlacementScore {
  const xDomain = axisDomain(theme, "x");
  const yDomain = axisDomain(theme, "y");

  const anchorXValues = anchors.map((a) => a.x);
  const anchorYValues = anchors.map((a) => a.y);

  const trueXSlot = trueSlot(card.x, anchorXValues);
  const trueYSlot = trueSlot(card.y, anchorYValues);

  const playerXSlot = fractionToSlot(
    placement.fx,
    anchorXValues,
    xDomain.min,
    xDomain.max,
    theme.xAxis.scale,
  );
  const playerYSlot = fractionToSlot(
    placement.fy,
    anchorYValues,
    yDomain.min,
    yDomain.max,
    theme.yAxis.scale,
  );

  const xError = Math.abs(playerXSlot - trueXSlot);
  const yError = Math.abs(playerYSlot - trueYSlot);
  return { xError, yError, total: xError + yError };
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
