// ONE-OFF (delete after use): backfill game_requests.headcount (migration 0059)
// for votes cast before the column existed, by replaying who was coming when
// each vote went in.
//
// Open night: headcount = (availability "can" ∪ RSVP yes) − RSVP no, at the
// vote's created_at. Reconstructed per person from the activity log:
//   - RSVP: rsvp / rsvp-kick / night-guest / rsvp-cleared events; before the
//     first event, the first event's `previous` (kick → was coming).
//   - Availability: diff-logged since 2026-08-05 (added / changed / removed);
//     a day with no event since then has kept its current status.
// Private night: the seat count (the player window's low end).
// Votes from before reliable logging (CUTOFF) stay NULL — never flagged.
//
// Usage (cwd packages/server):
//   pnpm exec tsx src/scripts/_backfill-vote-headcounts.ts            # staging, dry run
//   pnpm exec tsx src/scripts/_backfill-vote-headcounts.ts --apply    # staging, write
//   … --prod [--apply]                                                # production

import "dotenv/config";
import { createClient } from "@libsql/client";
import { describeDbTarget, resolveDbTarget } from "../lib/db-target.ts";

const CUTOFF = "2026-08-05 08:24:00"; // last legacy (non-diff) availability log: 08:23:10
const apply = process.argv.includes("--apply");
const target = resolveDbTarget({ argv: process.argv, env: process.env, writes: apply });
console.log(describeDbTarget(target, apply ? "backfill vote headcounts (WRITE)" : "dry run"));
const db = createClient({ url: target.url, authToken: target.authToken });

type Rsvp = "yes" | "no" | null;
type Avail = "can" | "maybe" | null;
type Ev<T> = { at: string; state: T; prior: T | "unknown" };

const nightDay = (key: string) => key.replace(/_2$/, "");
const str = (v: unknown) => (v == null ? null : String(v));

const locks = (
  await db.execute(
    "SELECT date_key, private, seat_count FROM locked_dates WHERE unlocked_at IS NULL",
  )
).rows.map((r) => ({
  key: String(r.date_key),
  isPrivate: Number(r.private) === 1,
  seats: r.seat_count == null ? null : Number(r.seat_count),
}));

const votes = (
  await db.execute(
    `SELECT g.date_key, g.user_id, g.game_slug, g.reaction, g.created_at
       FROM game_requests g JOIN locked_dates l USING (date_key)
      WHERE l.unlocked_at IS NULL AND g.headcount IS NULL`,
  )
).rows.map((r) => ({
  key: String(r.date_key),
  user: String(r.user_id),
  slug: String(r.game_slug),
  reaction: String(r.reaction),
  at: String(r.created_at),
}));

const activity = (
  await db.execute(
    `SELECT user_id, type, meta_json, created_at FROM activity_log
      WHERE type IN ('rsvp', 'rsvp-kick', 'rsvp-cleared', 'night-guest', 'availability')
      ORDER BY created_at, id`,
  )
).rows.map((r) => ({
  user: String(r.user_id),
  type: String(r.type),
  meta: JSON.parse(String(r.meta_json ?? "{}")) as Record<string, unknown>,
  at: String(r.created_at),
}));

const rsvpRows = (await db.execute("SELECT date_key, user_id, status, rsvped_at FROM rsvps")).rows;
const availRows = (await db.execute("SELECT user_id, date_key, status FROM user_availability_days"))
  .rows;

// ── Timelines ─────────────────────────────────────────────────────────
const rsvpEv = new Map<string, Ev<Rsvp>[]>(); // `${night}|${user}`
const availEv = new Map<string, Ev<Avail>[]>(); // `${day}|${user}`
const push = <T>(m: Map<string, Ev<T>[]>, k: string, e: Ev<T>) => {
  const list = m.get(k) ?? [];
  list.push(e);
  m.set(k, list);
};
for (const a of activity) {
  const date = str(a.meta.date);
  if (a.type === "rsvp" && date) {
    const prev = str(a.meta.previous);
    push(rsvpEv, `${date}|${a.user}`, {
      at: a.at,
      state: a.meta.status === "no" ? "no" : "yes",
      prior: prev === "yes" || prev === "no" ? prev : null,
    });
  } else if (a.type === "rsvp-kick" && date) {
    push(rsvpEv, `${date}|${str(a.meta.targetUserId)}`, { at: a.at, state: "no", prior: "yes" });
  } else if (a.type === "night-guest" && date) {
    const on = a.meta.on !== false;
    push(rsvpEv, `${date}|${str(a.meta.targetUserId)}`, {
      at: a.at,
      state: on ? "yes" : null,
      prior: on ? null : "yes",
    });
  } else if (a.type === "rsvp-cleared" && date) {
    push(rsvpEv, `${date}|${a.user}`, { at: a.at, state: null, prior: "unknown" });
  } else if (a.type === "availability") {
    const added = (a.meta.added ?? {}) as Record<string, Avail>;
    const changed = (a.meta.changed ?? {}) as Record<string, Avail>;
    const removed = (a.meta.removed ?? []) as string[];
    for (const [day, s] of Object.entries(added)) {
      push(availEv, `${day}|${a.user}`, { at: a.at, state: s, prior: null });
    }
    for (const [day, s] of Object.entries(changed)) {
      push(availEv, `${day}|${a.user}`, {
        at: a.at,
        state: s,
        prior: s === "can" ? "maybe" : "can",
      });
    }
    for (const day of removed) {
      push(availEv, `${day}|${a.user}`, { at: a.at, state: null, prior: "unknown" });
    }
  }
}

