// Round number, current game name, and score(s).

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";

interface ScoreboardProps {
  gameName: string;
  round: number;
  totalRounds: number;
  myName: string;
  myScore: number;
  /** When set, multiplayer: shows both players. */
  opponentName?: string | null;
  opponentScore?: number;
}

export function Scoreboard({
  gameName,
  round,
  totalRounds,
  myName,
  myScore,
  opponentName,
  opponentScore,
}: ScoreboardProps) {
  const multiplayer = opponentName != null;

  const scope = useRef<HTMLDivElement>(null);
  const myScoreRef = useRef<HTMLDivElement>(null);
  const oppScoreRef = useRef<HTMLDivElement>(null);
  const prevMy = useRef(myScore);
  const prevOpp = useRef(opponentScore ?? 0);

  // Pop the score number whenever its value changes.
  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        prevMy.current = myScore;
        prevOpp.current = opponentScore ?? 0;
        return;
      }
      if (myScore !== prevMy.current && myScoreRef.current) {
        popScore(myScoreRef.current);
      }
      if ((opponentScore ?? 0) !== prevOpp.current && oppScoreRef.current) {
        popScore(oppScoreRef.current);
      }
      prevMy.current = myScore;
      prevOpp.current = opponentScore ?? 0;
    },
    { scope, dependencies: [myScore, opponentScore] },
  );

  return (
    <div
      ref={scope}
      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-neon-purple/40 bg-stage-2/70 p-3.5 backdrop-blur box-glow glow-purple"
    >
      <div>
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-neon-purple text-glow">
          {gameName}
        </div>
        <div className="font-display text-2xl uppercase tracking-wide text-white">
          Runde {Math.min(round + 1, totalRounds)} / {totalRounds}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-[0.7rem] font-bold uppercase tracking-wide text-neon-cyan text-glow">
            {myName}
          </div>
          <div
            ref={myScoreRef}
            className="font-display text-4xl leading-none text-neon-cyan text-glow-strong"
          >
            {myScore}
          </div>
        </div>
        {multiplayer && (
          <div className="text-center">
            <div className="text-[0.7rem] font-bold uppercase tracking-wide text-neon-gold text-glow">
              {opponentName}
            </div>
            <div
              ref={oppScoreRef}
              className="font-display text-4xl leading-none text-neon-gold text-glow-strong"
            >
              {opponentScore ?? 0}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Punchy scale bounce on a score number. */
function popScore(el: HTMLElement) {
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      scale: 1.6,
      duration: 0.5,
      ease: "elastic.out(1, 0.45)",
      onComplete: () => {
        gsap.to(el, { scale: 1, duration: 0.25, ease: "glide" });
      },
    },
  );
}
