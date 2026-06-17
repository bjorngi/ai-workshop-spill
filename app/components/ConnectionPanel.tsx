// Copy-paste WebRTC signaling UI for the 4-step manual handshake.
//
// Host:  1) generer tilbud -> kopier til gjest
//        2) lim inn svaret fra gjest -> koblet
// Guest: 1) lim inn tilbudet fra vert -> generer svar
//        2) kopier svaret -> send til vert -> koblet

import { useState } from "react";

import type { ConnState } from "~/net/webrtc";

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

function CopyArea({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
        {label}
      </label>
      <textarea
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 h-24 w-full rounded-lg border border-gray-300 bg-gray-50 p-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* ignore */
          }
        }}
        className="mt-1 rounded-lg bg-gray-700 px-3 py-1 text-sm font-medium text-white hover:bg-gray-800"
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

  return (
    <div className="w-full max-w-lg space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {intent === "host" ? "Vert – koble til gjest" : "Gjest – koble til vert"}
        </h2>
        <span
          className={[
            "rounded-full px-3 py-1 text-xs font-semibold",
            connected
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
              : state === "failed"
                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
          ].join(" ")}
        >
          {STATE_LABELS[state]}
        </span>
      </div>

      {intent === "host" ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              1. Lag et tilbud og send koden til gjesten (f.eks. på chat).
            </p>
            <button
              type="button"
              disabled={busy || !!offerCode}
              onClick={() =>
                run(async () => {
                  const code = await createOffer();
                  setOfferCode(code);
                })
              }
              className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Generer tilbudskode
            </button>
          </div>

          {offerCode && (
            <CopyArea value={offerCode} label="Tilbudskode (send til gjest)" />
          )}

          {offerCode && !connected && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                2. Lim inn svarkoden du får tilbake fra gjesten.
              </p>
              <textarea
                value={pasteAnswer}
                onChange={(e) => setPasteAnswer(e.target.value)}
                placeholder="Lim inn svarkode …"
                className="mt-1 h-24 w-full rounded-lg border border-gray-300 bg-gray-50 p-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                disabled={busy || !pasteAnswer.trim()}
                onClick={() => run(() => acceptAnswer(pasteAnswer.trim()))}
                className="mt-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Koble til
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              1. Lim inn tilbudskoden du fikk fra verten, og lag et svar.
            </p>
            <textarea
              value={pasteOffer}
              onChange={(e) => setPasteOffer(e.target.value)}
              placeholder="Lim inn tilbudskode …"
              disabled={!!answerCode}
              className="mt-1 h-24 w-full rounded-lg border border-gray-300 bg-gray-50 p-2 font-mono text-xs disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              disabled={busy || !pasteOffer.trim() || !!answerCode}
              onClick={() =>
                run(async () => {
                  const code = await acceptOffer(pasteOffer.trim());
                  setAnswerCode(code);
                })
              }
              className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Generer svarkode
            </button>
          </div>

          {answerCode && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                2. Send denne svarkoden tilbake til verten. Dere er koblet når
                verten limer den inn.
              </p>
              <CopyArea value={answerCode} label="Svarkode (send til vert)" />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-100 p-2 text-sm text-rose-700 dark:bg-rose-900/50 dark:text-rose-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400"
      >
        ← Tilbake
      </button>
    </div>
  );
}
