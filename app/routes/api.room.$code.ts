// Server-relayed room transport (replaces WebRTC).
//
// Every client connects only OUTBOUND to this server over HTTPS, so it works on
// any network (mobile/CGNAT/corporate) with no NAT traversal, STUN or TURN. The
// server is a dumb in-room message relay: each member long-polls for messages
// (GET) and posts messages (POST) that are fanned out to the other members.
//
// State is a process-local Map (single replica). Roster is authoritative here:
// members register on join, presence is kept alive by polling, and a "roster"
// message is pushed whenever membership changes.

import type { NetMessage, PlayerInfo } from "~/game/types";
import type { Route } from "./+types/api.room.$code";

/** How long a poll request blocks waiting for a message before returning []. */
const POLL_TIMEOUT_MS = 20_000;
/** Drop a member that hasn't polled within this window (closed tab/crash). */
const PRESENCE_TTL_MS = 35_000;
/** Reclaim empty/abandoned rooms. */
const ROOM_TTL_MS = 10 * 60 * 1000;
const MAX_MSG_BYTES = 64 * 1024;

interface Relayed {
  from: string;
  msg: NetMessage;
}

interface Member {
  pid: string;
  name: string;
  role: "host" | "guest";
  queue: Relayed[];
  wake: (() => void) | null;
  lastSeen: number;
}

interface Room {
  members: Map<string, Member>;
  createdAt: number;
  locked: boolean;
}

const rooms = new Map<string, Room>();

function normCode(raw: string | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function rosterOf(room: Room): PlayerInfo[] {
  // Host first, then guests in join order.
  const members = [...room.members.values()];
  members.sort((a, b) => (a.role === "host" ? -1 : b.role === "host" ? 1 : 0));
  return members.map((m) => ({ pid: m.pid, name: m.name }));
}

function enqueue(member: Member, relayed: Relayed): void {
  member.queue.push(relayed);
  if (member.wake) {
    const w = member.wake;
    member.wake = null;
    w();
  }
}

function broadcastRoster(room: Room): void {
  const players = rosterOf(room);
  const relayed: Relayed = { from: "server", msg: { type: "roster", players } };
  for (const m of room.members.values()) enqueue(m, { ...relayed });
}

/** Drop stale members + empty rooms. Returns false if the room is now gone. */
function sweep(code: string, room: Room): boolean {
  const now = Date.now();
  let changed = false;
  for (const [pid, m] of room.members) {
    if (now - m.lastSeen > PRESENCE_TTL_MS) {
      room.members.delete(pid);
      changed = true;
    }
  }
  if (room.members.size === 0 && now - room.createdAt > 5000) {
    rooms.delete(code);
    return false;
  }
  if (changed) broadcastRoster(room);
  return true;
}

// --- GET: long-poll for this member's messages ------------------------------

export async function loader({ params, request }: Route.LoaderArgs) {
  const code = normCode(params.code);
  const room = rooms.get(code);
  const pid = new URL(request.url).searchParams.get("pid") ?? "";
  if (!room || !room.members.has(pid)) {
    return json({ error: "no-room" }, 404);
  }

  const member = room.members.get(pid)!;
  member.lastSeen = Date.now();
  sweep(code, room);

  if (member.queue.length) {
    return json({ messages: member.queue.splice(0) });
  }

  const messages = await new Promise<Relayed[]>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      member.wake = null;
      request.signal.removeEventListener("abort", onAbort);
      resolve(member.queue.splice(0));
    };
    const onAbort = () => {
      clearTimeout(timer);
      member.wake = null;
      request.signal.removeEventListener("abort", onAbort);
      resolve([]);
    };
    const timer = setTimeout(finish, POLL_TIMEOUT_MS);
    member.wake = finish;
    request.signal.addEventListener("abort", onAbort);
  });

  return json({ messages });
}

// --- POST: open / join / send / lock / leave --------------------------------

export async function action({ params, request }: Route.ActionArgs) {
  const code = normCode(params.code);
  if (!code) return json({ error: "bad-code" }, 400);

  let body: {
    kind?: string;
    pid?: string;
    name?: string;
    role?: "host" | "guest";
    msg?: NetMessage;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-json" }, 400);
  }

  const { kind, pid, name, role, msg } = body;
  if (typeof pid !== "string" || !pid) return json({ error: "bad-pid" }, 400);

  if (kind === "open") {
    let room = rooms.get(code);
    if (!room) {
      room = { members: new Map(), createdAt: Date.now(), locked: false };
      rooms.set(code, room);
    }
    room.members.set(pid, {
      pid,
      name: name ?? "Vert",
      role: "host",
      queue: [],
      wake: null,
      lastSeen: Date.now(),
    });
    broadcastRoster(room);
    return json({ ok: true });
  }

  const room = rooms.get(code);
  if (!room) return json({ error: "no-room" }, 404);

  switch (kind) {
    case "join": {
      if (room.locked) return json({ error: "locked" }, 409);
      room.members.set(pid, {
        pid,
        name: name ?? "Spiller",
        role: role === "host" ? "host" : "guest",
        queue: [],
        wake: null,
        lastSeen: Date.now(),
      });
      broadcastRoster(room);
      return json({ ok: true });
    }
    case "send": {
      if (!room.members.has(pid)) return json({ error: "no-member" }, 404);
      if (!msg) return json({ error: "bad-msg" }, 400);
      if (JSON.stringify(msg).length > MAX_MSG_BYTES) {
        return json({ error: "too-big" }, 400);
      }
      for (const [otherPid, m] of room.members) {
        if (otherPid !== pid) enqueue(m, { from: pid, msg });
      }
      return json({ ok: true });
    }
    case "lock": {
      room.locked = true;
      return json({ ok: true });
    }
    case "leave": {
      room.members.delete(pid);
      if (room.members.size === 0) rooms.delete(code);
      else broadcastRoster(room);
      return json({ ok: true });
    }
    default:
      return json({ error: "bad-kind" }, 400);
  }
}

// Periodic reclaim of abandoned rooms (in case nobody polls them).
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (
        room.members.size === 0 &&
        now - room.createdAt > ROOM_TTL_MS
      ) {
        rooms.delete(code);
      }
    }
  }, 60_000).unref?.();
}
