// The journal end to end: real migrations, in-memory libsql, the 2-card
// fixture quiz bank; reviews recorded through the real write path.

import { fileURLToPath } from "node:url";
import { addDays } from "@boardgames/core/quiz/srs";
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

function read(articleId: string, readAt: string) {
  return client.execute({
    sql: "INSERT INTO quiz_wiki_read_log (user_id, article_id, read_at) VALUES (?, ?, ?)",
    args: [USER, articleId, readAt],
  });
}

const journal = (opts: { before?: string; days?: number; timeZone?: string } = {}) =>
  readJournal(client, store, USER, {
    days: 7,
    timeZone: "UTC",
    sources: ["quiztopia"],
    ...opts,
  });

describe("readJournal", () => {
  it("groups a day by article, in the order the day unfolded, keeping every grade", async () => {
    await grade("f00072", "good", YESTERDAY, "08:00");
    await grade("f00003", "again", YESTERDAY, "09:00");
    await grade("f00001", "good", YESTERDAY, "09:05");
    await grade("f00003", "good", YESTERDAY, "09:10");
    await grade("f00004", "again", YESTERDAY, "20:00", "game");
    await read("a0001", `${YESTERDAY}T09:30:00.000Z`);

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
    expect(day?.articles.map((s) => s.articleId)).toEqual(["a0015", "a0001"]);
    const brecht = day?.articles[1];
    expect(brecht?.readAt).toBe(`${YESTERDAY}T09:30:00.000Z`);
    expect(brecht?.titleEn.length).toBeGreaterThan(0);
    // Facts in article order; a miss then a hit keeps both grades.
    expect(brecht?.questions.map((q) => [q.questionId, q.grades, q.firstSeen, q.fromGame])).toEqual(
      [
        ["f00001", ["good"], true, false],
        ["f00003", ["again", "good"], true, false],
        ["f00004", ["again"], true, true],
      ],
    );
    expect(brecht?.questions[0]?.answerEn.length).toBeGreaterThan(0);
    expect(brecht?.questions.map((q) => q.printed)).toEqual([true, false, false]);
    expect(brecht?.domain).toBe("music-stage");
  });

  it("marks a question seen before as not new", async () => {
    await grade("f00001", "good", TWO_AGO, "10:00");
    await grade("f00001", "good", YESTERDAY, "10:00");
    const { days } = await journal();
    expect(days.map((d) => [d.date, d.articles[0]?.questions[0]?.firstSeen])).toEqual([
      [YESTERDAY, false],
      [TWO_AGO, true],
    ]);
  });

  it("shows a day with only a read", async () => {
    await read("a0024", `${TWO_AGO}T12:00:00.000Z`);
    const { days } = await journal();
    expect(days).toEqual([
      expect.objectContaining({
        date: TWO_AGO,
        reviewed: 0,
        articlesRead: 1,
        articles: [expect.objectContaining({ articleId: "a0024", questions: [] })],
      }),
    ]);
  });

  it("pages by active days", async () => {
    await grade("f00001", "good", TODAY, "10:00");
    await read("a0002", `${YESTERDAY}T10:00:00.000Z`);
    await grade("f00011", "good", addDays(TODAY, -5), "10:00");

    const first = await journal({ days: 2 });
    expect(first.days.map((d) => d.date)).toEqual([TODAY, YESTERDAY]);
    expect(first.nextBefore).toBe(YESTERDAY);

    const second = await journal({ days: 2, before: first.nextBefore ?? undefined });
    expect(second.days.map((d) => d.date)).toEqual([addDays(TODAY, -5)]);
    expect(second.nextBefore).toBeNull();
  });

  it("places a read on the member's own calendar day", async () => {
    // 22:30 UTC is already the next day in Vilnius (UTC+3).
    await read("a0001", `${TWO_AGO}T22:30:00.000Z`);
    expect((await journal({ timeZone: "UTC" })).days[0]?.date).toBe(TWO_AGO);
    expect((await journal({ timeZone: "Europe/Vilnius" })).days[0]?.date).toBe(YESTERDAY);
    // …and the `before` bound uses that day too.
    expect((await journal({ timeZone: "Europe/Vilnius", before: YESTERDAY })).days).toEqual([]);
  });

  it("drops content the store no longer knows", async () => {
    await client.execute({
      sql: `INSERT INTO trainer_reviews
              (user_id, deck, client_id, card_id, grade, prev_state, source, applied,
               reviewed_at, local_date)
            VALUES (?, 'quiz', 'gone-1', 'f05881', 'good', 'new', 'trainer', 1, ?, ?)`,
      args: [USER, `${YESTERDAY}T10:00:00.000Z`, YESTERDAY],
    });
    await read("a1177", `${YESTERDAY}T11:00:00.000Z`);
    expect((await journal()).days).toEqual([]);
  });

  it("refuses an unknown time zone", async () => {
    await expect(journal({ timeZone: "Mars/Olympus" })).rejects.toBeInstanceOf(
      InvalidTimeZoneError,
    );
  });
});
