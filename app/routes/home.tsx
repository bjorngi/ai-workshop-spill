import { useCallback, useEffect, useRef, useState } from "react";

import type { Route } from "./+types/home";
import type {
  Card,
  NetMessage,
  Placement,
  PlacementEntry,
  PlayerInfo,
  Theme,
} from "~/game/types";
import { buildDeck, cardsByIds } from "~/game/deck";
import { getTheme } from "~/game/themes";
import { roundPoints, scorePlacement } from "~/game/scoring";
import { makeRoomCode, useRoom } from "~/net/useRoom";

import { Grid } from "~/components/Grid";
import { Scoreboard } from "~/components/Scoreboard";
import { RoundResult } from "~/components/RoundResult";
import { GamePicker } from "~/components/GamePicker";
import { ConnectionPanel } from "~/components/ConnectionPanel";

import { gsap, useGSAP, SplitText, prefersReducedMotion } from "~/anim/gsap";
import { playSound } from "~/audio/useSound";
import { VolumeButton } from "~/audio/VolumeButton";

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

/** Pid used for the local player in single-player mode. */
const SINGLE_PID = "me";

// --- placement map <-> wire entries -----------------------------------------

function toEntries(m: Record<string, Placement>): PlacementEntry[] {
  return Object.entries(m).map(([pid, placement]) => ({ pid, placement }));
}
function fromEntries(es: PlacementEntry[]): Record<string, Placement> {
  const out: Record<string, Placement> = {};
  for (const e of es) out[e.pid] = e.placement;
  return out;
}