const currentRsvp = new Map<string, { status: Rsvp; at: string }>();
for (const r of rsvpRows) {
  currentRsvp.set(`${r.date_key}|${r.user_id}`, {
    status: r.status === "no" ? "no" : "yes",
    at: String(r.rsvped_at),
  });
}
const currentAvail = new Map<string, Avail>();
for (const r of availRows) {
  currentAvail.set(`${r.date_key}|${r.user_id}`, r.status === "maybe" ? "maybe" : "can");
}

let guessedRemoved = 0;
const guessed = new Set<string>();

function stateAt<T>(
  events: Ev<T>[] | undefined,
  t: string,
  fallback: T,
  unknownGuess: T,
  key: string,
): T {
  if (!events || events.length === 0) return fallback;
  let last: Ev<T> | undefined;
  for (const e of events) if (e.at <= t) last = e;
  if (last) return last.state;
  const first = events[0] as Ev<T>;
  if (first.prior === "unknown") {
    if (!guessed.has(key)) {
      guessed.add(key);
      guessedRemoved += 1;
    }
    return unknownGuess;
  }
  return first.prior;
}

function headcountAt(night: string, t: string): number {
  const day = nightDay(night);
  const users = new Set<string>();
  for (const k of [...rsvpEv.keys(), ...currentRsvp.keys()]) {
    const [n, u] = k.split("|");
    if (n === night && u) users.add(u);
  }
  for (const k of [...availEv.keys(), ...currentAvail.keys()]) {
    const [d, u] = k.split("|");
    if (d === day && u) users.add(u);
  }
  let n = 0;
  for (const u of users) {
    const rk = `${night}|${u}`;
    const cur = currentRsvp.get(rk);
    // No logged change: the stored row, if it was already there at t.
    const rsvpFallback: Rsvp = cur && cur.at <= t ? cur.status : null;
    const rsvp = stateAt<Rsvp>(rsvpEv.get(rk), t, rsvpFallback, null, `r:${rk}`);
    const ak = `${day}|${u}`;
    const avail = stateAt<Avail>(
      availEv.get(ak),
      t,
      currentAvail.get(ak) ?? null,
      "can",
      `a:${ak}`,
    );
    if (rsvp === "no") continue;
    if (rsvp === "yes" || avail === "can") n += 1;
  }
  return n;
}

// ── Self-check: replaying to "now" must give today's live headcount ───
const FAR = "9999-12-31 23:59:59";
let mismatches = 0;
for (const l of locks.filter((x) => !x.isPrivate)) {
  const day = nightDay(l.key);
  const can = new Set<string>();
  for (const [k, s] of currentAvail)
    if (k.startsWith(`${day}|`) && s === "can") can.add(k.split("|")[1] ?? "");
  const yes = new Set<string>();
  const no = new Set<string>();
  for (const [k, r] of currentRsvp) {
    if (!k.startsWith(`${l.key}|`)) continue;
    (r.status === "yes" ? yes : no).add(k.split("|")[1] ?? "");
  }
  const live = new Set([...can, ...yes].filter((u) => !no.has(u))).size;
  const replay = headcountAt(l.key, FAR);
  if (live !== replay) {
    mismatches += 1;
    console.log(`  ✗ ${l.key}: live ${live} vs replay ${replay}`);
  }
}
console.log(
  `self-check: ${mismatches === 0 ? "✓ replay matches every live headcount" : `${mismatches} mismatch(es)`}`,
);
if (mismatches > 0 && apply) {
  console.log("refusing to write with a failing self-check");
  process.exit(1);
}

// ── Reconstruct ───────────────────────────────────────────────────────
const lockByKey = new Map(locks.map((l) => [l.key, l]));
const updates: { hc: number; v: (typeof votes)[number] }[] = [];
let skipped = 0;
for (const v of votes) {
  const l = lockByKey.get(v.key);
  if (!l) continue;
  if (v.at < CUTOFF) {
    skipped += 1;
    continue;
  }
  const hc = l.isPrivate ? Math.max(1, l.seats ?? 1) : headcountAt(v.key, v.at);
  updates.push({ hc, v });
}

// Per-night summary, newest first.
const byNight = new Map<string, Map<number, number>>();
for (const { hc, v } of updates) {
  const m = byNight.get(v.key) ?? new Map<number, number>();
  m.set(hc, (m.get(hc) ?? 0) + 1);
  byNight.set(v.key, m);
}
for (const key of [...byNight.keys()].sort().reverse()) {
  const l = lockByKey.get(key);
  const now = l?.isPrivate ? Math.max(1, l.seats ?? 1) : headcountAt(key, FAR);
  const dist = [...(byNight.get(key) ?? [])]
    .sort((a, b) => a[0] - b[0])
    .map(([hc, n]) => `${n}×@${hc}`)
    .join("  ");
  console.log(`${key}${l?.isPrivate ? " (private)" : ""}  now ${now}  ←  ${dist}`);
}
console.log(
  `\n${updates.length} votes reconstructed, ${skipped} before ${CUTOFF} left NULL, ` +
    `${guessedRemoved} person-days whose pre-log availability was guessed "can"`,
);

if (!apply) {
  console.log("dry run — nothing written (pass --apply)");
  process.exit(0);
}
const stmts = updates.map(({ hc, v }) => ({
  sql: `UPDATE game_requests SET headcount = ?
         WHERE date_key = ? AND user_id = ? AND game_slug = ? AND reaction = ? AND headcount IS NULL`,
  args: [hc, v.key, v.user, v.slug, v.reaction],
}));
for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200), "write");
const left = await db.execute(
  `SELECT COUNT(*) n FROM game_requests g JOIN locked_dates l USING (date_key)
    WHERE l.unlocked_at IS NULL AND g.headcount IS NOT NULL`,
);
console.log(`written: ${stmts.length} updates; votes with a headcount now: ${left.rows[0]?.n}`);
