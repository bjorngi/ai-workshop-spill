// Room-code based connection UI.
//
// Host:  opens a room on mount, shows the shareable room code + the roster of
//        players that have joined, then proceeds to game selection.
// Guest: types the room code and joins.

import { useEffect, useRef, useState } from "react";

import type { RoomStatus } from "~/net/useRoom";
import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { playSound } from "~/audio/useSound";

interface ConnectionPanelProps {
  intent: "host" | "guest";
  status: RoomStatus;
  /** Host only: the generated room code to share. */
  roomCode?: string;
  /** Host only: players that have joined so far (includes the host). */
  roster?: { pid: string; name: string }[];
  /** Host: open the room (call once on mount). */
  hostRoom?: (code: string, name: string) => Promise<void>;
  /** Guest: join a room by code. */
  joinRoom?: (code: string, name: string) => Promise<void>;
  myName: string;
  /** Host: proceed to game selection (lobby). */
  onProceed?: () => void;
  onBack: () => void;
}

const STATE_LABELS: Record<RoomStatus, string> = {
  idle: "Ikke tilkoblet",
  connecting: "Kobler til …",
  connected: "Klar!",
  failed: "Tilkobling feilet",
  closed: "Frakoblet",
};

// Neon accent per connection status for the status pill.
function statusAccent(status: RoomStatus): {
  text: string;
  border: string;
  glow: string;
} {
  if (status === "connected")
    return { text: "text-neon-lime", border: "border-neon-lime", glow: "glow-lime" };
  if (status === "failed" || status === "closed")
    return { text: "text-neon-pink", border: "border-neon-pink", glow: "glow-pink" };
  return { text: "text-neon-cyan", border: "border-neon-cyan", glow: "glow-cyan" };
}

function CopyArea({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-neon-cyan text-glow">
        {label}
      </label>
      <textarea
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1.5 h-24 w-full rounded-xl border-2 border-neon-cyan/40 bg-stage/80 p-2.5 font-mono text-xs text-gray-100 backdrop-blur transition-colors focus:border-neon-cyan focus:outline-none"
      />
      <button
        type="button"
        onClick={async () => {
          playSound("click");
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* ignore */
          }
        }}
        className={[
          "mt-2 rounded-xl border-2 px-4 py-1.5 text-sm font-display uppercase tracking-wide transition-all",
          copied
            ? "border-neon-lime text-neon-lime text-glow box-glow glow-lime"
            : "border-neon-cyan/60 text-neon-cyan hover:border-neon-cyan hover:box-glow hover:glow-cyan",
        ].join(" ")}
      >
        {copied ? "Kopiert!" : "Kopier"}
      </button>
    </div>
  );
}

