// Round number, current game name, and score(s).

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
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-white/70 p-3 shadow dark:bg-gray-800/70">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {gameName}
        </div>
        <div className="text-lg font-bold text-gray-900 dark:text-white">
          Runde {Math.min(round + 1, totalRounds)} / {totalRounds}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
            {myName}
          </div>
          <div className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-200">
            {myScore}
          </div>
        </div>
        {multiplayer && (
          <div className="text-center">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-300">
              {opponentName}
            </div>
            <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-200">
              {opponentScore ?? 0}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
