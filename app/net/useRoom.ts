// Room manager for N-player multiplayer over a server-relayed HTTP transport.
//
// No WebRTC: every client connects only OUTBOUND to our own server, so it works
// on any network with no NAT traversal / STUN / TURN. Each client long-polls
// GET /api/room/:code for messages and POSTs messages that the server fans out
// to the other room members (see app/routes/api.room.$code.ts).
//
// The host is still authoritative at the game level (drives start/next, relays
// placements); the server is just a dumb message relay + roster keeper.

import { useCallback, useEffect, useRef, useState } from "react";

import type { NetMessage, PlayerInfo } from "~/game/types";

export type RoomStatus = "idle" | "connecting" | "connected" | "failed" | "closed";

/** Fixed pid for the host within a room. */
const HOST_PID = "host";

/** Ambiguity-free room-code alphabet (no I/O/0/1). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short, shareable, uppercase room code. */
export function makeRoomCode(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function roomUrl(code: string): string {
  return `/api/room/${encodeURIComponent(code)}`;
}

/** Sleep that resolves early (does not reject) when aborted. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort);
  });
}

interface Relayed {
  from: string;
  msg: NetMessage;
}

/** Imperative core, kept out of React so it survives re-renders. */
class RoomManager {
  role: "host" | "guest" | null = null;
  myPid = HOST_PID;
  myName = "";
  code = "";
  status: RoomStatus = "idle";
  roster: PlayerInfo[] = [];

  /** Gameplay messages (not roster) are forwarded here. */
  onMessage: ((msg: NetMessage, fromPid: string) => void) | null = null;
  /** Notify React that status/roster changed. */
  onChange: (() => void) | null = null;

  private abort = new AbortController();

  private setStatus(s: RoomStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onChange?.();
  }

  private emit(): void {
    this.onChange?.();
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(roomUrl(this.code), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `http-${res.status}`);
    }
  }

  // --- lifecycle -----------------------------------------------------------

  async hostRoom(code: string, name: string): Promise<void> {
    this.role = "host";
    this.myPid = HOST_PID;
    this.myName = name;
    this.code = code;
    this.roster = [{ pid: HOST_PID, name }];
    this.setStatus("connecting");
    await this.post({ kind: "open", pid: HOST_PID, name, role: "host" });
    this.setStatus("connected");
    void this.pollLoop();
  }

  async joinRoom(code: string, name: string): Promise<void> {
    this.role = "guest";
    this.myPid = makeId();
    this.myName = name;
    this.code = code;
    this.roster = [{ pid: this.myPid, name }];
    this.setStatus("connecting");
    // Throws "no-room" (wrong code) or "locked" (game already started).
    await this.post({ kind: "join", pid: this.myPid, name, role: "guest" });
    this.setStatus("connected");
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    const signal = this.abort.signal;
    while (!signal.aborted) {
      try {
        const res = await fetch(`${roomUrl(this.code)}?pid=${encodeURIComponent(this.myPid)}`, {
          signal,
        });
        if (res.status === 404) {
          this.setStatus("closed");
          return;
        }
        if (!res.ok) {
          await sleep(1000, signal);
          continue;
        }
        const data = (await res.json()) as { messages?: Relayed[] };
        for (const { from, msg } of data.messages ?? []) {
          this.dispatch(msg, from);
        }
      } catch {
        if (signal.aborted) return;
        await sleep(1000, signal);
      }
    }
  }

  // --- messaging -----------------------------------------------------------

  /** Host → all guests. (Server fans out to every other member.) */
  broadcast(msg: NetMessage): void {
    void this.post({ kind: "send", pid: this.myPid, msg }).catch(() => {});
  }

  /** Guest → host. (Same transport; guests ignore each other's messages.) */
  sendToHost(msg: NetMessage): void {
    void this.post({ kind: "send", pid: this.myPid, msg }).catch(() => {});
  }

  /** Stop accepting new guests (called when the game starts). */
  stopAccepting(): void {
    void this.post({ kind: "lock", pid: this.myPid }).catch(() => {});
  }

  private dispatch(msg: NetMessage, fromPid: string): void {
    if (msg.type === "roster") {
      this.roster = msg.players;
      this.emit();
      return;
    }
    this.onMessage?.(msg, fromPid);
  }

  get connectedCount(): number {
    return Math.max(0, this.roster.length - 1);
  }

  reset(): void {
    this.abort.abort();
    if (this.code && this.myPid) {
      // Best-effort leave so the roster updates for everyone else.
      void fetch(roomUrl(this.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "leave", pid: this.myPid }),
        keepalive: true,
      }).catch(() => {});
    }
    this.role = null;
    this.roster = [];
    this.status = "idle";
    this.onChange?.();
  }
}

export interface UseRoom {
  role: "host" | "guest" | null;
  status: RoomStatus;
  myPid: string;
  roster: PlayerInfo[];
  connectedCount: number;
  hostRoom: (code: string, name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => Promise<void>;
  broadcast: (msg: NetMessage) => void;
  sendToHost: (msg: NetMessage) => void;
  stopAccepting: () => void;
  setOnMessage: (cb: (msg: NetMessage, fromPid: string) => void) => void;
  reset: () => void;
}

export function useRoom(): UseRoom {
  const mgrRef = useRef<RoomManager | null>(null);
  const [, force] = useState(0);

  const ensure = useCallback((): RoomManager => {
    if (mgrRef.current) return mgrRef.current;
    const mgr = new RoomManager();
    mgr.onChange = () => force((n) => n + 1);
    mgrRef.current = mgr;
    return mgr;
  }, []);

  const hostRoom = useCallback(
    (code: string, name: string) => ensure().hostRoom(code, name),
    [ensure],
  );
  const joinRoom = useCallback(
    (code: string, name: string) => ensure().joinRoom(code, name),
    [ensure],
  );
  const broadcast = useCallback((msg: NetMessage) => {
    mgrRef.current?.broadcast(msg);
  }, []);
  const sendToHost = useCallback((msg: NetMessage) => {
    mgrRef.current?.sendToHost(msg);
  }, []);
  const stopAccepting = useCallback(() => {
    mgrRef.current?.stopAccepting();
  }, []);
  const setOnMessage = useCallback(
    (cb: (msg: NetMessage, fromPid: string) => void) => {
      ensure().onMessage = cb;
    },
    [ensure],
  );
  const reset = useCallback(() => {
    mgrRef.current?.reset();
    mgrRef.current = null;
    force((n) => n + 1);
  }, []);

  useEffect(() => {
    return () => {
      mgrRef.current?.reset();
      mgrRef.current = null;
    };
  }, []);

  const mgr = mgrRef.current;
  return {
    role: mgr?.role ?? null,
    status: mgr?.status ?? "idle",
    myPid: mgr?.myPid ?? HOST_PID,
    roster: mgr?.roster ?? [],
    connectedCount: mgr?.connectedCount ?? 0,
    hostRoom,
    joinRoom,
    broadcast,
    sendToHost,
    stopAccepting,
    setOnMessage,
    reset,
  };
}
