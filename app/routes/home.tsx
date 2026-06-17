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
    playSound(mode === "single" || myScore >= oppScore ? "win" : "lose");
  }, [screen, mode, myScore, oppScore]);

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
            <p className="box-glow glow-cyan rounded-xl border border-neon-cyan/40 bg-stage-2/70 p-4 text-center text-gray-200 backdrop-blur">
              Tilkoblet
              {oppName ? ` til ${oppName}` : ""}. Venter på at verten velger
              spill og starter …
            </p>
          ) : (
            <>
              <h2 className="text-center font-display text-2xl uppercase tracking-wide text-neon-lime text-glow">
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

          {theme.description && (
            <p className="max-w-[560px] text-center text-base text-gray-200">
              {theme.description}
            </p>
          )}

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
                <p className="text-sm text-gray-400">
                  Dra kortet til riktig sted på rutenettet.
                </p>
              )}
              <button
                type="button"
                disabled={!myPlacement}
                onClick={() => {
                  playSound("lockIn");
                  lockIn();
                }}
                className="box-glow glow-lime rounded-xl border-2 border-neon-lime bg-neon-lime/15 px-8 py-3 font-display text-xl uppercase tracking-wide text-neon-lime text-glow transition hover:bg-neon-lime/25 disabled:cursor-not-allowed disabled:border-gray-600 disabled:text-gray-500 disabled:opacity-50 disabled:shadow-none"
              >
                Lås inn
              </button>
              {mode !== "single" && myPlacement && !oppPlacement && (
                <p className="text-sm text-gray-400">
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
            <p className="text-sm text-gray-400">
              Verten styrer når neste runde starter.
            </p>
          )}
        </div>
      )}

      {screen === "gameover" && theme && (
        <GameOver
          mode={mode}
          myName={myName || "Du"}
          myScore={myScore}
          oppName={oppName || "Motspiller"}
          oppScore={oppScore}
          onPlayAgain={playAgain}
        />
      )}
    </main>
  );
}

// --- game over (confetti + bouncy headline) ---------------------------------

function GameOver({
  mode,
  myName,
  myScore,
  oppName,
  oppScore,
  onPlayAgain,
}: {
  mode: Mode | null;
  myName: string;
  myScore: number;
  oppName: string;
  oppScore: number;
  onPlayAgain: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const won = mode === "single" || myScore >= oppScore;
  const headline =
    mode === "single"
      ? "Ferdig!"
      : myScore > oppScore
        ? "Du vant!"
        : myScore < oppScore
          ? `${oppName} vant`
          : "Uavgjort!";

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
        <p className="text-lg text-gray-200">
          {myName}:{" "}
          <span className="font-display text-2xl text-neon-cyan text-glow">
            {myScore}
          </span>{" "}
          poeng
        </p>
        {mode !== "single" && (
          <p className="text-lg text-gray-200">
            {oppName}:{" "}
            <span className="font-display text-2xl text-neon-gold text-glow">
              {oppScore}
            </span>{" "}
            poeng
          </p>
        )}
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
          Vert (inviter en venn)
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