export default function Home() {
  const room = useRoom();

  const [screen, setScreen] = useState<Screen>("setup");
  const [mode, setMode] = useState<Mode | null>(null);

  // Board state
  const [theme, setTheme] = useState<Theme | null>(null);
  const [anchors, setAnchors] = useState<Card[]>([]);
  const [mystery, setMystery] = useState<Card[]>([]);
  const [round, setRound] = useState(0);

  // The current draggable (uncommitted) placement.
  const [myDraft, setMyDraft] = useState<Placement | null>(null);

  // Committed placements for the current round, keyed by player id. Mirrored in
  // a ref so the (once-registered) network handler always sees the latest map.
  const [roundPlacements, setRoundPlacements] = useState<
    Record<string, Placement>
  >({});
  const placementsRef = useRef<Record<string, Placement>>({});
  const setPlacements = useCallback((next: Record<string, Placement>) => {
    placementsRef.current = next;
    setRoundPlacements(next);
  }, []);
  const recordPlacement = useCallback(
    (pid: string, p: Placement) => {
      const next = { ...placementsRef.current, [pid]: p };
      placementsRef.current = next;
      setRoundPlacements(next);
      return next;
    },
    [],
  );

  // Cumulative scores keyed by pid (computed locally and deterministically).
  const [scores, setScores] = useState<Record<string, number>>({});

  // Names + room code
  const [myName, setMyName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  // --- derived players ------------------------------------------------------

  const myPid = mode === "single" ? SINGLE_PID : room.myPid;
  const roster: PlayerInfo[] =
    mode === "single"
      ? [{ pid: SINGLE_PID, name: myName || "Du" }]
      : room.roster;

  const current = mystery[round] ?? null;
  const committedMine = roundPlacements[myPid] ?? null;
  const committed = mode !== "single" && !!committedMine;

  // Refs mirroring state for the network message handler.
  const stateRef = useRef({
    mode,
    round,
    totalRounds: 0,
    role: room.role,
    mystery,
  });
  stateRef.current = {
    mode,
    round,
    totalRounds: mystery.length,
    role: room.role,
    mystery,
  };

  // --- board helpers --------------------------------------------------------

  const startBoard = useCallback(
    (t: Theme, anchorIds: string[], mysteryOrder: string[]) => {
      setTheme(t);
      setAnchors(cardsByIds(t, anchorIds));
      setMystery(cardsByIds(t, mysteryOrder));
      setRound(0);
      setMyDraft(null);
      setPlacements({});
      setScores({});
    },
    [setPlacements],
  );

  // --- network message handling --------------------------------------------

  useEffect(() => {
    room.setOnMessage((msg: NetMessage, fromPid: string) => {
      const s = stateRef.current;
      switch (msg.type) {
        case "start": {
          // Guests build the identical board from the host's message.
          const t = getTheme(msg.themeId);
          if (!t) return;
          startBoard(t, msg.anchorIds, msg.mysteryOrder);
          setScreen("play");
          break;
        }
        case "place": {
          // Host records a guest's placement, then re-broadcasts the full set.
          if (s.role !== "host") return;
          if (msg.round !== s.round) return;
          const next = recordPlacement(fromPid, msg.placement);
          room.broadcast({
            type: "placements",
            round: s.round,
            entries: toEntries(next),
          });
          break;
        }
        case "placements": {
          // Guests mirror the authoritative current-round placement set.
          if (msg.round !== s.round) return;
          setPlacements(fromEntries(msg.entries));
          break;
        }
        case "next": {
          // Host advanced; guests follow + grow anchors with the revealed card.
          const justPlayed = s.mystery[s.round];
          if (justPlayed) setAnchors((a) => [...a, justPlayed]);
          setMyDraft(null);
          setPlacements({});
          setRound(msg.round);
          setScreen(msg.round >= s.totalRounds ? "gameover" : "play");
          break;
        }
      }
    });
  }, [room, startBoard, recordPlacement, setPlacements]);

  // Guest: once the channel is up, move from the connect screen to the lobby.
  useEffect(() => {
    if (mode === "guest" && screen === "connect" && room.status === "connected") {
      setScreen("lobby");
    }
  }, [mode, screen, room.status]);

  // --- reveal gating + scoring ---------------------------------------------

  // Multiplayer: reveal once every player in the roster has placed.
  useEffect(() => {
    if (screen !== "play" || mode === "single") return;
    const pids = roster.map((r) => r.pid);
    if (pids.length === 0) return;
    if (pids.every((pid) => roundPlacements[pid])) setScreen("reveal");
  }, [screen, mode, roundPlacements, roster]);

  // Award the round point(s) to the closest placement(s), once per round.
  const awardedRef = useRef<number>(-1);
  useEffect(() => {
    if (screen !== "reveal" || mode === "single") return;
    if (!theme || !current) return;
    if (awardedRef.current === round) return;
    const pids = roster.map((r) => r.pid).filter((pid) => roundPlacements[pid]);
    if (pids.length === 0) return;
    awardedRef.current = round;

    let best = Infinity;
    const totals: Record<string, number> = {};
    for (const pid of pids) {
      const sc = scorePlacement(current, theme, roundPlacements[pid]);
      totals[pid] = sc.total;
      if (sc.total < best) best = sc.total;
    }
    const winners = pids.filter((pid) => Math.abs(totals[pid] - best) < 1e-9);
    setScores((prev) => {
      const next = { ...prev };
      for (const w of winners) next[w] = (next[w] ?? 0) + 1;
      return next;
    });
  }, [screen, mode, round, theme, current, roster, roundPlacements]);

  // --- actions --------------------------------------------------------------

  const chooseMode = (m: Mode) => {
    setMode(m);
    if (m === "single") {
      setMyName((n) => n || "Du");
      setScreen("lobby");
    } else if (m === "host") {
      setRoomCode(makeRoomCode());
      setScreen("connect");
    } else {
      setScreen("connect");
    }
  };

  const onPlace = (p: Placement) => {
    if (committed) return; // already locked in this round
    setMyDraft(p);
  };

  const lockIn = () => {
    if (!myDraft || !theme || !current) return;
    if (mode === "single") {
      const sc = scorePlacement(current, theme, myDraft);
      setScores((prev) => ({
        ...prev,
        [SINGLE_PID]: (prev[SINGLE_PID] ?? 0) + roundPoints(sc),
      }));
      recordPlacement(SINGLE_PID, myDraft);
      setScreen("reveal");
      return;
    }
    // Multiplayer: commit my placement and share it.
    const next = recordPlacement(myPid, myDraft);
    if (room.role === "host") {
      room.broadcast({ type: "placements", round, entries: toEntries(next) });
    } else {
      room.sendToHost({ type: "place", round, placement: myDraft });
    }
  };

  const advance = () => {
    if (!current) return;
    const nextRound = round + 1;
    const isOver = nextRound >= mystery.length;

    if (mode === "single") {
      setAnchors((a) => [...a, current]);
      setMyDraft(null);
      setPlacements({});
      setRound(nextRound);
      setScreen(isOver ? "gameover" : "play");
      return;
    }

    // Multiplayer: only the host drives advancement.
    if (room.role === "host") {
      setAnchors((a) => [...a, current]);
      setMyDraft(null);
      setPlacements({});
      setRound(nextRound);
      setScreen(isOver ? "gameover" : "play");
      room.broadcast({ type: "next", round: nextRound });
    }
    // Guests follow via the "next" message.
  };

  const startMultiplayerGame = (t: Theme) => {
    // HOST only. Lock the roster and deal the deck.
    const seed = Date.now();
    const { anchorIds, mysteryOrder } = buildDeck(t, seed);
    room.stopAccepting();
    startBoard(t, anchorIds, mysteryOrder);
    setScreen("play");
    room.broadcast({
      type: "start",
      themeId: t.id,
      seed,
      anchorIds,
      mysteryOrder,
    });
  };

  const startSingleGame = (t: Theme) => {
    const { anchorIds, mysteryOrder } = buildDeck(t, Date.now());
    startBoard(t, anchorIds, mysteryOrder);
    setScreen("play");
  };

  const backToSetup = () => {
    room.reset();
    setMode(null);
    setRoomCode("");
    setScreen("setup");
  };

  const playAgain = () => {
    if (mode !== "single") room.reset();
    setMode(null);
    setTheme(null);
    setAnchors([]);
    setMystery([]);
    setRound(0);
    setMyDraft(null);
    setPlacements({});
    setScores({});
    setRoomCode("");
    awardedRef.current = -1;
    setScreen("setup");
  };

  // --- presentation: logo + sound stings -----------------------------------

  const logoRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    (_ctx, contextSafe) => {
      const el = logoRef.current;
      if (!el || !contextSafe) return;
      const split = SplitText.create(el, { type: "chars", ignore: "sup" });

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(split.chars, {
          autoAlpha: 0,
          yPercent: -120,
          rotation: () => gsap.utils.random(-45, 45),
          stagger: { each: 0.04, from: "center" },
          ease: "back.out(2)",
          duration: 0.75,
        });
      });

      // Karaoke marquee shimmer — only sweeps across the letters on hover.
      const shimmer = contextSafe(() => {
        if (prefersReducedMotion()) return;
        gsap.fromTo(
          split.chars,
          { filter: "brightness(1)" },
          {
            filter: "brightness(1.55)",
            duration: 0.32,
            yoyo: true,
            repeat: 1,
            ease: "sine.inOut",
            stagger: { each: 0.05, from: "start" },
            overwrite: "auto",
          },
        );
      });
      el.addEventListener("pointerenter", shimmer);

      return () => {
        el.removeEventListener("pointerenter", shimmer);
        mm.revert();
        split.revert();
      };
    },
    { scope: logoRef },
  );

  // Round-start sting whenever a new play round begins.
  useEffect(() => {
    if (screen === "play") playSound("roundStart");
  }, [screen, round]);

  // Final sting on game over.
  useEffect(() => {
    if (screen !== "gameover") return;
    const myScore = scores[myPid] ?? 0;
    const topScore = Math.max(0, ...roster.map((r) => scores[r.pid] ?? 0));
    playSound(mode === "single" || myScore >= topScore ? "win" : "lose");
  }, [screen, mode, scores, myPid, roster]);

  // --- render helpers -------------------------------------------------------

  const playersForBoard = roster.map((r) => ({
    pid: r.pid,
    name: r.name,
    score: scores[r.pid] ?? 0,
  }));

  const gridOthers =
    screen === "reveal"
      ? roster
          .filter((r) => r.pid !== myPid && roundPlacements[r.pid])
          .map((r) => ({
            pid: r.pid,
            name: r.name,
            placement: roundPlacements[r.pid],
          }))
      : undefined;

  // Reveal summary (my score, round winners, per-player ✓ counts).
  let revealData:
    | {
        myScore: ReturnType<typeof scorePlacement>;
        roundPoints?: number;
        winnerNames?: string[];
        iWon?: boolean;
        others?: { name: string; correctCount: number }[];
      }
    | null = null;
  if (screen === "reveal" && theme && current && committedMine) {
    const myScoreObj = scorePlacement(current, theme, committedMine);
    if (mode === "single") {
      revealData = { myScore: myScoreObj, roundPoints: roundPoints(myScoreObj) };
    } else {
      const pids = roster
        .map((r) => r.pid)
        .filter((pid) => roundPlacements[pid]);
      const totals: Record<string, number> = {};
      let best = Infinity;
      for (const pid of pids) {
        const sc = scorePlacement(current, theme, roundPlacements[pid]);
        totals[pid] = sc.total;
        if (sc.total < best) best = sc.total;
      }
      const winnerPids = pids.filter(
        (pid) => Math.abs(totals[pid] - best) < 1e-9,
      );
      const nameOf = (pid: string) =>
        roster.find((r) => r.pid === pid)?.name ?? "Spiller";
      const others = roster
        .filter((r) => r.pid !== myPid && roundPlacements[r.pid])
        .map((r) => {
          const sc = scorePlacement(current, theme, roundPlacements[r.pid]);
          return {
            name: r.name,
            correctCount: (sc.xCorrect ? 1 : 0) + (sc.yCorrect ? 1 : 0),
          };
        });
      revealData = {
        myScore: myScoreObj,
        winnerNames: winnerPids.map(nameOf),
        iWon: winnerPids.includes(myPid),
        others,
      };
    }
  }

  // --- render ---------------------------------------------------------------

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center gap-6 px-4 py-8">
      <header className="relative flex w-full items-center justify-center text-center">
        <div>
          <h1
            ref={logoRef}
            className="font-display text-5xl uppercase tracking-wide text-neon-pink text-glow-strong sm:text-6xl"
          >
            Plasseringsspillet
            <sup className="ml-1 align-super text-2xl text-neon-cyan text-glow">
              ®™
            </sup>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Plasser mysteriekortet riktig på rutenettet.
          </p>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <VolumeButton />
        </div>
      </header>

      {screen === "setup" && (
        <SetupScreen
          myName={myName}
          setMyName={setMyName}
          onChoose={chooseMode}
        />
      )}

      {screen === "connect" && mode === "host" && (
        <ConnectionPanel
          intent="host"
          status={room.status}
          roomCode={roomCode}
          roster={room.roster}
          hostRoom={room.hostRoom}
          myName={myName || "Vert"}
          onProceed={() => setScreen("lobby")}
          onBack={backToSetup}
        />
      )}

      {screen === "connect" && mode === "guest" && (
        <ConnectionPanel
          intent="guest"
          status={room.status}
          joinRoom={room.joinRoom}
          myName={myName || "Spiller"}
          onBack={backToSetup}
        />
      )}

      {screen === "lobby" && (
        <div className="w-full space-y-4">
          {mode === "guest" ? (
            <div className="box-glow glow-cyan space-y-3 rounded-xl border border-neon-cyan/40 bg-stage-2/70 p-4 text-center text-gray-200 backdrop-blur">
              <p>Tilkoblet. Venter på at verten velger spill og starter …</p>
              <PlayerChips roster={room.roster} myPid={myPid} />
            </div>
          ) : (
            <>
              <h2 className="text-center font-display text-2xl uppercase tracking-wide text-neon-lime text-glow">
                {mode === "single" ? "Velg et spill" : "Velg spill og start"}
              </h2>
              {mode === "host" && (
                <div className="rounded-xl border border-neon-purple/40 bg-stage-2/60 p-3 text-center backdrop-blur">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Romkode{" "}
                    <span className="font-display text-lg text-neon-pink text-glow">
                      {roomCode}
                    </span>
                  </span>
                  <PlayerChips roster={room.roster} myPid={myPid} />
                </div>
              )}
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
            players={playersForBoard}
            myPid={myPid}
          />

          {theme.description && (
            <p className="max-w-[560px] text-center text-base text-gray-200">
              {theme.description}
            </p>
          )}

          <Grid
            theme={theme}
            anchors={anchors}
            current={current}
            placement={screen === "reveal" ? committedMine : myDraft}
            onPlace={onPlace}
            locked={screen === "reveal" || committed}
            revealed={screen === "reveal"}
            others={gridOthers}
            myName={myName || "Du"}
          />

          {screen === "play" && (
            <div className="flex flex-col items-center gap-2">
              {!myDraft && (
                <p className="text-sm text-gray-400">
                  Dra kortet til riktig sted på rutenettet.
                </p>
              )}
              {!committed && (
                <button
                  type="button"
                  disabled={!myDraft}
                  onClick={() => {
                    playSound("lockIn");
                    lockIn();
                  }}
                  className="box-glow glow-lime rounded-xl border-2 border-neon-lime bg-neon-lime/15 px-8 py-3 font-display text-xl uppercase tracking-wide text-neon-lime text-glow transition hover:bg-neon-lime/25 disabled:cursor-not-allowed disabled:border-gray-600 disabled:text-gray-500 disabled:opacity-50 disabled:shadow-none"
                >
                  Lås inn
                </button>
              )}
              {committed && (
                <p className="text-sm text-gray-400">
                  Venter på de andre spillerne …
                </p>
              )}
            </div>
          )}

          {screen === "reveal" && revealData && committedMine && (
            <RoundResult
              theme={theme}
              card={current}
              myScore={revealData.myScore}
              myPlacement={committedMine}
              roundPoints={revealData.roundPoints}
              winnerNames={revealData.winnerNames}
              iWon={revealData.iWon}
              others={revealData.others}
              myName={myName || "Du"}
              isLastRound={round + 1 >= mystery.length}
              onNext={advance}
              waiting={mode === "guest"}
            />
          )}
          {screen === "reveal" && mode === "guest" && (
            <p className="text-sm text-gray-400">
              Verten styrer når neste runde starter.
            </p>
          )}
        </div>
      )}

      {screen === "gameover" && (
        <GameOver
          mode={mode}
          players={playersForBoard}
          myPid={myPid}
          onPlayAgain={playAgain}
        />
      )}
    </main>
  );
}

