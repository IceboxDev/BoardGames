import {
  type CompanionRecord,
  CompanionRecordListSchema,
  type CompanionRecordSlug,
  SaveCompanionRecordBodySchema,
  SaveCompanionRecordResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { apiFetch } from "./api-fetch.ts";
import { ReviewOutbox, useReviewOutbox } from "./review-outbox.ts";
import { jsonQuery } from "./typed-query.ts";

// Companion records: a finished Clocktower game or an ended D&D session,
// saved to the member's Match History by the device that ran it.
//
// Saves go through a durable outbox (`ReviewOutbox`, the trainers' queue):
// a table with no signal at the moment the game ends keeps the record in
// localStorage and sends it when the device is back online — reconnect, tab
// focus, or the next visit to either companion or its Match History.
//
// The server keys every record on the client id the game was given when it
// started, and a second save with that id REPLACES the first. So a record
// is queued again whenever what it says changes (a winner corrected after an
// Undo): each version is its own queue entry, sent in order, the last wins.
// An unchanged record is never queued twice — see `recordCompanionGame`.

const OUTBOX_KEY = "companion-records.outbox.v1";
/** clientId → fingerprint of the last version queued. */
const QUEUED_KEY = "companion-records.queued.v1";
const QUEUED_LIMIT = 100;

const QueuedItemSchema = z.object({
  /** `<clientId>#<fingerprint>` — one queue entry per version of a record. */
  key: z.string().min(1),
  body: SaveCompanionRecordBodySchema,
});
type QueuedItem = z.infer<typeof QueuedItemSchema>;

export function saveCompanionRecord(clientId: string, record: CompanionRecord) {
  return apiFetch(`/api/games/${record.game}/companion-records`, {
    method: "POST",
    body: { clientId, record },
    request: SaveCompanionRecordBodySchema,
    response: SaveCompanionRecordResponseSchema,
  });
}

export function companionRecordsQueryFn(slug: CompanionRecordSlug) {
  return jsonQuery(`/api/games/${slug}/companion-records`, CompanionRecordListSchema);
}

export const companionRecordOutbox = new ReviewOutbox<QueuedItem>({
  storageKey: OUTBOX_KEY,
  parse: (raw) => {
    const r = QueuedItemSchema.safeParse(raw);
    return r.success ? r.data : null;
  },
  idOf: (item) => item.key,
  sendOne: (item) => saveCompanionRecord(item.body.clientId, item.body.record),
  // One at a time, so a record's later version always lands after its earlier one.
  sendBatch: async (items) => {
    for (const item of items) await saveCompanionRecord(item.body.clientId, item.body.record);
  },
  maxBatch: 1,
});

/** Live "waiting to sync" count; mounting it keeps the outbox replaying. */
export function useCompanionRecordOutbox() {
  return useReviewOutbox(companionRecordOutbox);
}

/**
 * What a record says, minus when it was noticed: the same game seen ended
 * again after a refresh has a later `endedAt` but is not a new version.
 */
export function recordFingerprint(record: CompanionRecord): string {
  const { endedAt: _endedAt, ...rest } = record;
  const text = JSON.stringify(rest);
  // djb2 — a change detector, not a security boundary.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

type QueuedStore = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): QueuedStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readQueued(store: QueuedStore | null): Record<string, string> {
  try {
    const raw = store?.getItem(QUEUED_KEY);
    const parsed = z.record(z.string(), z.string()).safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeQueued(store: QueuedStore | null, queued: Record<string, string>): void {
  // Insertion order is age order: keep the newest QUEUED_LIMIT.
  const entries = Object.entries(queued).slice(-QUEUED_LIMIT);
  try {
    store?.setItem(QUEUED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage unavailable: at worst an unchanged record is re-sent (harmless).
  }
}

/**
 * Queue `record` for the member's Match History under `clientId`, unless this
 * exact version was queued already. Resolves `true` when it queued something.
 */
export async function recordCompanionGame(
  clientId: string,
  record: CompanionRecord,
  opts: { outbox?: Pick<ReviewOutbox<QueuedItem>, "enqueue">; store?: QueuedStore | null } = {},
): Promise<boolean> {
  const store = opts.store === undefined ? defaultStore() : opts.store;
  const outbox = opts.outbox ?? companionRecordOutbox;
  const fingerprint = recordFingerprint(record);
  const queued = readQueued(store);
  if (queued[clientId] === fingerprint) return false;
  await outbox.enqueue({ key: `${clientId}#${fingerprint}`, body: { clientId, record } });
  delete queued[clientId];
  queued[clientId] = fingerprint;
  writeQueued(store, queued);
  return true;
}

/** A fresh client id for a game that is starting. */
export function newCompanionRecordId(): string {
  return crypto.randomUUID();
}
