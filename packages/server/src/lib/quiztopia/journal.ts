// The member's journal: what they studied and read, day by day, newest day
// first — the archive's way back to a question learned yesterday.
//
// A day is a calendar day as the member lived it. Reviews already carry the
// client's `local_date`; reads carry a timestamp, so they are placed with
// the caller's IANA time zone. Pages are counted in ACTIVE days (a review or
// a read), so a week off never costs an empty page.
//
// Within a day the entries are grouped by article (set), in the order the
// day unfolded; each question keeps every grade it got that day, in order.
// Question and title text comes from the content store, so the client needs
// no content chunks to render the list. Ids the content no longer knows are
// dropped.

import { parseSetId } from "@boardgames/core/games/quiztopia/ids";
import type { Journal, JournalDay, JournalQuestion, JournalSet } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "../db-rows.ts";
import type { ContentStore } from "./content-store.ts";

export class InvalidTimeZoneError extends Error {
  constructor(timeZone: string) {
    super(`unknown time zone ${timeZone}`);
    this.name = "InvalidTimeZoneError";
  }
}

export interface JournalOptions {
  /** Exclusive upper bound (a local date key); omitted = everything. */
  before?: string;
  /** Active days per page. */
  days: number;
  /** The caller's IANA zone, for placing reads on their calendar day. */
  timeZone: string;
}

/** Latest offset any zone sits ahead of UTC (Kiribati, +14 h). */
const MAX_ZONE_AHEAD_MS = 14 * 3_600_000;

function dateKeyFormatter(timeZone: string): (iso: string) => string {
  let format: Intl.DateTimeFormat;
  try {
    // en-CA formats as YYYY-MM-DD — exactly the date-key convention.
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new InvalidTimeZoneError(timeZone);
  }
  return (iso) => format.format(new Date(iso));
}

const DateRowSchema = z.object({ local_date: z.string() });
const ReadRowSchema = z.object({ set_id: z.string(), read_at: z.string() });
const ReviewRowSchema = z.object({
  id: z.number().int(),
  question_id: z.string(),
  grade: z.enum(["again", "good"]),
  prev_state: z.string(),
  source: z.string(),
  local_date: z.string(),
  reviewed_at: z.string(),
});

export async function readJournal(
  db: Client,
  store: ContentStore,
  userId: string,
  opts: JournalOptions,
): Promise<Journal> {
  const localDay = dateKeyFormatter(opts.timeZone);
  const { before, days } = opts;

  // One more than a page from each source tells whether anything older exists.
  const reviewDates = parseRows(
    DateRowSchema,
    (
      await db.execute({
        sql: `SELECT DISTINCT local_date FROM quiztopia_reviews
               WHERE user_id = ? ${before ? "AND local_date < ?" : ""}
               ORDER BY local_date DESC LIMIT ?`,
        args: before ? [userId, before, days + 1] : [userId, days + 1],
      })
    ).rows,
    "quiztopia_reviews.journal-dates",
  ).map((r) => r.local_date);

  // Reads before the bound in ANY zone: the local filter below is exact.
  const readBound = before ? new Date(Date.parse(before) + MAX_ZONE_AHEAD_MS).toISOString() : null;
  const reads = parseRows(
    ReadRowSchema,
    (
      await db.execute({
        sql: `SELECT set_id, read_at FROM quiztopia_wiki_read_log
               WHERE user_id = ? ${readBound ? "AND read_at < ?" : ""}
               ORDER BY read_at DESC`,
        args: readBound ? [userId, readBound] : [userId],
      })
    ).rows,
    "quiztopia_wiki_read_log.journal",
  )
    .map((r) => ({ setId: r.set_id, readAt: r.read_at, date: localDay(r.read_at) }))
    .filter((r) => !before || r.date < before);

  const active = [...new Set([...reviewDates, ...reads.map((r) => r.date)])].sort().reverse();
  const chosen = active.slice(0, days);
  if (chosen.length === 0) return { days: [], nextBefore: null };
  const chosenSet = new Set(chosen);
  const oldest = chosen[chosen.length - 1] as string;

  const reviews = parseRows(
    ReviewRowSchema,
    (
      await db.execute({
        sql: `SELECT id, question_id, grade, prev_state, source, local_date, reviewed_at
                FROM quiztopia_reviews
               WHERE user_id = ? AND local_date IN (${chosen.map(() => "?").join(", ")})
               ORDER BY id`,
        args: [userId, ...chosen],
      })
    ).rows,
    "quiztopia_reviews.journal",
  );

  const builders = new Map(chosen.map((date) => [date, new DayBuilder(date)]));
  for (const r of reviews) {
    const question = store.getQuestion(r.question_id);
    if (!question) continue;
    builders.get(r.local_date)?.review(store, question, r);
  }
  for (const r of reads) {
    if (chosenSet.has(r.date)) builders.get(r.date)?.read(store, r.setId, r.readAt);
  }

  return {
    days: chosen
      .map((date) => (builders.get(date) as DayBuilder).build())
      .filter((d) => d.sets.length > 0),
    nextBefore: active.length > days ? oldest : null,
  };
}

