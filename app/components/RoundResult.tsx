// Reveal panel: compact summary of the round — the fasit per axis, what the
// player read off (with a ✓/✗ for within slack), and the points/outcome.
// Karaoke / neon look, kept deliberately slim so it's quick to read.

import { useRef } from "react";

import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { celebrateResult } from "~/anim/confetti";
import { playSound } from "~/audio/useSound";
import type { Card, Placement, Theme } from "~/game/types";
import {
  axisAccuracy,
  axisDomain,
  fractionToValue,
  type PlacementScore,
} from "~/game/scoring";
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

function Mark({ correct }: { correct: boolean }) {
  return (
    <span
      className={
        correct
          ? "font-display text-neon-lime text-glow"
          : "font-display text-neon-pink text-glow"
      }
    >
      {correct ? "✓" : "✗"}
    </span>
  );
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
  const root = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<HTMLSpanElement>(null);

  const xDomain = axisDomain(theme, "x");
  const yDomain = axisDomain(theme, "y");
  const myReadX = fractionToValue(myPlacement.fx, xDomain.min, xDomain.max, theme.xAxis.scale);
  const myReadY = fractionToValue(myPlacement.fy, yDomain.min, yDomain.max, theme.yAxis.scale);

  const opponentCorrect = opponentScore
    ? (opponentScore.xCorrect ? 1 : 0) + (opponentScore.yCorrect ? 1 : 0)
    : 0;

  const pointsValue =
    outcome != null ? (outcome === "win" ? 1 : 0) : (roundPoints ?? null);

  useGSAP(
    () => {
      playSound(outcome === "win" ? "win" : outcome === "loss" ? "lose" : "reveal");

      // Emoji confetti scaled by how close the placement was (avg axis accuracy,
      // 0 = total miss → sad face, 1 = bang on → eggplant).
      const quality =
        (axisAccuracy(myScore.xError) + axisAccuracy(myScore.yError)) / 2;
      celebrateResult(quality);

      const reduced = prefersReducedMotion();
      root.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });

      const runCounter = () => {
        const el = pointsRef.current;
        if (!el || pointsValue == null) return;
        if (reduced) {
          el.textContent = String(pointsValue);
          return;
        }
        const obj = { n: 0 };
        gsap.to(obj, {
          n: pointsValue,
          duration: 0.6,
          ease: "power1.out",
          snap: { n: 1 },
          onUpdate: () => {
            el.textContent = String(Math.round(obj.n));
          },
        });
      };

      if (reduced) {
        gsap.set(root.current?.querySelectorAll(".anim-init") ?? [], { autoAlpha: 1 });
        runCounter();
        return;
      }

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline();
        tl.from(root.current, {
          autoAlpha: 0,
          y: 24,
          scale: 0.97,
          duration: 0.4,
          ease: "glide",
        });
        tl.fromTo(
          ".anim-row",
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.3, ease: "pop" },
          "-=0.15",
        );
        tl.add(runCounter, "<");
      });

      // matchMedia must be reverted from the OUTER useGSAP cleanup (never from
      // inside mm.add — that recurses).
      return () => mm.revert();
    },
    { scope: root },
  );

  const handleNext = () => {
    playSound("click");
    onNext();
  };

  const outcomeClass =
    outcome === "win" || (outcome == null && (roundPoints ?? 0) > 0)
      ? "border-neon-lime/60 bg-neon-lime/10 text-neon-lime glow-lime"
      : outcome === "loss"
        ? "border-neon-pink/60 bg-neon-pink/10 text-neon-pink glow-pink"
        : "border-neon-gold/60 bg-neon-gold/10 text-neon-gold glow-gold";

  return (
    <div
      ref={root}
      className="anim-init w-full max-w-sm rounded-2xl border border-neon-purple/50 bg-stage-2/85 p-4 backdrop-blur box-glow glow-purple"
    >
      <h2 className="anim-row anim-init font-display text-xl uppercase tracking-wide text-neon-cyan text-glow">
        {card.title}
      </h2>

      {/* One compact row per axis: fasit, what you read, and a ✓/✗. */}
      <div className="anim-row anim-init mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-sm">
        <span className="text-gray-400">{theme.xAxis.label}</span>
        <span className="flex items-center gap-2">
          <span className="font-semibold text-neon-cyan">
            {formatValue(card.x, theme.xAxis.unit)}
          </span>
          <span className="text-xs text-gray-500">
            du: {formatValue(myReadX, theme.xAxis.unit)}
          </span>
          <Mark correct={myScore.xCorrect} />
        </span>
      </div>
      <div className="anim-row anim-init mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-sm">
        <span className="text-gray-400">{theme.yAxis.label}</span>
        <span className="flex items-center gap-2">
          <span className="font-semibold text-neon-cyan">
            {formatValue(card.y, theme.yAxis.unit)}
          </span>
          <span className="text-xs text-gray-500">
            du: {formatValue(myReadY, theme.yAxis.unit)}
          </span>
          <Mark correct={myScore.yCorrect} />
        </span>
      </div>

      {opponentScore && (
        <div className="anim-row anim-init mt-2 text-xs text-gray-400">
          {opponentName ?? "Motspiller"}: {opponentCorrect}/2 innenfor slingringsmonn
        </div>
      )}

      {/* Outcome / points — one compact line. */}
      {(outcome != null || roundPoints != null) && (
        <div
          className={`anim-row anim-init mt-3 rounded-xl border px-3 py-2 text-center font-display text-lg uppercase tracking-wide box-glow ${outcomeClass}`}
        >
          {outcome === "loss" ? (
            "Du tapte runden"
          ) : outcome === "tie" ? (
            "Uavgjort"
          ) : (
            <>
              {outcome === "win" ? "Du vant! " : ""}+
              <span ref={pointsRef}>0</span> poeng
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleNext}
        disabled={waiting}
        className="anim-row anim-init mt-3 w-full rounded-xl border border-neon-purple/70 bg-neon-purple/20 px-4 py-2.5 font-display text-base uppercase tracking-wide text-neon-purple text-glow box-glow glow-purple transition hover:bg-neon-purple/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {waiting ? "Venter på motspiller …" : isLastRound ? "Se resultat" : "Neste runde"}
      </button>
    </div>
  );
}
