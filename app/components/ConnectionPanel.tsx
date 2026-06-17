// Copy-paste WebRTC signaling UI for the 4-step manual handshake.
//
// Host:  1) generer tilbud -> kopier til gjest
//        2) lim inn svaret fra gjest -> koblet
// Guest: 1) lim inn tilbudet fra vert -> generer svar
//        2) kopier svaret -> send til vert -> koblet

import { useRef, useState } from "react";

import type { ConnState } from "~/net/webrtc";
import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { playSound } from "~/audio/useSound";

interface ConnectionPanelProps {
  intent: "host" | "guest";
  state: ConnState;
  createOffer: () => Promise<string>;
  acceptOffer: (code: string) => Promise<string>;
  acceptAnswer: (code: string) => Promise<void>;
  onBack: () => void;
}

const STATE_LABELS: Record<ConnState, string> = {
  idle: "Ikke tilkoblet",
  offering: "Lager tilbud …",
  "awaiting-answer": "Venter på svar fra gjest",
  answering: "Lager svar …",
  connecting: "Kobler til …",
  connected: "Tilkoblet!",
  failed: "Tilkobling feilet",
  closed: "Frakoblet",
};

// Neon accent per connection state for the status pill.
function statusAccent(state: ConnState): {
  text: string;
  border: string;
  glow: string;
} {
  if (state === "connected")
    return { text: "text-neon-lime", border: "border-neon-lime", glow: "glow-lime" };
  if (state === "failed" || state === "closed")
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
  state,
  createOffer,
  acceptOffer,
  acceptAnswer,
  onBack,
}: ConnectionPanelProps) {
  const [offerCode, setOfferCode] = useState(""); // host's generated offer
  const [answerCode, setAnswerCode] = useState(""); // guest's generated answer
  const [pasteOffer, setPasteOffer] = useState(""); // guest pastes host offer
  const [pasteAnswer, setPasteAnswer] = useState(""); // host pastes guest answer
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = state === "connected";

  const scope = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt");
    } finally {
      setBusy(false);
    }
  }

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

  // Step transitions + status flourishes driven off `state`.
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

      // Status pill: pulse on every state change.
      if (pillRef.current && !reduce) {
        gsap.fromTo(
          pillRef.current,
          { scale: 0.85 },
          { scale: 1, duration: 0.45, ease: "pop", overwrite: "auto" },
        );
      }

      // Connected: success flourish + sound.
      if (state === "connected") {
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
    { scope, dependencies: [state] },
  );

  const accent = statusAccent(state);

  return (
    <div
      ref={scope}
      className="anim-init w-full max-w-lg space-y-4 rounded-2xl border-2 border-neon-purple/50 bg-stage-2/70 p-5 backdrop-blur box-glow glow-purple"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl uppercase tracking-wide text-white text-glow">
          {intent === "host" ? "Vert – koble til gjest" : "Gjest – koble til vert"}
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
          {STATE_LABELS[state]}
        </span>
      </div>

      {intent === "host" ? (
        <div className="space-y-4">
          <div className="conn-step">
            <p className="text-sm text-gray-300">
              1. Lag et tilbud og send koden til gjesten (f.eks. på chat).
            </p>
            <button
              type="button"
              disabled={busy || !!offerCode}
              onClick={() => {
                playSound("click");
                run(async () => {
                  const code = await createOffer();
                  setOfferCode(code);
                });
              }}
              className="mt-2 rounded-xl border-2 border-neon-pink px-4 py-2 font-display uppercase tracking-wide text-neon-pink text-glow transition-all hover:box-glow hover:glow-pink disabled:opacity-40 disabled:hover:shadow-none"
            >
              Generer tilbudskode
            </button>
          </div>

          {offerCode && (
            <div className="conn-step">
              <CopyArea value={offerCode} label="Tilbudskode (send til gjest)" />
            </div>
          )}

          {offerCode && !connected && (
            <div className="conn-step">
              <p className="text-sm text-gray-300">
                2. Lim inn svarkoden du får tilbake fra gjesten.
              </p>
              <textarea
                value={pasteAnswer}
                onChange={(e) => setPasteAnswer(e.target.value)}
                placeholder="Lim inn svarkode …"
                className="mt-1.5 h-24 w-full rounded-xl border-2 border-neon-lime/40 bg-stage/80 p-2.5 font-mono text-xs text-gray-100 backdrop-blur transition-colors placeholder:text-gray-500 focus:border-neon-lime focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || !pasteAnswer.trim()}
                onClick={() => {
                  playSound("click");
                  run(() => acceptAnswer(pasteAnswer.trim()));
                }}
                className="mt-2 rounded-xl border-2 border-neon-lime px-4 py-2 font-display uppercase tracking-wide text-neon-lime text-glow transition-all hover:box-glow hover:glow-lime disabled:opacity-40 disabled:hover:shadow-none"
              >
                Koble til
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="conn-step">
            <p className="text-sm text-gray-300">
              1. Lim inn tilbudskoden du fikk fra verten, og lag et svar.
            </p>
            <textarea
              value={pasteOffer}
              onChange={(e) => setPasteOffer(e.target.value)}
              placeholder="Lim inn tilbudskode …"
              disabled={!!answerCode}
              className="mt-1.5 h-24 w-full rounded-xl border-2 border-neon-pink/40 bg-stage/80 p-2.5 font-mono text-xs text-gray-100 backdrop-blur transition-colors placeholder:text-gray-500 focus:border-neon-pink focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              disabled={busy || !pasteOffer.trim() || !!answerCode}
              onClick={() => {
                playSound("click");
                run(async () => {
                  const code = await acceptOffer(pasteOffer.trim());
                  setAnswerCode(code);
                });
              }}
              className="mt-2 rounded-xl border-2 border-neon-pink px-4 py-2 font-display uppercase tracking-wide text-neon-pink text-glow transition-all hover:box-glow hover:glow-pink disabled:opacity-40 disabled:hover:shadow-none"
            >
              Generer svarkode
            </button>
          </div>

          {answerCode && (
            <div className="conn-step">
              <p className="text-sm text-gray-300">
                2. Send denne svarkoden tilbake til verten. Dere er koblet når
                verten limer den inn.
              </p>
              <CopyArea value={answerCode} label="Svarkode (send til vert)" />
            </div>
          )}
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