type StoredQuestion = NonNullable<ReturnType<ContentStore["getQuestion"]>>;

interface SetEntry {
  set: Omit<JournalSet, "questions">;
  /** Earliest event of the day for this article — the day's order. */
  firstAt: string;
  questions: Map<string, JournalQuestion>;
}

class DayBuilder {
  private readonly sets = new Map<string, SetEntry>();
  private reviewed = 0;
  private knew = 0;
  private newQuestions = 0;

  constructor(private readonly date: string) {}

  private entry(store: ContentStore, setId: string, at: string): SetEntry | null {
    const existing = this.sets.get(setId);
    if (existing) {
      if (at < existing.firstAt) existing.firstAt = at;
      return existing;
    }
    const titles = store.getTitles(setId);
    const parsed = parseSetId(setId);
    if (!titles || !parsed) return null;
    const created: SetEntry = {
      set: { setId, category: parsed.n, titleEn: titles[0], titleDe: titles[1], readAt: null },
      firstAt: at,
      questions: new Map(),
    };
    this.sets.set(setId, created);
    return created;
  }

  review(
    store: ContentStore,
    q: StoredQuestion,
    r: { grade: "again" | "good"; prev_state: string; source: string; reviewed_at: string },
  ): void {
    const entry = this.entry(store, q.setId, r.reviewed_at);
    if (!entry) return;
    this.reviewed++;
    if (r.grade === "good") this.knew++;
    const firstSeen = r.prev_state === "new";
    const existing = entry.questions.get(q.id);
    if (existing) {
      existing.grades.push(r.grade);
      if (firstSeen && !existing.firstSeen) {
        existing.firstSeen = true;
        this.newQuestions++;
      }
      existing.fromGame ||= r.source === "game";
      return;
    }
    if (firstSeen) this.newQuestions++;
    entry.questions.set(q.id, {
      questionId: q.id,
      q: q.q,
      en: q.en,
      de: q.de,
      answerEn: q.answerEn,
      answerDe: q.answerDe,
      grades: [r.grade],
      firstSeen,
      fromGame: r.source === "game",
    });
  }

  read(store: ContentStore, setId: string, readAt: string): void {
    const entry = this.entry(store, setId, readAt);
    if (!entry) return;
    if (!entry.set.readAt || readAt > entry.set.readAt) entry.set.readAt = readAt;
  }

  build(): JournalDay {
    const sets = [...this.sets.values()]
      .sort((a, b) => a.firstAt.localeCompare(b.firstAt))
      .map((e) => ({
        ...e.set,
        questions: [...e.questions.values()].sort((a, b) => a.q - b.q),
      }));
    return {
      date: this.date,
      reviewed: this.reviewed,
      knew: this.knew,
      newQuestions: this.newQuestions,
      articlesRead: sets.filter((s) => s.readAt !== null).length,
      sets,
    };
  }
}
