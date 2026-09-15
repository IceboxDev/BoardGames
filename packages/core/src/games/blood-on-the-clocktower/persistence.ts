// Loading persisted companion documents: validate against the current
// schema, migrating older versions forward first. The web client stores
// these in localStorage; the exact storage is its business — this module
// only knows shapes and their history.
//
// Adding a version: bump the literal in schema.ts, append a `migrateVn`
// step below, and pin the previous shape in persistence.test.ts.

import { nightQueue, nightStepId } from "./companion.ts";
import {
  BAG_DRAFT_VERSION,
  type BagDraft,
  BagDraftSchema,
  COMPANION_STATE_VERSION,
  type CompanionState,
  CompanionStateSchema,
  RosterSchema,
} from "./schema.ts";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function fail<T>(reason: string): ParseResult<T> {
  return { ok: false, reason };
}

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
}

// ── Companion state ───────────────────────────────────────────────────

/**
 * v1 (the August 2026 shape): a positional `nightStep` cursor, no
 * `nightProgress`, the Po's charge as a boolean, and `script` absent on
 * saves from before Bad Moon Rising shipped (Trouble Brewing implied).
 */
function migrateV1(raw: Record<string, unknown>): Record<string, unknown> {
  const { nightStep, poCharged, ...rest } = raw;
  const phase = isRecord(raw.phase) ? raw.phase : undefined;
  const night =
    phase?.kind === "night" && typeof phase.night === "number" ? phase.night : undefined;
  const day = phase?.kind === "day" && typeof phase.day === "number" ? phase.day : undefined;
  const players = Array.isArray(raw.players) ? raw.players : [];
  // The Demon's picks tonight are not recorded in v1 — the victims are.
  const demonChoices = players
    .filter((p): p is Record<string, unknown> => isRecord(p) && p.diedByDemonTonight === true)
    .map((p) => p.seat)
    .filter((s): s is number => typeof s === "number");
  const draft: Record<string, unknown> = {
    ...rest,
    version: 2,
    script: raw.script ?? "trouble-brewing",
    nightProgress: { resolved: [], demonChoices },
  };
  if (poCharged === true) {
    // The charge was booked on the last night the Po acted.
    const charged = night !== undefined ? night - 1 : (day ?? 0);
    if (charged > 0) draft.poChargedNight = charged;
  }
  // The positional cursor is re-read as the identity of the step it pointed
  // at, on the queue the migrated state produces.
  if (typeof nightStep === "number" && night !== undefined) {
    const parsed = CompanionStateSchema.safeParse(draft);
    if (parsed.success) {
      const queue = nightQueue(parsed.data);
      const step = queue[Math.max(0, Math.min(nightStep, queue.length - 1))];
      if (step) {
        draft.nightProgress = { ...parsed.data.nightProgress, cursor: nightStepId(step) };
      }
    }
  }
  return draft;
}

/** Validate a stored companion game, migrating older versions forward. */
export function parseCompanionState(raw: unknown): ParseResult<CompanionState> {
  if (!isRecord(raw)) return fail("not an object");
  let doc: Record<string, unknown> = raw;
  const version = typeof doc.version === "number" ? doc.version : 1;
  if (version > COMPANION_STATE_VERSION) return fail(`saved by a newer app (v${version})`);
  if (version < 1) return fail(`unknown version ${version}`);
  if (version === 1) doc = migrateV1(doc);
  const parsed = CompanionStateSchema.safeParse(doc);
  return parsed.success ? { ok: true, value: parsed.data } : fail(issues(parsed.error));
}

// ── Bag draft ─────────────────────────────────────────────────────────

/** The unversioned bag draft (August 2026): `edition` optional, no `version`. */
function migrateBagV0(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, version: 1, edition: raw.edition ?? "trouble-brewing" };
}

/** Validate a stored bag draft, migrating older versions forward. */
export function parseBagDraft(raw: unknown): ParseResult<BagDraft> {
  if (!isRecord(raw)) return fail("not an object");
  let doc: Record<string, unknown> = raw;
  const version = typeof doc.version === "number" ? doc.version : 0;
  if (version > BAG_DRAFT_VERSION) return fail(`saved by a newer app (v${version})`);
  if (version === 0) doc = migrateBagV0(doc);
  const parsed = BagDraftSchema.safeParse(doc);
  return parsed.success ? { ok: true, value: parsed.data } : fail(issues(parsed.error));
}

// ── Roster ────────────────────────────────────────────────────────────

/** The last-used roster; anything malformed reads as empty. */
export function parseRoster(raw: unknown): string[] {
  const parsed = RosterSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
