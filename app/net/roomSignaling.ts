// Client for the in-memory signaling mailbox (app/routes/api.room.$code.ts).
//
// All calls are plain same-origin fetch against /api/room/:code. Connection
// setup is one-shot per guest (offer/answer), but discovering peers/answers
// needs polling, so we expose an abortable poll helper.

export interface RoomState {
  guests: Record<string, { offer?: string; answer?: string }>;
}

/** Carries the server's machine-readable error code (e.g. "no-room"). */
export class SignalError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "SignalError";
  }
}

const POLL_INTERVAL_MS = 1500;

function url(code: string): string {
  return `/api/room/${encodeURIComponent(code)}`;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/** Resolves after `ms`, or rejects immediately if the signal aborts. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort);
  });
}

async function post(
  code: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(url(code), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new SignalError(data.error ?? `http-${res.status}`, res.status);
  }
}

/** Host: create (or refresh) the room. */
export function openRoom(code: string): Promise<void> {
  return post(code, { kind: "open" });
}

/** Guest: register a slot. Throws SignalError("no-room") on a wrong code. */
export function joinRoom(code: string, guestId: string): Promise<void> {
  return post(code, { kind: "join", guestId });
}

/** Host: publish the offer for a specific guest. */
export function postOffer(
  code: string,
  guestId: string,
  blob: string,
): Promise<void> {
  return post(code, { kind: "offer", guestId, blob });
}

/** Guest: publish its answer back to the host. */
export function postAnswer(
  code: string,
  guestId: string,
  blob: string,
): Promise<void> {
  return post(code, { kind: "answer", guestId, blob });
}

/** Read the current room state; null if the room doesn't exist (yet). */
export async function fetchRoom(
  code: string,
  signal?: AbortSignal,
): Promise<RoomState | null> {
  const res = await fetch(url(code), { signal });
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new SignalError(data.error ?? `http-${res.status}`, res.status);
  }
  return (await res.json()) as RoomState;
}

/**
 * Poll the room until `predicate(room)` is truthy, then resolve with that room.
 * Rejects with an AbortError when the signal aborts. A missing room (404) is
 * treated as "not ready yet" and keeps polling.
 */
export async function pollRoom(
  code: string,
  predicate: (room: RoomState) => boolean,
  signal?: AbortSignal,
): Promise<RoomState> {
  for (;;) {
    if (signal?.aborted) throw abortError();
    const room = await fetchRoom(code, signal);
    if (room && predicate(room)) return room;
    await delay(POLL_INTERVAL_MS, signal);
  }
}