// --- joined-players chips ----------------------------------------------------

function PlayerChips({
  roster,
  myPid,
}: {
  roster: PlayerInfo[];
  myPid: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs uppercase tracking-wide text-gray-400">
        Spillere ({roster.length}):
      </span>
      {roster.map((p) => (
        <span
          key={p.pid}
          className={[
            "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            p.pid === myPid
              ? "border-neon-cyan text-neon-cyan text-glow"
              : "border-neon-gold/50 text-neon-gold",
          ].join(" ")}
        >
          {p.name}
          {p.pid === myPid ? " (deg)" : ""}
        </span>
      ))}
    </div>
  );
}

// --- game over (confetti + bouncy headline) ---------------------------------

function GameOver({
  mode,
  players,
  myPid,
  onPlayAgain,
}: {
  mode: Mode | null;
  players: { pid: string; name: string; score: number }[];
  myPid: string;
  onPlayAgain: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const single = mode === "single";
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((p) => p.score === topScore);
  const iWon = winners.some((w) => w.pid === myPid);
  const won = single || iWon;
  const headline = single
    ? "Ferdig!"
    : winners.length > 1
      ? iWon
        ? "Delt seier!"
        : "Uavgjort!"
      : iWon
        ? "Du vant!"
        : `${winners[0]?.name ?? ""} vant`;

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();

      gsap.from(root.current, {
        autoAlpha: 0,
        y: 40,
        scale: 0.9,
        duration: reduce ? 0 : 0.6,
        ease: "pop",
      });

      if (headingRef.current) {
        const split = SplitText.create(headingRef.current, { type: "chars" });
        if (!reduce) {
          gsap.from(split.chars, {
            autoAlpha: 0,
            yPercent: -140,
            rotation: () => gsap.utils.random(-50, 50),
            stagger: { each: 0.05, from: "center" },
            ease: "back.out(2.5)",
            duration: 0.8,
            delay: 0.15,
          });
        }
      }

      if (reduce || !won) return;

      // Confetti burst from the center using Physics2D.
      const colors = [
        "var(--color-neon-pink)",
        "var(--color-neon-cyan)",
        "var(--color-neon-lime)",
        "var(--color-neon-gold)",
        "var(--color-neon-purple)",
      ];
      const layer = document.createElement("div");
      layer.style.cssText =
        "position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:1rem;";
      root.current?.appendChild(layer);
      const pieces: HTMLElement[] = [];
      for (let i = 0; i < 90; i++) {
        const p = document.createElement("i");
        p.style.cssText = `position:absolute;left:50%;top:40%;width:${
          6 + (i % 4) * 2
        }px;height:${10 + (i % 3) * 3}px;background:${
          colors[i % colors.length]
        };border-radius:2px;will-change:transform;`;
        layer.appendChild(p);
        pieces.push(p);
      }
      gsap.to(pieces, {
        duration: 1.8,
        physics2D: {
          velocity: () => gsap.utils.random(350, 720),
          angle: () => gsap.utils.random(250, 290),
          gravity: 900,
        },
        rotation: () => gsap.utils.random(-360, 360),
        autoAlpha: 0,
        ease: "none",
        stagger: { each: 0.004, from: "center" },
        onComplete: () => layer.remove(),
      });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      className="box-glow glow-purple w-full max-w-md space-y-4 overflow-hidden rounded-2xl border-2 border-neon-purple/60 bg-stage-2/80 p-6 text-center backdrop-blur"
    >
      <h2
        ref={headingRef}
        className={`font-display text-4xl uppercase tracking-wide text-glow-strong ${
          won ? "text-neon-gold" : "text-neon-pink"
        }`}
      >
        {headline}
      </h2>
      <div className="space-y-1">
        {sorted.map((p, i) => (
          <p key={p.pid} className="text-lg text-gray-200">
            {single ? "" : `${i + 1}. `}
            {p.name}
            {p.pid === myPid ? " (deg)" : ""}:{" "}
            <span
              className={`font-display text-2xl text-glow ${
                p.pid === myPid ? "text-neon-cyan" : "text-neon-gold"
              }`}
            >
              {p.score}
            </span>{" "}
            poeng
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          playSound("click");
          onPlayAgain();
        }}
        className="box-glow glow-pink w-full rounded-xl border-2 border-neon-pink bg-neon-pink/15 px-4 py-3 font-display text-xl uppercase tracking-wide text-neon-pink text-glow transition hover:bg-neon-pink/25"
      >
        Spill igjen
      </button>
    </div>
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
  const root = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      gsap.from(".setup-item", {
        autoAlpha: 0,
        y: 24,
        scale: 0.95,
        stagger: 0.08,
        ease: "pop",
        duration: prefersReducedMotion() ? 0 : 0.6,
      });
    },
    { scope: root },
  );

  const wiggle = contextSafe((e: React.PointerEvent) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      e.currentTarget,
      { rotation: -3 },
      { rotation: 0, scale: 1.04, duration: 0.5, ease: "elastic.out(1, 0.3)" },
    );
  });
  const unwiggle = contextSafe((e: React.PointerEvent) => {
    gsap.to(e.currentTarget, { scale: 1, duration: 0.3 });
  });
  const choose = (m: Mode) => {
    playSound("click");
    onChoose(m);
  };

  const btn =
    "setup-item box-glow w-full rounded-xl border-2 px-4 py-3 font-display text-lg uppercase tracking-wide text-glow transition-colors";

  return (
    <div
      ref={root}
      className="box-glow glow-purple w-full max-w-md space-y-5 rounded-2xl border-2 border-neon-purple/50 bg-stage-2/70 p-6 backdrop-blur"
    >
      <div className="setup-item">
        <label className="font-display text-sm uppercase tracking-wide text-neon-cyan text-glow">
          Navnet ditt
        </label>
        <input
          type="text"
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="F.eks. Kari"
          className="mt-1 w-full rounded-lg border-2 border-neon-cyan/40 bg-stage/80 p-2 text-gray-100 placeholder:text-gray-500 focus:border-neon-cyan focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => choose("single")}
          onPointerEnter={wiggle}
          onPointerLeave={unwiggle}
          className={`${btn} glow-cyan border-neon-cyan bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20`}
        >
          Spill alene
        </button>
        <button
          type="button"
          onClick={() => choose("host")}
          onPointerEnter={wiggle}
          onPointerLeave={unwiggle}
          className={`${btn} glow-lime border-neon-lime bg-neon-lime/10 text-neon-lime hover:bg-neon-lime/20`}
        >
          Vert (lag rom)
        </button>
        <button
          type="button"
          onClick={() => choose("guest")}
          onPointerEnter={wiggle}
          onPointerLeave={unwiggle}
          className={`${btn} glow-gold border-neon-gold bg-neon-gold/10 text-neon-gold hover:bg-neon-gold/20`}
        >
          Gjest (bli med)
        </button>
      </div>
    </div>
  );
}