export function ConnectionPanel({
  intent,
  status,
  roomCode,
  roster,
  hostRoom,
  joinRoom,
  myName,
  onProceed,
  onBack,
}: ConnectionPanelProps) {
  const [code, setCode] = useState(""); // guest: typed room code
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const hostedRef = useRef(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Noe gikk galt";
      setError(
        msg.includes("no-room") ? "Fant ikke rommet – sjekk koden." : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  // Host: open the room once on mount.
  useEffect(() => {
    if (intent !== "host") return;
    if (hostedRef.current) return;
    if (!roomCode || !hostRoom) return;
    hostedRef.current = true;
    run(() => hostRoom(roomCode, myName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, roomCode, hostRoom, myName]);

  // Panel entrance: slide + scale the whole card in.
  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set(scope.current, { autoAlpha: 1, y: 0, scale: 1 });
        return;
      }
      gsap.from(scope.current, {
        autoAlpha: 0,
        y: 40,
        scale: 0.94,
        duration: 0.6,
        ease: "pop",
      });
    },
    { scope },
  );

  // Step transitions + status flourishes driven off `status`.
  useGSAP(
    () => {
      const reduce = prefersReducedMotion();

      // Slide/fade the newly-relevant step into view.
      const steps = gsap.utils.toArray<HTMLElement>(".conn-step");
      if (steps.length) {
        if (reduce) {
          gsap.set(steps, { autoAlpha: 1, x: 0 });
        } else {
          gsap.fromTo(
            steps,
            { autoAlpha: 0, x: 24 },
            {
              autoAlpha: 1,
              x: 0,
              duration: 0.5,
              ease: "glide",
              stagger: 0.08,
              overwrite: "auto",
            },
          );
        }
      }

      // Status pill: pulse on every status change.
      if (pillRef.current && !reduce) {
        gsap.fromTo(
          pillRef.current,
          { scale: 0.85 },
          { scale: 1, duration: 0.45, ease: "pop", overwrite: "auto" },
        );
      }

      // Connected: success flourish + sound.
      if (status === "connected") {
        playSound("reveal");
        if (!reduce && pillRef.current) {
          const tl = gsap.timeline();
          tl.fromTo(
            scope.current,
            { scale: 1 },
            { scale: 1.03, duration: 0.22, ease: "pop", yoyo: true, repeat: 1 },
          );
          tl.fromTo(
            pillRef.current,
            { scale: 1 },
            { scale: 1.35, duration: 0.28, ease: "pop", yoyo: true, repeat: 1 },
            0,
          );
          tl.to(
            scope.current,
            { filter: "brightness(1.25)", duration: 0.18, yoyo: true, repeat: 1 },
            0,
          );
        }
      }
    },
    { scope, dependencies: [status] },
  );

  const accent = statusAccent(status);
  const players = roster ?? [];

  return (
    <div
      ref={scope}
      className="anim-init w-full max-w-lg space-y-4 rounded-2xl border-2 border-neon-purple/50 bg-stage-2/70 p-5 backdrop-blur box-glow glow-purple"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl uppercase tracking-wide text-white text-glow">
          {intent === "host" ? "Vert – del koden" : "Gjest – bli med"}
        </h2>
        <span
          ref={pillRef}
          className={[
            "shrink-0 rounded-full border-2 bg-stage/60 px-3 py-1 text-xs font-display uppercase tracking-wide text-glow box-glow",
            accent.text,
            accent.border,
            accent.glow,
          ].join(" ")}
        >
          {STATE_LABELS[status]}
        </span>
      </div>

      {intent === "host" ? (
        <div className="space-y-4">
          <div className="conn-step text-center">
            <p className="text-sm text-gray-300">
              Del denne koden. Spillere skriver den inn for å bli med.
            </p>
            <div className="mt-3 font-display text-5xl uppercase tracking-[0.3em] text-neon-pink text-glow">
              {roomCode ?? "…"}
            </div>
          </div>

          {roomCode && (
            <div className="conn-step">
              <CopyArea value={roomCode} label="Romkode (del med spillerne)" />
            </div>
          )}

          <div className="conn-step">
            <p className="text-xs font-semibold uppercase tracking-wide text-neon-cyan text-glow">
              Spillere ({players.length})
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {players.map((p) => (
                <li
                  key={p.pid}
                  className="rounded-full border-2 border-neon-cyan/40 bg-stage/60 px-3 py-1 text-sm text-gray-100"
                >
                  {p.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="conn-step">
            <button
              type="button"
              onClick={() => {
                playSound("click");
                onProceed?.();
              }}
              className="rounded-xl border-2 border-neon-lime px-4 py-2 font-display uppercase tracking-wide text-neon-lime text-glow transition-all hover:box-glow hover:glow-lime"
            >
              Velg spill →
            </button>
            {players.length < 2 && (
              <p className="mt-2 text-xs text-gray-400">
                Du kan starte når du vil – flere kan bli med underveis.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="conn-step">
            <p className="text-sm text-gray-300">
              Skriv inn romkoden du fikk fra verten.
            </p>
            <input
              type="text"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROMKODE"
              className="mt-2 w-full rounded-xl border-2 border-neon-pink/40 bg-stage/80 p-3 text-center font-display text-2xl uppercase tracking-[0.3em] text-gray-100 backdrop-blur transition-colors placeholder:text-gray-500 focus:border-neon-pink focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={() => {
                playSound("click");
                run(() => joinRoom!(code.trim(), myName));
              }}
              className="mt-2 rounded-xl border-2 border-neon-pink px-4 py-2 font-display uppercase tracking-wide text-neon-pink text-glow transition-all hover:box-glow hover:glow-pink disabled:opacity-40 disabled:hover:shadow-none"
            >
              Bli med
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="conn-step rounded-xl border-2 border-neon-pink/60 bg-stage/70 p-2.5 text-sm text-neon-pink text-glow box-glow glow-pink">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          playSound("click");
          onBack();
        }}
        className="text-sm font-semibold uppercase tracking-wide text-gray-400 transition-colors hover:text-neon-cyan hover:text-glow"
      >
        ← Tilbake
      </button>
    </div>
  );
}
