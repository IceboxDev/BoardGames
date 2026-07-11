// In-memory BGA bridge session registry — one producer (a userscript on the
// user's BGA tab) relaying raw game events to any number of read-only
// spectators on our site.
//
// The server never interprets BGA payloads: it keeps a seq-ordered buffer and
// fans events out over SSE. A `gamedatas` event is a full-state checkpoint,
// so everything older is dropped when one arrives — late joiners always
// replay `gamedatas + notifs since`.
//
// Sessions live in memory, but are SELF-HEALING across restarts: the ingest
// token, session id and join code are all deterministic HMAC derivations of
// (userId, game), and the token is a signed `{u, g}` blob. So when a restart
// (or Railway redeploy) wipes the maps, the next ingest verifies the token and
// revives the identical session on the fly — the userscript keeps its token,
// viewers keep their code, and the owner's SSE reconnects to the same id.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { BgaEvent, BgaGame, BgaSession } from "@boardgames/core/protocol";
import { BGA_SUPPORTED_GAMES } from "@boardgames/core/protocol";
import { z } from "zod";

type BgaSessionEntry = {
  session: BgaSession;
  userId: string;
  /** Opaque ingest credential — returned once at creation, never logged. */
  token: string;
  /** Checkpoint log: the last gamedatas plus every notif after it. */
  events: BgaEvent[];
  lastSeq: number;
  lastIngestAt: number;
  /** Ingest timestamps inside the current rate window. */
  ingestWindow: number[];
  clients: Set<(event: BgaEvent) => void>;
};

const byId = new Map<string, BgaSessionEntry>();
const byUser = new Map<string, BgaSessionEntry>();
const byCode = new Map<string, BgaSessionEntry>();

// Hard caps so a runaway producer can't grow memory unbounded.
const MAX_BUFFERED_EVENTS = 4000;
const MAX_BUFFERED_BYTES = 15_000_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const IDLE_SWEEP_MS = 60 * 60 * 1000;
const IDLE_MAX_MS = 6 * 60 * 60 * 1000;

// No 0/O/1/I — same read-aloud alphabet as the beamer codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ── Deterministic, signed credentials (survive restarts) ────────────────────

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production to sign BGA ingest tokens");
  }
  return "dev-insecure-bga-ingest-secret";
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

const TokenPayloadSchema = z.object({ u: z.string().min(1), g: z.string().min(1) });

/** Long-lived signed token carrying `{userId, game}`; the userscript pastes it once. */
function signIngestToken(userId: string, game: BgaGame): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, g: game })).toString("base64url");
  return `${payload}.${hmac(payload).toString("base64url")}`;
}

function verifyIngestToken(token: string): { userId: string; game: BgaGame } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(hmac(payload).toString("base64url"));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = TokenPayloadSchema.safeParse(json);
  if (!parsed.success) return null;
  if (!(BGA_SUPPORTED_GAMES as readonly string[]).includes(parsed.data.g)) return null;
  return { userId: parsed.data.u, game: parsed.data.g as BgaGame };
}

