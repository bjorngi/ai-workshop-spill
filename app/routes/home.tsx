import { useCallback, useEffect, useRef, useState } from "react";

import type { Route } from "./+types/home";
import type { Card, NetMessage, Placement, Theme } from "~/game/types";
import { buildDeck, cardsByIds } from "~/game/deck";
import { getTheme } from "~/game/themes";
import {
  compareScores,
  roundPoints,
  scorePlacement,
  type PlacementScore,
} from "~/game/scoring";
import { usePeer } from "~/net/usePeer";

import { Grid } from "~/components/Grid";
import { Scoreboard } from "~/components/Scoreboard";
import { RoundResult } from "~/components/RoundResult";
import { GamePicker } from "~/components/GamePicker";
import { ConnectionPanel } from "~/components/ConnectionPanel";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Plasseringsspillet" },
    {
      name: "description",
      content: "Hitster på et 2D-rutenett – plasser kortet riktig!",
    },
  ];
}

type Mode = "single" | "host" | "guest";
type Screen =
  | "setup"
  | "connect"
  | "lobby"
  | "play"
  | "reveal"
  | "gameover";

export default function Home() {
  const peer = usePeer();

  const [screen, setScreen] = useState<Screen>("setup");
  const [mode, setMode] = useState<Mode | null>(null);

  // Board state
  const [theme, setTheme] = useState<Theme | null>(null);
  const [anchors, setAnchors] = useState<Card[]>([]);
  const [mystery, setMystery] = useState<Card[]>([]);
  const [round, setRound] = useState(0);

  // Placements for the current round
  const [myPlacement, setMyPlacement] = useState<Placement | null>(null);
  const [oppPlacement, setOppPlacement] = useState<Placement | null>(null);

  // Scores
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);

  // Names
  const [myName, setMyName] = useState("");
  const [oppName, setOppName] = useState("");

  // Refs mirroring state for the network message handler (which captures
  // values at registration time otherwise).
  const stateRef = useRef({
    mode,
    round,
    totalRounds: 0,
  });
  stateRef.current = { mode, round, totalRounds: mystery.length };

  // --- board helpers --------------------------------------------------------

  const startBoard = useCallback(
    (t: Theme, anchorIds: string[], mysteryOrder: string[]) => {
      setTheme(t);
      setAnchors(cardsByIds(t, anchorIds));
      setMystery(cardsByIds(t, mysteryOrder));
      setRound(0);
      setMyPlacement(null);
      setOppPlacement(null);
      setMyScore(0);
      setOppScore(0);
    },
    [],
  );

  // --- network message handling --------------------------------------------

  useEffect(() => {
    peer.setOnMessage((msg: NetMessage) => {
      const s = stateRef.current;
      switch (msg.type) {
        case "hello":
          setOppName(msg.name);
          break;
        case "start": {
          // Guest builds the identical board from the host's message.
          const t = getTheme(msg.themeId);
          if (!t) return;
          setOppName(msg.hostName);
          startBoard(t, msg.anchorIds, msg.mysteryOrder);
          setScreen("play");
          break;
        }
        case "place": {
          // Opponent's placement for some round. Only the current round matters.
          if (msg.round === s.round) {
            setOppPlacement(msg.placement);
          }
          break;
        }
        case "next": {
          // Host advanced; guest follows.
          setRound(msg.round);
          setMyPlacement(null);
          setOppPlacement(null);
          setScreen(msg.round >= s.totalRounds ? "gameover" : "play");
          break;
        }
      }
    });
  }, [peer, startBoard]);

  // When connected and in a multiplayer flow, exchange names + move to lobby.
  useEffect(() => {
    if (peer.state !== "connected") return;
    if (mode !== "host" && mode !== "guest") return;
    // Send our name once connected.
    try {
      peer.send({ type: "hello", name: myName || "Spiller" });
    } catch {
      /* not open yet */
    }
    if (screen === "connect") setScreen("lobby");
  }, [peer.state, mode, screen, myName, peer]);

  // --- reveal gating --------------------------------------------------------

  const current = mystery[round] ?? null;

  // Multiplayer: reveal as soon as both placements are in.
  useEffect(() => {
    if (screen !== "play") return;
    if (mode === "single") return;
    if (myPlacement && oppPlacement) {
      setScreen("reveal");
    }
  }, [screen, mode, myPlacement, oppPlacement]);

  // --- actions --------------------------------------------------------------

  const chooseMode = (m: Mode) => {
    setMode(m);
    if (m === "single") {
      setMyName("Du");
      setScreen("lobby");
    } else {
      setScreen("connect");
    }
  };

  const onPlace = (p: Placement) => {
    setMyPlacement(p);
  };

  const lockIn = () => {
    if (!myPlacement || !theme || !current) return;
    if (mode === "single") {
      const score = scorePlacement(current, theme, myPlacement);
      setMyScore((s) => s + roundPoints(score));
      setScreen("reveal");
    } else {
      // Multiplayer: send placement; reveal happens when both are in.
      try {
        peer.send({ type: "place", round, placement: myPlacement });
      } catch {
        /* ignore */
      }
    }
  };

  // Compute current round's scores at reveal.
  const myRoundScore: PlacementScore | null =
    current && theme && myPlacement
      ? scorePlacement(current, theme, myPlacement)
      : null;
  const oppRoundScore: PlacementScore | null =
    current && theme && oppPlacement && mode !== "single"
      ? scorePlacement(current, theme, oppPlacement)
      : null;

  // Award the multiplayer point exactly once when we enter reveal.
  const awardedRef = useRef<number>(-1);
  useEffect(() => {
    if (screen !== "reveal") return;
    if (mode === "single") return;
    if (!myRoundScore || !oppRoundScore) return;
    if (awardedRef.current === round) return;
    awardedRef.current = round;
    const cmp = compareScores(myRoundScore, oppRoundScore);
    if (cmp === "a") setMyScore((s) => s + 1);
    else if (cmp === "b") setOppScore((s) => s + 1);
  }, [screen, mode, myRoundScore, oppRoundScore, round]);

  const advance = () => {
    if (!current) return;
    const nextRound = round + 1;
    const isOver = nextRound >= mystery.length;

    if (mode === "single") {
      // Append revealed card to anchors so the board grows.
      setAnchors((a) => [...a, current]);
      setMyPlacement(null);
      setRound(nextRound);
      setScreen(isOver ? "gameover" : "play");
      return;
    }

    // Multiplayer: only the host drives advancement.
    if (mode === "host") {
      setAnchors((a) => [...a, current]);
      setMyPlacement(null);
      setOppPlacement(null);
      setRound(nextRound);
      setScreen(isOver ? "gameover" : "play");
      try {
        peer.send({ type: "next", round: nextRound });
      } catch {
        /* ignore */
      }
    }
    // Guest: the "next" message handler will advance and also grow anchors.
  };

  // Guest grows anchors when it advances via the "next" message. We mirror that
  // by appending the just-revealed card whenever round increments past a reveal.
  const prevRoundRef = useRef(0);
  useEffect(() => {
    if (mode !== "guest") {
      prevRoundRef.current = round;
      return;
    }
    if (round > prevRoundRef.current) {
      const justPlayed = mystery[prevRoundRef.current];
      if (justPlayed) setAnchors((a) => [...a, justPlayed]);
      prevRoundRef.current = round;
    }
  }, [round, mode, mystery]);

  const startMultiplayerGame = (t: Theme) => {
    // HOST only. Generate seed in the event handler.
    const seed = Date.now();
    const { anchorIds, mysteryOrder } = buildDeck(t, seed);
    startBoard(t, anchorIds, mysteryOrder);
    setScreen("play");
    try {
      peer.send({
        type: "start",
        themeId: t.id,
        seed,
        anchorIds,
        mysteryOrder,
        hostName: myName || "Vert",
      });
    } catch {
      /* ignore */
    }
  };

  const startSingleGame = (t: Theme) => {
    const { anchorIds, mysteryOrder } = buildDeck(t, Date.now());
    startBoard(t, anchorIds, mysteryOrder);
    setScreen("play");
  };

  const playAgain = () => {
    if (mode !== "single") peer.reset();
    setMode(null);
    setTheme(null);
    setAnchors([]);
    setMystery([]);
    setRound(0);
    setMyPlacement(null);
    setOppPlacement(null);
    setMyScore(0);
    setOppScore(0);
    setOppName("");
    awardedRef.current = -1;
    prevRoundRef.current = 0;
    setScreen("setup");
  };

  // --- render ---------------------------------------------------------------

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">
          Plasseringsspillet
          <sup className="ml-0.5 align-super text-xs font-semibold">®™</sup>
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Plasser mysteriekortet riktig på rutenettet.
        </p>
      </header>

      {screen === "setup" && (
        <SetupScreen
          myName={myName}
          setMyName={setMyName}
          onChoose={chooseMode}
        />
      )}

      {screen === "connect" && (mode === "host" || mode === "guest") && (
        <ConnectionPanel
          intent={mode}
          state={peer.state}
          createOffer={peer.createOffer}
          acceptOffer={peer.acceptOffer}
          acceptAnswer={peer.acceptAnswer}
          onBack={() => {
            peer.reset();
            setMode(null);
            setScreen("setup");
          }}
        />
      )}

      {screen === "lobby" && (
        <div className="w-full space-y-4">
          {mode === "guest" ? (
            <p className="rounded-xl bg-white/70 p-4 text-center text-gray-700 dark:bg-gray-800/70 dark:text-gray-200">
              Tilkoblet
              {oppName ? ` til ${oppName}` : ""}. Venter på at verten velger
              spill og starter …
            </p>
          ) : (
            <>
              <h2 className="text-center text-xl font-bold text-gray-900 dark:text-white">
                {mode === "single" ? "Velg et spill" : "Velg spill og start"}
              </h2>
              <GamePicker
                selectedId={theme?.id}
                onSelect={(t) =>
                  mode === "single"
                    ? startSingleGame(t)
                    : startMultiplayerGame(t)
                }
              />
            </>
          )}
        </div>
      )}

      {(screen === "play" || screen === "reveal") && theme && current && (
        <div className="flex w-full flex-col items-center gap-5">
          <Scoreboard
            gameName={theme.name}
            round={round}
            totalRounds={mystery.length}
            myName={myName || "Du"}
            myScore={myScore}
            opponentName={mode === "single" ? null : oppName || "Motspiller"}
            opponentScore={oppScore}
          />

          <Grid
            theme={theme}
            anchors={anchors}
            current={current}
            placement={myPlacement}
            onPlace={onPlace}
            locked={screen === "reveal"}
            revealed={screen === "reveal"}
            opponentPlacement={mode === "single" ? null : oppPlacement}
            myName={myName || "Du"}
            opponentName={oppName || "Motspiller"}
          />

          {screen === "play" && (
            <div className="flex flex-col items-center gap-2">
              {!myPlacement && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Dra kortet til riktig sted på rutenettet.
                </p>
              )}
              <button
                type="button"
                disabled={!myPlacement}
                onClick={lockIn}
                className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Lås inn
              </button>
              {mode !== "single" && myPlacement && !oppPlacement && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Venter på at {oppName || "motspilleren"} plasserer …
                </p>
              )}
            </div>
          )}

          {screen === "reveal" && myRoundScore && myPlacement && (
            <RoundResult
              theme={theme}
              card={current}
              myScore={myRoundScore}
              myPlacement={myPlacement}
              roundPoints={
                mode === "single" ? roundPoints(myRoundScore) : undefined
              }
              opponentScore={oppRoundScore}
              opponentPlacement={mode === "single" ? null : oppPlacement}
              outcome={
                mode === "single" || !oppRoundScore
                  ? null
                  : (() => {
                      const cmp = compareScores(myRoundScore, oppRoundScore);
                      return cmp === "a" ? "win" : cmp === "b" ? "loss" : "tie";
                    })()
              }
              myName={myName || "Du"}
              opponentName={oppName || "Motspiller"}
              isLastRound={round + 1 >= mystery.length}
              onNext={advance}
              waiting={mode === "guest"}
            />
          )}
          {screen === "reveal" && mode === "guest" && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Verten styrer når neste runde starter.
            </p>
          )}
        </div>
      )}

      {screen === "gameover" && theme && (
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            Ferdig!
          </h2>
          <div className="space-y-1">
            <p className="text-lg text-gray-700 dark:text-gray-200">
              {myName || "Du"}: <span className="font-bold">{myScore}</span> poeng
            </p>
            {mode !== "single" && (
              <p className="text-lg text-gray-700 dark:text-gray-200">
                {oppName || "Motspiller"}:{" "}
                <span className="font-bold">{oppScore}</span> poeng
              </p>
            )}
            {mode !== "single" && (
              <p className="pt-2 text-xl font-bold">
                {myScore > oppScore
                  ? "Du vant! 🎉"
                  : myScore < oppScore
                    ? `${oppName || "Motspiller"} vant.`
                    : "Uavgjort!"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={playAgain}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow transition hover:bg-indigo-700"
          >
            Spill igjen
          </button>
        </div>
      )}
    </main>
  );
}

// --- setup screen -----------------------------------------------------------

function SetupScreen({
  myName,
  setMyName,
  onChoose,
}: {
  myName: string;
  setMyName: (n: string) => void;
  onChoose: (m: Mode) => void;
}) {
  return (
    <div className="w-full max-w-md space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
      <div>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Navnet ditt
        </label>
        <input
          type="text"
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="F.eks. Kari"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onChoose("single")}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow transition hover:bg-indigo-700"
        >
          Spill alene
        </button>
        <button
          type="button"
          onClick={() => onChoose("host")}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow transition hover:bg-emerald-700"
        >
          Vert (inviter en venn)
        </button>
        <button
          type="button"
          onClick={() => onChoose("guest")}
          className="w-full rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white shadow transition hover:bg-amber-700"
        >
          Gjest (bli med)
        </button>
      </div>
    </div>
  );
}
