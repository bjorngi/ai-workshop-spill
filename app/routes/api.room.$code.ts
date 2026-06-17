// In-memory WebRTC signaling "mailbox" for room-code based connections.
//
// Topology is a star: one host, N guests. The host opens a room, then for each
// guest brokers a single offer/answer exchange through this endpoint. We keep a
// per-guest slot so any number of guests can connect to the same room code.
//
// Storage is a plain module-level Map (no DB): fine for the single-replica
// deployment, with a short TTL so abandoned rooms get reclaimed. Restarting the
// pod clears all rooms — acceptable for ephemeral game lobbies.

import type { Route } from "./+types/api.room.$code";

/** Rooms older than this are swept on the next request. */
const TTL_MS = 10 * 60 * 1000;
/** Cap blob size so a bad client can't balloon memory. */
const MAX_BLOB = 64 * 1024;

interface Slot {
  offer?: string;
  answer?: string;
  joinedAt: number;
}

interface Room {
  createdAt: number;
  guests: Map<string, Slot>;
}

// Survives across requests within the running server process.
const rooms = new Map<string, Room>();

function sweep(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > TTL_MS) rooms.delete(code);
  }
}

function normCode(raw: string | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

function serialize(room: Room) {
  const guests: Record<string, { offer?: string; answer?: string }> = {};
  for (const [gid, slot] of room.guests) {
    guests[gid] = { offer: slot.offer, answer: slot.answer };
  }
  return { guests };
}

export async function loader({ params }: Route.LoaderArgs) {
  sweep();
  const room = rooms.get(normCode(params.code));
  if (!room) return Response.json({ error: "no-room" }, { status: 404 });
  return Response.json(serialize(room));
}

export async function action({ request, params }: Route.ActionArgs) {
  sweep();
  const code = normCode(params.code);
  if (!code) return Response.json({ error: "bad-code" }, { status: 400 });

  let body: {
    kind?: string;
    guestId?: string;
    blob?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }

  const { kind, guestId, blob } = body;

  if (blob !== undefined && (typeof blob !== "string" || blob.length > MAX_BLOB)) {
    return Response.json({ error: "bad-blob" }, { status: 400 });
  }

  // Host opens (or refreshes) the room.
  if (kind === "open") {
    const existing = rooms.get(code);
    if (existing) existing.createdAt = Date.now();
    else rooms.set(code, { createdAt: Date.now(), guests: new Map() });
    return Response.json({ ok: true });
  }

  // Everything else requires an existing room + a guestId slot.
  const room = rooms.get(code);
  if (!room) return Response.json({ error: "no-room" }, { status: 404 });
  if (typeof guestId !== "string" || !guestId) {
    return Response.json({ error: "bad-guest" }, { status: 400 });
  }

  switch (kind) {
    case "join": {
      if (!room.guests.has(guestId)) {
        room.guests.set(guestId, { joinedAt: Date.now() });
      }
      return Response.json({ ok: true });
    }
    case "offer": {
      const slot = room.guests.get(guestId);
      if (!slot) return Response.json({ error: "no-guest" }, { status: 404 });
      slot.offer = blob;
      return Response.json({ ok: true });
    }
    case "answer": {
      const slot = room.guests.get(guestId);
      if (!slot) return Response.json({ error: "no-guest" }, { status: 404 });
      slot.answer = blob;
      return Response.json({ ok: true });
    }
    default:
      return Response.json({ error: "bad-kind" }, { status: 400 });
  }
}