function deterministicId(userId: string, game: string): string {
  const h = hmac(`id:${userId}:${game}`).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function deterministicCode(userId: string, game: string): string {
  const h = hmac(`code:${userId}:${game}`);
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[h[i] % CODE_ALPHABET.length];
  return code;
}

function dropEntry(entry: BgaSessionEntry): void {
  byId.delete(entry.session.id);
  byCode.delete(entry.session.code);
  if (byUser.get(entry.userId) === entry) byUser.delete(entry.userId);
  entry.clients.clear();
}

/**
 * Get the live entry for (userId, game), or build it from the deterministic
 * credentials. Idempotent: a restart that wiped the maps rebuilds the exact
 * same session (same id/code/token), so no client needs to re-sync.
 */
function reviveOrCreate(userId: string, game: BgaGame): BgaSessionEntry {
  const id = deterministicId(userId, game);
  const existing = byId.get(id);
  if (existing) return existing;

  const entry: BgaSessionEntry = {
    session: {
      id,
      code: deterministicCode(userId, game),
      game,
      createdAt: new Date().toISOString(),
    },
    userId,
    token: signIngestToken(userId, game),
    events: [],
    lastSeq: -1,
    lastIngestAt: Date.now(),
    ingestWindow: [],
    clients: new Set(),
  };
  byId.set(entry.session.id, entry);
  byUser.set(userId, entry);
  byCode.set(entry.session.code, entry);
  return entry;
}

/**
 * Create (or return) the user's bridge session for a game. Deterministic, so
 * switching games reuses/rebuilds a stable per-game session. Drops a different
 * game's active session for this user first.
 */
export function createOrReuseBgaSession(
  userId: string,
  game: BgaGame,
): { session: BgaSession; ingestToken: string } {
  const existing = byUser.get(userId);
  if (existing && existing.session.game !== game) dropEntry(existing);
  const entry = reviveOrCreate(userId, game);
  return { session: entry.session, ingestToken: entry.token };
}

export function getActiveBgaSession(userId: string): BgaSession | null {
  return byUser.get(userId)?.session ?? null;
}

/** Spectator join: possession of the code IS the authorization. */
export function getBgaSessionByCode(code: string): BgaSession | null {
  return byCode.get(code.trim().toUpperCase())?.session ?? null;
}

export function getBgaSessionById(sessionId: string): BgaSession | null {
  return byId.get(sessionId)?.session ?? null;
}

export function getBgaSessionLastSeq(sessionId: string): number {
  return byId.get(sessionId)?.lastSeq ?? -1;
}

function findByToken(token: string): BgaSessionEntry | null {
  // Constant-time comparison against every candidate — the session count is
  // tiny (one per user) and this avoids a token→entry map keyed on secrets.
  const probe = Buffer.from(token);
  for (const entry of byId.values()) {
    const candidate = Buffer.from(entry.token);
    if (candidate.length === probe.length && timingSafeEqual(candidate, probe)) {
      return entry;
    }
  }
  return null;
}

export type IngestResult =
  | { ok: true; accepted: number; nextSeq: number; sessionId: string }
  | { ok: false; status: 401 | 413 | 429; error: string };

/**
 * Accept a producer batch: dedupe already-seen seqs, compact the buffer on a
 * gamedatas checkpoint, enforce rate/size caps, and fan accepted events out
 * to subscribers.
 */
export function ingestBgaEvents(token: string, events: BgaEvent[]): IngestResult {
  let entry = findByToken(token);
  if (!entry) {
    // Self-heal: a valid signed token whose session was wiped (restart) revives
    // the identical session on the fly, so the bridge survives redeploys.
    const claim = verifyIngestToken(token);
    if (!claim) return { ok: false, status: 401, error: "Unknown ingest token" };
    entry = reviveOrCreate(claim.userId, claim.game);
  }

  const now = Date.now();
  entry.ingestWindow = entry.ingestWindow.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (entry.ingestWindow.length >= RATE_LIMIT_MAX_REQUESTS) {
    return { ok: false, status: 429, error: "Rate limit exceeded" };
  }
  entry.ingestWindow.push(now);
  entry.lastIngestAt = now;

  let accepted = 0;
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.seq <= entry.lastSeq) continue; // duplicate/replayed batch
    if (event.kind === "gamedatas") {
      entry.events = [event]; // checkpoint compaction
    } else {
      entry.events.push(event);
    }
    entry.lastSeq = event.seq;
    accepted++;
    for (const send of entry.clients) send(event);
  }

  // Cap the buffer: keep the newest events; the next gamedatas re-anchors.
  if (entry.events.length > MAX_BUFFERED_EVENTS) {
    entry.events = entry.events.slice(entry.events.length - MAX_BUFFERED_EVENTS);
  }
  let bytes = 0;
  for (let i = entry.events.length - 1; i >= 0; i--) {
    bytes += JSON.stringify(entry.events[i].payload).length;
    if (bytes > MAX_BUFFERED_BYTES) {
      entry.events = entry.events.slice(i + 1);
      break;
    }
  }

  return { ok: true, accepted, nextSeq: entry.lastSeq + 1, sessionId: entry.session.id };
}

/**
 * Subscribe a spectator: replays every buffered event with seq > sinceSeq
 * (the buffer always starts at a gamedatas checkpoint), then streams live.
 * The route layer serializes frames (and sets the SSE `id:` from seq).
 * Returns an unsubscribe fn, or null if the session doesn't exist.
 */
export function subscribeToBgaSession(
  sessionId: string,
  send: (event: BgaEvent) => void,
  sinceSeq: number,
): (() => void) | null {
  const entry = byId.get(sessionId);
  if (!entry) return null;
  for (const event of entry.events) {
    if (event.seq > sinceSeq) send(event);
  }
  entry.clients.add(send);
  return () => entry.clients.delete(send);
}

function sweepIdleSessions(): void {
  const cutoff = Date.now() - IDLE_MAX_MS;
  for (const entry of [...byId.values()]) {
    if (entry.lastIngestAt < cutoff) dropEntry(entry);
  }
}

// Module-scope sweep like the session maps themselves; unref so tests exit.
setInterval(sweepIdleSessions, IDLE_SWEEP_MS).unref();
