// In-memory D&D session registry — the live table linking the DM's screen to
// beamer/TTS companion devices on the same account.
//
// One active session per user: the DM's device creates (or reuses) it when a
// campaign is opened; a companion polls `active`, then subscribes to the SSE
// stream and receives `BeamerEvent`s the DM's screen fires. Deliberately
// in-memory (like avatar jobs): a server restart drops sessions and the DM's
// screen simply re-creates one on next mount — nothing durable is lost.

import { randomUUID } from "node:crypto";
import type { BeamerEvent, DndSession } from "@boardgames/core/protocol";
import { BeamerEventSchema } from "@boardgames/core/protocol";

type SessionEntry = {
  session: DndSession;
  userId: string;
  clients: Set<(data: string) => void>;
  /** The image currently on the beamer, held in memory like the session. */
  image: { bytes: Buffer; contentType: string; version: number } | null;
};

const byId = new Map<string, SessionEntry>();
const byUser = new Map<string, SessionEntry>();
const byCode = new Map<string, SessionEntry>();

// No 0/O/1/I — the code is read aloud across the table.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!byCode.has(code)) return code;
  }
}

/**
 * Create the user's active session, or return the existing one when it
 * already points at the same campaign (so a beamer that connected during
 * setup survives the DM moving from setup to the game screen). Switching
 * campaigns replaces the session and drops its subscribers.
 */
export function createOrReuseSession(
  userId: string,
  campaignId: string,
  campaignTitle: string | null,
): DndSession {
  const existing = byUser.get(userId);
  if (existing && existing.session.campaignId === campaignId) {
    return existing.session;
  }
  if (existing) {
    byId.delete(existing.session.id);
    byCode.delete(existing.session.code);
    existing.clients.clear();
  }
  const entry: SessionEntry = {
    session: {
      id: randomUUID(),
      code: newCode(),
      campaignId,
      campaignTitle,
      createdAt: new Date().toISOString(),
    },
    userId,
    clients: new Set(),
    image: null,
  };
  byId.set(entry.session.id, entry);
  byUser.set(userId, entry);
  byCode.set(entry.session.code, entry);
  return entry.session;
}

export function getActiveSession(userId: string): DndSession | null {
  return byUser.get(userId)?.session ?? null;
}

export function getSession(sessionId: string, userId: string): DndSession | null {
  const entry = byId.get(sessionId);
  if (!entry || entry.userId !== userId) return null;
  return entry.session;
}

/** Lookup without owner check — for stream attach via code-derived id. */
export function getSessionById(sessionId: string): DndSession | null {
  return byId.get(sessionId)?.session ?? null;
}

/** Companion join: possession of the code IS the authorization. */
export function getSessionByCode(code: string): DndSession | null {
  return byCode.get(code.trim().toUpperCase())?.session ?? null;
}

/**
 * Subscribe a beamer client to a session's event stream. The session id is
 * an unguessable uuid handed out via the join code, so possession of it is
 * the authorization — companions may be a different account than the DM.
 * Returns an unsubscribe fn, or null if the session doesn't exist.
 */
export function subscribeToSession(
  sessionId: string,
  send: (data: string) => void,
): (() => void) | null {
  const entry = byId.get(sessionId);
  if (!entry) return null;
  entry.clients.add(send);
  return () => entry.clients.delete(send);
}

/** Store the beamer image (owner only); returns the new version. */
export function setSessionImage(sessionId: string, userId: string, dataUri: string): number | null {
  const entry = byId.get(sessionId);
  if (!entry || entry.userId !== userId) return null;
  const comma = dataUri.indexOf(",");
  const header = dataUri.slice(0, comma);
  const contentType = header.slice("data:".length, header.indexOf(";"));
  const bytes = Buffer.from(dataUri.slice(comma + 1), "base64");
  const version = (entry.image?.version ?? 0) + 1;
  entry.image = { bytes, contentType, version };
  return version;
}

export function getSessionImage(
  sessionId: string,
): { bytes: Buffer; contentType: string; version: number } | null {
  return byId.get(sessionId)?.image ?? null;
}

/** How many companion screens are attached right now. */
export function sessionClientCount(sessionId: string): number {
  return byId.get(sessionId)?.clients.size ?? 0;
}

/** Broadcast an event to a session's subscribers. Returns the client count. */
export function broadcastToSession(sessionId: string, userId: string, event: BeamerEvent): number {
  const entry = byId.get(sessionId);
  if (!entry || entry.userId !== userId) return 0;
  const data = JSON.stringify(BeamerEventSchema.parse(event));
  for (const send of entry.clients) send(data);
  return entry.clients.size;
}
