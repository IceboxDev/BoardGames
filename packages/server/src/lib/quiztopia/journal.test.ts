// The journal end to end: real migrations, in-memory libsql, the 2-card
// fixture content store; reviews recorded through the real write path.

import { fileURLToPath } from "node:url";
import { addDays } from "@boardgames/core/games/quiztopia/srs";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrations/migrator.ts";
import { type ContentStore, loadContentStore } from "./content-store.ts";
import { InvalidTimeZoneError, readJournal } from "./journal.ts";
import { recordReview } from "./srs-db.ts";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/content/", import.meta.url));
const QUIET = { info() {}, warn() {} };
const USER = "member-1";
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = addDays(TODAY, -1);
const TWO_AGO = addDays(TODAY, -2);

let client: Client;
let store: ContentStore;
let seq = 0;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  await runMigrations(client, { logger: QUIET });
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
    args: [USER, USER, `${USER}@example.com`],
  });
  store = loadContentStore(FIXTURE_DIR);
});

afterEach(() => {
  client.close();
});

function grade(
  questionId: string,
  g: "again" | "good",
  localDate: string,
  time: string,
  source: "trainer" | "game" = "trainer",
) {
  seq++;
  return recordReview(
    client,
    USER,
    {
      clientId: `client-${String(seq).padStart(6, "0")}`,
      questionId,
      grade: g,
      localDate,
      reviewedAt: `${localDate}T${time}:00.000Z`,
      source,
    },
    store,
  );
}

function read(setId: string, readAt: string) {
  return client.execute({
    sql: "INSERT INTO quiztopia_wiki_read_log (user_id, set_id, read_at) VALUES (?, ?, ?)",
    args: [USER, setId, readAt],
  });
}

const journal = (opts: { before?: string; days?: number; timeZone?: string } = {}) =>
  readJournal(client, store, USER, { days: 7, timeZone: "UTC", ...opts });

describe("readJournal", () => {
  it("groups a day by article, in the order the day unfolded, keeping every grade", async () => {
    await grade("c002-s03-q1", "good", YESTERDAY, "08:00");
    await grade("c001-s01-q2", "again", YESTERDAY, "09:00");
    await grade("c001-s01-q0", "good", YESTERDAY, "09:05");
    await grade("c001-s01-q2", "good", YESTERDAY, "09:10");
    await grade("c001-s01-q3", "again", YESTERDAY, "20:00", "game");
    await read("c001-s01", `${YESTERDAY}T09:30:00.000Z`);

    const { days, nextBefore } = await journal();
    expect(nextBefore).toBeNull();
    expect(days).toHaveLength(1);
    const [day] = days;
    expect(day).toMatchObject({
      date: YESTERDAY,
      reviewed: 5,
      knew: 3,
      newQuestions: 4,
      articlesRead: 1,
    });
    expect(day?.sets.map((s) => s.setId)).toEqual(["c002-s03", "c001-s01"]);
    const brecht = day?.sets[1];
    expect(brecht?.readAt).toBe(`${YESTERDAY}T09:30:00.000Z`);
    expect(brecht?.titleEn.length).toBeGreaterThan(0);
    // Questions in card order; a miss then a hit keeps both grades.
    expect(brecht?.questions.map((q) => [q.questionId, q.grades, q.firstSeen, q.fromGame])).toEqual(
      [
        ["c001-s01-q0", ["good"], true, false],
        ["c001-s01-q2", ["again", "good"], true, false],
        ["c001-s01-q3", ["again"], true, true],
      ],
    );
    expect(brecht?.questions[0]?.answerEn.length).toBeGreaterThan(0);
  });

  it("marks a question seen before as not new", async () => {
    await grade("c001-s01-q0", "good", TWO_AGO, "10:00");
    await grade("c001-s01-q0", "good", YESTERDAY, "10:00");
    const { days } = await journal();
    expect(days.map((d) => [d.date, d.sets[0]?.questions[0]?.firstSeen])).toEqual([
      [YESTERDAY, false],
      [TWO_AGO, true],
    ]);
  });

  it("shows a day with only a read", async () => {
    await read("c002-s12", `${TWO_AGO}T12:00:00.000Z`);
    const { days } = await journal();
    expect(days).toEqual([
      expect.objectContaining({
        date: TWO_AGO,
        reviewed: 0,
        articlesRead: 1,
        sets: [expect.objectContaining({ setId: "c002-s12", questions: [] })],
      }),
    ]);
  });

  it("pages by active days", async () => {
    await grade("c001-s01-q0", "good", TODAY, "10:00");
    await read("c001-s02", `${YESTERDAY}T10:00:00.000Z`);
    await grade("c001-s03-q0", "good", addDays(TODAY, -5), "10:00");

    const first = await journal({ days: 2 });
    expect(first.days.map((d) => d.date)).toEqual([TODAY, YESTERDAY]);
    expect(first.nextBefore).toBe(YESTERDAY);

    const second = await journal({ days: 2, before: first.nextBefore ?? undefined });
    expect(second.days.map((d) => d.date)).toEqual([addDays(TODAY, -5)]);
    expect(second.nextBefore).toBeNull();
  });

  it("places a read on the member's own calendar day", async () => {
    // 22:30 UTC is already the next day in Vilnius (UTC+3).
    await read("c001-s01", `${TWO_AGO}T22:30:00.000Z`);
    expect((await journal({ timeZone: "UTC" })).days[0]?.date).toBe(TWO_AGO);
    expect((await journal({ timeZone: "Europe/Vilnius" })).days[0]?.date).toBe(YESTERDAY);
    // …and the `before` bound uses that day too.
    expect((await journal({ timeZone: "Europe/Vilnius", before: YESTERDAY })).days).toEqual([]);
  });

  it("drops content the store no longer knows", async () => {
    await client.execute({
      sql: `INSERT INTO quiztopia_reviews
              (user_id, client_id, question_id, category, grade, prev_state, source, applied,
               reviewed_at, local_date)
            VALUES (?, 'gone-1', 'c099-s01-q0', 1, 'good', 'new', 'trainer', 1, ?, ?)`,
      args: [USER, `${YESTERDAY}T10:00:00.000Z`, YESTERDAY],
    });
    await read("c099-s01", `${YESTERDAY}T11:00:00.000Z`);
    expect((await journal()).days).toEqual([]);
  });

  it("refuses an unknown time zone", async () => {
    await expect(journal({ timeZone: "Mars/Olympus" })).rejects.toBeInstanceOf(
      InvalidTimeZoneError,
    );
  });
});
