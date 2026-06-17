// Reveal panel: true values + blurb, the value the player read off each axis vs.
// the fasit (with a ✓/✗ for within slack), and (multiplayer) who won.

import type { Card, Placement, Theme } from "~/game/types";
import { axisDomain, fractionToValue, type PlacementScore } from "~/game/scoring";
import { formatValue } from "~/game/format";

interface RoundResultProps {
  theme: Theme;
  card: Card;
  myScore: PlacementScore;
  /** The player's committed drop this round. */
  myPlacement: Placement;
  /** Points awarded this round (solo or "+1"/"0" for the round winner). */
  roundPoints?: number;
  /** Multiplayer: opponent's error + comparison outcome. */
  opponentScore?: PlacementScore | null;
  /** Multiplayer: the opponent's committed drop this round. */
  opponentPlacement?: Placement | null;
  outcome?: "win" | "loss" | "tie" | null;
  myName?: string;
  opponentName?: string;
  isLastRound: boolean;
  onNext: () => void;
  /** Disable the advance button (e.g. waiting for the other player). */
  waiting?: boolean;
}

export function RoundResult({
  theme,
  card,
  myScore,
  myPlacement,
  roundPoints,
  opponentScore,
  opponentPlacement,
  outcome,
  myName,
  opponentName,
  isLastRound,
  onNext,
  waiting,
}: RoundResultProps) {
  const xDomain = axisDomain(theme, "x");
  const yDomain = axisDomain(theme, "y");
  const myReadX = fractionToValue(
    myPlacement.fx,
    xDomain.min,
    xDomain.max,
    theme.xAxis.scale,
  );
  const myReadY = fractionToValue(
    myPlacement.fy,
    yDomain.min,
    yDomain.max,
    theme.yAxis.scale,
  );

  const opponentCorrect = opponentScore
    ? (opponentScore.xCorrect ? 1 : 0) + (opponentScore.yCorrect ? 1 : 0)
    : 0;

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
        {card.title}
      </h2>

      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-900/50 dark:text-rose-200">
          {theme.xAxis.label}: {formatValue(card.x, theme.xAxis.unit)}
        </span>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-900/50 dark:text-rose-200">
          {theme.yAxis.label}: {formatValue(card.y, theme.yAxis.unit)}
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
        {card.blurb}
      </p>

      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900/50">
        <div className="font-semibold text-gray-700 dark:text-gray-200">
          Ditt svar ({myName ?? "deg"}):
        </div>
        <div className="text-gray-600 dark:text-gray-300">
          {theme.xAxis.label}: du leste{" "}
          {formatValue(myReadX, theme.xAxis.unit)} (fasit{" "}
          {formatValue(card.x, theme.xAxis.unit)}){" "}
          {myScore.xCorrect ? (
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              ✓
            </span>
          ) : (
            <span className="font-bold text-rose-600 dark:text-rose-400">
              ✗
            </span>
          )}
        </div>
        <div className="text-gray-600 dark:text-gray-300">
          {theme.yAxis.label}: du leste{" "}
          {formatValue(myReadY, theme.yAxis.unit)} (fasit{" "}
          {formatValue(card.y, theme.yAxis.unit)}){" "}
          {myScore.yCorrect ? (
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              ✓
            </span>
          ) : (
            <span className="font-bold text-rose-600 dark:text-rose-400">
              ✗
            </span>
          )}
        </div>

        {opponentScore && (
          <div className="mt-2 text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {opponentName ?? "Motspiller"}:
            </span>{" "}
            {opponentCorrect}/2 innenfor slingringsmonn
          </div>
        )}
      </div>

      {/* Outcome */}
      {outcome != null ? (
        <div
          className={[
            "mt-4 rounded-lg p-3 text-center text-lg font-bold",
            outcome === "win"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
              : outcome === "loss"
                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
          ].join(" ")}
        >
          {outcome === "win"
            ? "Du vant runden! +1 poeng"
            : outcome === "loss"
              ? "Du tapte runden."
              : "Uavgjort – ingen poeng."}
        </div>
      ) : (
        roundPoints != null && (
          <div className="mt-4 rounded-lg bg-indigo-100 p-3 text-center text-lg font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
            +{roundPoints} poeng
          </div>
        )
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={waiting}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {waiting
          ? "Venter på motspiller …"
          : isLastRound
            ? "Se resultat"
            : "Neste runde"}
      </button>
    </div>
  );
}
