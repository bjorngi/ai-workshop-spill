// Round number, current game name, and score(s) for N players.

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";

interface ScoreboardProps {
  gameName: string;
  round: number;
  totalRounds: number;
  players: { pid: string; name: string; score: number }[];
  myPid: string;
}

export function Scoreboard({
  gameName,
  round,
  totalRounds,
  players,
  myPid,
}: ScoreboardProps) {
  const scope = useRef<HTMLDivElement>(null);

  // Sort by score descending without mutating the prop array (stable).
  const sorted = [...players].sort((a, b) => b.score - a.score);

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

      <div className="flex flex-wrap items-center gap-6">
        {sorted.map((p) => (
          <PlayerScore
            key={p.pid}
            name={p.name}
            score={p.score}
            isMe={p.pid === myPid}
          />
        ))}
      </div>
    </div>
  );
}

interface PlayerScoreProps {
  name: string;
  score: number;
  isMe: boolean;
}

/** A single player's name + big score, with a pop animation when the score changes. */
function PlayerScore({ name, score, isMe }: PlayerScoreProps) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const prevScore = useRef(score);

  // Pop the score number whenever its value changes.
  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        prevScore.current = score;
        return;
      }
      if (score !== prevScore.current && scoreRef.current) {
        popScore(scoreRef.current);
      }
      prevScore.current = score;
    },
    { dependencies: [score] },
  );

  const accent = isMe ? "text-neon-cyan" : "text-neon-gold";

  return (
    <div className="text-center">
      <div
        className={`text-[0.7rem] font-bold uppercase tracking-wide ${accent} text-glow`}
      >
        {name}
      </div>
      <div
        ref={scoreRef}
        className={`font-display text-4xl leading-none ${accent} text-glow-strong`}
      >
        {score}
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
