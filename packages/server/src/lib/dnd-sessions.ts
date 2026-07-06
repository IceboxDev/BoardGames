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
};

const byId = new Map<string, SessionEntry>();
const byUser = new Map<string, SessionEntry>();

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
    existing.clients.clear();
  }
  const entry: SessionEntry = {
    session: {
      id: randomUUID(),
      campaignId,
      campaignTitle,
      createdAt: new Date().toISOString(),
    },
    userId,
    clients: new Set(),
  };
  byId.set(entry.session.id, entry);
  byUser.set(userId, entry);
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

/**
 * Subscribe a beamer client to a session's event stream. Every payload is
 * validated through `BeamerEventSchema` at the source so a malformed event
 * throws here, not on the companion device. Returns an unsubscribe fn, or
 * null if the session doesn't exist / isn't the caller's.
 */
export function subscribeToSession(
  sessionId: string,
  userId: string,
  send: (data: string) => void,
): (() => void) | null {
  const entry = byId.get(sessionId);
  if (!entry || entry.userId !== userId) return null;
  entry.clients.add(send);
  return () => entry.clients.delete(send);
}

/** Broadcast an event to a session's subscribers. Returns the client count. */
export function broadcastToSession(sessionId: string, userId: string, event: BeamerEvent): number {
  const entry = byId.get(sessionId);
  if (!entry || entry.userId !== userId) return 0;
  const data = JSON.stringify(BeamerEventSchema.parse(event));
  for (const send of entry.clients) send(data);
  return entry.clients.size;
}
