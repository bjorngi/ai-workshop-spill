// Room manager for N-player WebRTC over a star (host-relay) topology.
//
// One host, many guests. Each guest holds a single RTCDataChannel to the host
// (a PeerLink). The host holds one PeerLink per guest, relays gameplay, and owns
// the roster. Offer/answer blobs are ferried through the in-memory signaling
// mailbox (roomSignaling.ts) keyed by a short room code.
//
// PeerLink (app/net/webrtc.ts) is reused unchanged as the single-connection
// primitive; this module just orchestrates many of them.

import { useCallback, useEffect, useRef, useState } from "react";

import type { NetMessage, PlayerInfo } from "~/game/types";
import { PeerLink, type ConnState } from "~/net/webrtc";
import {
  fetchRoom,
  joinRoom as joinRoomSignal,
  openRoom,
  pollRoom,
  postAnswer,
  postOffer,
} from "~/net/roomSignaling";

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

/** Sleep that rejects when aborted (host accept-loop pacing). */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort);
  });
}

function guestStatus(s: ConnState): RoomStatus {
  if (s === "connected") return "connected";
  if (s === "failed") return "failed";
  if (s === "closed") return "closed";
  return "connecting";
}

interface HostGuest {
  link: PeerLink;
  name?: string;
  open: boolean;
  answered: boolean;
}

/** Imperative core, kept out of React so it survives re-renders. */
class RoomManager {
  role: "host" | "guest" | null = null;
  myPid = HOST_PID;
  myName = "";
  code = "";
  status: RoomStatus = "idle";
  roster: PlayerInfo[] = [];

  /** Gameplay messages (not hello/roster) are forwarded here. */
  onMessage: ((msg: NetMessage, fromPid: string) => void) | null = null;
  /** Notify React that status/roster changed. */
  onChange: (() => void) | null = null;

  private abort = new AbortController();
  private guests = new Map<string, HostGuest>(); // host only
  private link: PeerLink | null = null; // guest only

  get connectedCount(): number {
    if (this.role === "host") {
      let n = 0;
      for (const g of this.guests.values()) if (g.open) n++;
      return n;
    }
    return this.link && this.status === "connected" ? 1 : 0;
  }

  private setStatus(s: RoomStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onChange?.();
  }

  private emit(): void {
    this.onChange?.();
  }

  // --- HOST ----------------------------------------------------------------

  async hostRoom(code: string, name: string): Promise<void> {
    this.role = "host";
    this.code = code;
    this.myName = name;
    this.myPid = HOST_PID;
    this.roster = [{ pid: HOST_PID, name }];
    this.setStatus("connecting");
    try {
      await openRoom(code);
    } catch {
      this.setStatus("failed");
      throw new Error("Kunne ikke åpne rom");
    }
    this.setStatus("connected"); // room is live; waiting for guests
    void this.runHostLoop();
  }

  private async runHostLoop(): Promise<void> {
    const signal = this.abort.signal;
    while (!signal.aborted) {
      try {
        const room = await fetchRoom(this.code, signal);
        if (room) {
          for (const [gid, slot] of Object.entries(room.guests)) {
            const existing = this.guests.get(gid);
            if (!existing) {
              void this.connectGuest(gid);
            } else if (!existing.answered && slot.answer) {
              existing.answered = true;
              existing.link.acceptAnswer(slot.answer).catch(() => {});
            }
          }
        }
        await sleep(1500, signal);
      } catch {
        return; // aborted
      }
    }
  }

  private async connectGuest(gid: string): Promise<void> {
    const link = new PeerLink();
    const entry: HostGuest = { link, open: false, answered: false };
    this.guests.set(gid, entry); // claim slot synchronously

    link.onMessage = (msg) => this.dispatch(msg, gid);
    link.onOpen = () => {
      entry.open = true;
      this.emit();
    };
    link.onStateChange = (s) => {
      if (s === "failed" || s === "closed") {
        entry.open = false;
        this.refreshHostRoster();
      }
    };

    try {
      const offer = await link.createOffer();
      await postOffer(this.code, gid, offer);
    } catch {
      this.guests.delete(gid);
    }
  }

  private refreshHostRoster(): void {
    const list: PlayerInfo[] = [{ pid: HOST_PID, name: this.myName }];
    for (const [gid, g] of this.guests) {
      if (g.open && g.name) list.push({ pid: gid, name: g.name });
    }
    this.roster = list;
    this.broadcast({ type: "roster", players: list });
    this.emit();
  }

  /** Stop accepting new guests (called when the game starts). */
  stopAccepting(): void {
    this.abort.abort();
  }

  broadcast(msg: NetMessage): void {
    for (const g of this.guests.values()) {
      if (g.open) {
        try {
          g.link.send(msg);
        } catch {
          /* channel not open */
        }
      }
    }
  }

  // --- GUEST ---------------------------------------------------------------

  async joinRoom(code: string, name: string): Promise<void> {
    this.role = "guest";
    this.code = code;
    this.myName = name;
    this.myPid = makeId();
    this.roster = [{ pid: this.myPid, name }];
    this.setStatus("connecting");

    await joinRoomSignal(code, this.myPid); // throws SignalError("no-room") on bad code

    const link = new PeerLink();
    this.link = link;
    link.onMessage = (msg) => this.dispatch(msg, HOST_PID);
    link.onStateChange = (s) => this.setStatus(guestStatus(s));
    link.onOpen = () => {
      this.setStatus("connected");
      try {
        link.send({ type: "hello", name: this.myName });
      } catch {
        /* ignore */
      }
    };

    const room = await pollRoom(
      code,
      (r) => !!r.guests[this.myPid]?.offer,
      this.abort.signal,
    );
    const offer = room.guests[this.myPid]!.offer!;
    const answer = await link.acceptOffer(offer);
    await postAnswer(code, this.myPid, answer);
    // Channel open + hello happen via link.onOpen.
  }

  sendToHost(msg: NetMessage): void {
    try {
      this.link?.send(msg);
    } catch {
      /* not open */
    }
  }

  // --- shared --------------------------------------------------------------

  /** Handle roster/hello internally; forward gameplay to onMessage. */
  private dispatch(msg: NetMessage, fromPid: string): void {
    if (msg.type === "hello") {
      // Host: a guest announced its name.
      const g = this.guests.get(fromPid);
      if (g) {
        g.name = msg.name;
        this.refreshHostRoster();
      }
      return;
    }
    if (msg.type === "roster") {
      // Guest: authoritative roster from the host.
      this.roster = msg.players;
      this.emit();
      return;
    }
    this.onMessage?.(msg, fromPid);
  }

  reset(): void {
    this.abort.abort();
    if (this.link) {
      this.link.close();
      this.link = null;
    }
    for (const g of this.guests.values()) g.link.close();
    this.guests.clear();
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
