// The 2D plot for a theme. Anchors render as labeled dots; the player's current
// placement renders as a draggable marker. At reveal we show the card's true
// position and (multiplayer) the opponent's marker.

import { useRef } from "react";

import type { Card, Placement, Theme } from "~/game/types";
import { axisDomain, valueToFraction } from "~/game/scoring";
import { useDrag } from "~/components/useDrag";
import { CurrentCard } from "~/components/CurrentCard";

interface GridProps {
  theme: Theme;
  /** Reference anchors already on the board (with known values). */
  anchors: Card[];
  /** The mystery card being placed this round. */
  current: Card | null;
  /** Player's current placement (bottom-left fractions). */
  placement: Placement | null;
  /** Called when the player drops the token while dragging is enabled. */
  onPlace?: (placement: Placement) => void;
  /** Disable dragging (after lock-in / at reveal). */
  locked?: boolean;
  /** Reveal mode: show the current card's true position. */
  revealed?: boolean;
  /** Opponent placement to show at reveal (multiplayer). */
  opponentPlacement?: Placement | null;
  myName?: string;
  opponentName?: string;
}

/** Position helper: convert bottom-left fractions to CSS left/bottom %. */
function pct(f: number): string {
  return `${f * 100}%`;
}

export function Grid({
  theme,
  anchors,
  current,
  placement,
  onPlace,
  locked,
  revealed,
  opponentPlacement,
  myName,
  opponentName,
}: GridProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);

  const { dragging, position, dragHandlers } = useDrag(plotRef, (p) => {
    if (!locked) onPlace?.(p);
  });

  const xDomain = axisDomain(theme, "x");
  const yDomain = axisDomain(theme, "y");

  // While dragging, show the live position; otherwise the committed placement.
  const livePlacement = dragging && position ? position : placement;

  const trueFx = current
    ? valueToFraction(current.x, xDomain.min, xDomain.max, theme.xAxis.scale)
    : 0;
  const trueFy = current
    ? valueToFraction(current.y, yDomain.min, yDomain.max, theme.yAxis.scale)
    : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Y axis label */}
      <div className="flex w-full justify-center">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {theme.yAxis.label}
          {theme.yAxis.unit ? ` (${theme.yAxis.unit})` : ""}
          {theme.yAxis.scale === "log" ? " · log" : ""} ↑
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        {/* Y axis line */}
        <div className="w-1 rounded bg-gray-300 dark:bg-gray-600" />

        {/* The plot itself */}
        <div
          ref={plotRef}
          className="relative rounded-xl border border-gray-300 bg-gradient-to-br from-slate-50 to-slate-100 shadow-inner dark:border-gray-700 dark:from-gray-900 dark:to-gray-800"
          style={{
            width: "min(80vw, 560px)",
            height: "min(80vw, 560px)",
          }}
        >
          {/* Subtle grid lines */}
          {[0.25, 0.5, 0.75].map((f) => (
            <div key={`h${f}`}>
              <div
                className="absolute left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700"
                style={{ bottom: pct(f) }}
              />
              <div
                className="absolute bottom-0 top-0 border-l border-dashed border-gray-200 dark:border-gray-700"
                style={{ left: pct(f) }}
              />
            </div>
          ))}

          {/* Anchor dots */}
          {anchors.map((a) => {
            const fx = valueToFraction(
              a.x,
              xDomain.min,
              xDomain.max,
              theme.xAxis.scale,
            );
            const fy = valueToFraction(
              a.y,
              yDomain.min,
              yDomain.max,
              theme.yAxis.scale,
            );
            return (
              <div
                key={a.id}
                className="absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
                style={{ left: pct(fx), bottom: pct(fy) }}
              >
                <div className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900" />
                <span className="mt-0.5 max-w-[7rem] truncate rounded bg-white/80 px-1 text-[10px] font-medium text-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                  {a.title}
                </span>
              </div>
            );
          })}

          {/* Opponent marker (reveal, multiplayer) */}
          {revealed && opponentPlacement && (
            <div
              className="absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
              style={{
                left: pct(opponentPlacement.fx),
                bottom: pct(opponentPlacement.fy),
              }}
            >
              <div className="h-5 w-5 rounded-full border-2 border-white bg-amber-500 shadow dark:border-gray-900" />
              <span className="mt-0.5 rounded bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {opponentName ?? "Motspiller"}
              </span>
            </div>
          )}

          {/* True position (reveal) */}
          {revealed && current && (
            <div
              className="absolute z-10 flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
              style={{ left: pct(trueFx), bottom: pct(trueFy) }}
            >
              <div className="h-6 w-6 animate-pulse rounded-full border-2 border-white bg-rose-600 shadow-lg dark:border-gray-900" />
              <span className="mt-0.5 rounded bg-rose-600 px-1 text-[10px] font-bold text-white">
                {current.title} (fasit)
              </span>
            </div>
          )}

          {/* Player's draggable marker */}
          {current && !revealed && (
            <div
              className="absolute z-20 -translate-x-1/2 translate-y-1/2"
              style={{
                left: livePlacement ? pct(livePlacement.fx) : "50%",
                bottom: livePlacement ? pct(livePlacement.fy) : "50%",
              }}
            >
              <CurrentCard
                card={current}
                dragHandlers={dragHandlers}
                dragging={dragging}
                placed={locked}
              />
            </div>
          )}

          {/* Player's committed marker at reveal */}
          {revealed && placement && (
            <div
              className="absolute z-10 flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
              style={{ left: pct(placement.fx), bottom: pct(placement.fy) }}
            >
              <div className="h-5 w-5 rounded-full border-2 border-white bg-indigo-600 shadow dark:border-gray-900" />
              <span className="mt-0.5 rounded bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                {myName ?? "Du"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* X axis line + label */}
      <div className="flex items-center gap-2" style={{ width: "min(80vw, 560px)" }}>
        <div className="h-1 flex-1 rounded bg-gray-300 dark:bg-gray-600" />
      </div>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        → {theme.xAxis.label}
        {theme.xAxis.unit ? ` (${theme.xAxis.unit})` : ""}
        {theme.xAxis.scale === "log" ? " · log" : ""}
      </span>
    </div>
  );
}
