// The trainer API end to end: real migration chain, in-memory libsql, the
// real routes behind an auth stub, and the fixture quiz bank (the first two
// Quiztopia cards: 24 articles of 5 facts).
// Dates are computed from the real UTC day because the review window is
// anchored on the server's clock.

import { fileURLToPath } from "node:url";
import type {
  ArticleHistoryResponse,
  Journal,
  MyReport,
  MyReports,
  RecentMisses,
  ReviewBody,
  ReviewResponse,
  SearchResponse,
  TimelinePins,
  TrainerHistory,
  TrainerOverview,
  TrainerQueue,
  TrainerReset,
  WikiReads,
} from "@boardgames/core/protocol";
import { addDays } from "@boardgames/core/quiz/srs";
import { DOMAIN_COUNT } from "@boardgames/core/quiz/taxonomy";
import { type Client, createClient, type InStatement } from "@libsql/client";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { FIXTURE_HISTORY, makeRetiredBank } from "../lib/quiz/__fixtures__/retired-bank.ts";
import { __setContentStore, getContentStore, loadContentStore } from "../lib/quiz/content-store.ts";
import { recordReview } from "../lib/quiz/srs-db.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { quizRoutes } = await import("./quiz.ts");

const FIXTURE_DIR = fileURLToPath(new URL("../lib/quiz/__fixtures__/content/", import.meta.url));
const USER = "member-1";
const OTHER = "member-2";
const QUIET = { info() {}, warn() {} };

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);

function app(viewerId = USER) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: viewerId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/trainers/quiz", quizRoutes);
  return a;
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  viewerId = USER,
): Promise<{ status: number; body: T }> {
  const res = await app(viewerId).request(`/api/trainers/quiz${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

let seq = 0;
function review(overrides: Partial<ReviewBody> = {}): ReviewBody {
  seq++;
  return {
    clientId: `client-${String(seq).padStart(6, "0")}`,
    questionId: "f00001",
    grade: "good",
    localDate: TODAY,
    ...overrides,
  };
}

function post(body: ReviewBody, viewerId = USER) {
  return call<ReviewResponse>("POST", "/trainer/reviews", body, viewerId);
}

/** A table-game answer, recorded the way the server does it at game over. */
function recordGame(
  fields: {
    questionId: string;
    grade: "good" | "again";
    roomCode: string;
    clientId?: string;
    localDate?: string;
  },
  viewerId = USER,
) {
  seq++;
  const client = db.current;
  if (!client) throw new Error("no db");
  return recordReview(
    client,
    viewerId,
    {
      clientId: fields.clientId ?? `game:test-session:${seq}`,
      questionId: fields.questionId,
      grade: fields.grade,
      localDate: fields.localDate ?? TODAY,
      source: "game",
      roomCode: fields.roomCode,
    },
    getContentStore(),
  );
}

async function seedState(
  client: Client,
  questionId: string,
  fields: {
    state: string;
    intervalDays?: number;
    dueDate: string;
    lastReviewedAt?: string;
    lapses?: number;
    reps?: number;
  },
) {
  await client.execute({
    sql: `INSERT INTO trainer_srs
            (user_id, deck, card_id, state, ease, interval_days, due_date, reps, lapses,
             last_reviewed_at)
          VALUES (?, 'quiz', ?, ?, 2.5, ?, ?, ?, ?, ?)`,
    args: [
      USER,
      questionId,
      fields.state,
      fields.intervalDays ?? 0,
      fields.dueDate,
      fields.reps ?? 3,
      fields.lapses ?? 0,
      fields.lastReviewedAt ?? "2026-01-01T10:00:00.000Z",
    ],
  });
}

async function seedReview(
  client: Client,
  fields: {
    questionId: string;
    grade: string;
    prevState: string;
    localDate: string;
    source?: string;
    applied?: number;
    reviewedAt?: string;
    roomCode?: string | null;
  },
) {
  seq++;
  await client.execute({
    sql: `INSERT INTO trainer_reviews
            (user_id, deck, client_id, card_id, grade, prev_state, source, applied,
             reviewed_at, local_date, outcome_json)
          VALUES (?, 'quiz', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      USER,
      `seed-${seq}`,
      fields.questionId,
      fields.grade,
      fields.prevState,
      fields.source ?? "trainer",
      fields.applied ?? 1,
      fields.reviewedAt ?? new Date().toISOString(),
      fields.localDate,
      fields.roomCode ? JSON.stringify({ roomCode: fields.roomCode }) : "{}",
    ],
  });
}

async function count(client: Client, sql: string, args: (string | number)[] = []) {
  const { rows } = await client.execute({ sql, args });
  return Number(rows[0]?.n);
}

describe("/api/trainers/quiz", () => {
  let client: Client;

  beforeAll(() => {
    __setContentStore(loadContentStore(FIXTURE_DIR));
  });

  afterAll(() => {
    __setContentStore(null);
  });

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const id of [USER, OTHER]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
        args: [id, id, `${id}@example.com`],
      });
    }
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  describe("POST /trainer/reviews", () => {
    it("grades a new question and returns its state with 201", async () => {
      const { status, body } = await post(review());
      expect(status).toBe(201);
      expect(body).toMatchObject({ ok: true, existed: false, applied: true });
      expect(body.state).toMatchObject({
        questionId: "f00001",
        state: "learning",
        intervalDays: 1,
        dueDate: TOMORROW,
        reps: 1,
        lapses: 0,
        leech: false,
      });
      const states = await call<{ states: { questionId: string; reps: number }[] }>(
        "GET",
        "/trainer/states?ids=f00001,f00002",
      );
      expect(states.status).toBe(200);
      expect(states.body.states).toEqual([
        expect.objectContaining({ questionId: "f00001", reps: 1 }),
      ]);
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_reviews")).toBe(1);
    });

    it("replays an already logged clientId with 200 and no second application", async () => {
      const body = review();
      const first = await post(body);
      expect(first.status).toBe(201);
      const again = await post(body);
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ ok: true, existed: true, applied: true });
      expect(again.body.state?.reps).toBe(1);
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_reviews")).toBe(1);
      expect(await count(client, "SELECT reps n FROM trainer_srs WHERE card_id = 'f00001'")).toBe(
        1,
      );
    });

    it("logs a stale offline grade with applied = 0 and leaves the state alone", async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 3_600_000);
      const fresh = await post(review({ grade: "good", reviewedAt: now.toISOString() }));
      expect(fresh.body.state?.state).toBe("learning");
      const stale = await post(review({ grade: "again", reviewedAt: earlier.toISOString() }));
      expect(stale.status).toBe(201);
      expect(stale.body).toMatchObject({ existed: false, applied: false });
      expect(stale.body.state).toMatchObject({ state: "learning", reps: 1 });
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_reviews WHERE applied = 0")).toBe(
        1,
      );
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_reviews")).toBe(2);
    });

    // Two grades of one card in flight at once (the held-back grade sent as
    // the tab closes, the next one straight after): the newer lands while the
    // older is between reading the state and writing it. The older must not
    // be applied on top — production lost a member's final "good" this way.
    it("does not apply an older grade that loses the write race to a newer one", async () => {
      const store = getContentStore();
      const now = Date.now();
      const base = { questionId: "f00001", localDate: TODAY, source: "trainer" as const };
      const first = new Date(now - 30_000).toISOString();
      await recordReview(
        client,
        USER,
        { ...base, clientId: "first", grade: "again", reviewedAt: first },
        store,
      );
      const older = {
        ...base,
        clientId: "older",
        grade: "again" as const,
        reviewedAt: new Date(now - 4_000).toISOString(),
      };
      const newer = {
        ...base,
        clientId: "newer",
        grade: "good" as const,
        reviewedAt: new Date(now).toISOString(),
      };
      // Let the newer grade land at the moment the older one logs itself —
      // after its ordering check, before its state write.
      let interleaved = false;
      const racing = new Proxy(client, {
        get(target, key) {
          if (key === "execute") {
            return async (stmt: InStatement) => {
              const sql = typeof stmt === "string" ? stmt : stmt.sql;
              if (!interleaved && sql.includes("INSERT OR IGNORE INTO trainer_reviews")) {
                interleaved = true;
                await recordReview(client, USER, newer, store);
              }
              return target.execute(stmt);
            };
          }
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      const res = await recordReview(racing, USER, older, store);
      expect(interleaved).toBe(true);
      expect(res).toMatchObject({ existed: false, applied: false });
      const { rows } = await client.execute(
        "SELECT client_id, applied FROM trainer_reviews ORDER BY client_id",
      );
      expect(rows.map((r) => [r.client_id, r.applied])).toEqual([
        ["first", 1],
        ["newer", 1],
        ["older", 0],
      ]);
      const { rows: state } = await client.execute(
        "SELECT last_reviewed_at FROM trainer_srs WHERE card_id = 'f00001'",
      );
      expect(state[0]?.last_reviewed_at).toBe(newer.reviewedAt);
    });

    it("keeps game answers out of the schedule until the member opts in", async () => {
      const off = await recordGame({
        questionId: "f00011",
        grade: "again",
        roomCode: "ABCD",
        clientId: "game:ABCD:3",
      });
      expect(off).toMatchObject({ existed: false, applied: false, state: null });
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_srs")).toBe(0);

      const put = await call("PUT", "/settings", { language: "en", gameReviewsAffectSrs: true });
      expect(put.status).toBe(200);

      const on = await recordGame({
        questionId: "f00012",
        grade: "good",
        roomCode: "ABCD",
        clientId: "game:ABCD:4",
      });
      expect(on).toMatchObject({ applied: true });
      expect(on.state).toMatchObject({ questionId: "f00012", state: "learning" });

      // Game reviews never count as a study day.
      const overview = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(overview.body.streak).toEqual({ current: 0, longest: 0, studiedToday: false });
      expect(overview.body.todayCounts.reviews).toBe(0);
    });

    it("refuses a client-sent table-game review (the server records those itself)", async () => {
      const res = await call("POST", "/trainer/reviews", {
        ...review({ questionId: "f00001" }),
        source: "game",
        roomCode: "ABCD",
      });
      expect(res.status).toBe(400);
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_reviews")).toBe(0);
    });

    it("rejects an unknown question with 404 and an out-of-window date with 400", async () => {
      const unknown = await post(review({ questionId: "f00481" }));
      expect(unknown.status).toBe(404);
      const malformed = await post(review({ questionId: "c001-s01-q0" }));
      expect(malformed.status).toBe(400);
      const old = await post(review({ localDate: addDays(TODAY, -40) }));
      expect(old.status).toBe(400);
      const future = await post(review({ localDate: addDays(TODAY, 2) }));
      expect(future.status).toBe(400);
      const edge = await post(review({ localDate: addDays(TODAY, -30) }));
      expect(edge.status).toBe(201);
      const tomorrow = await post(review({ questionId: "f00002", localDate: TOMORROW }));
      expect(tomorrow.status).toBe(201);
    });

    it("logs the first trainer review of a local date as activity, once", async () => {
      await post(review());
      await post(review({ questionId: "f00002" }));
      await post(review({ questionId: "f00003", localDate: YESTERDAY }));
      await vi.waitFor(async () => {
        expect(
          await count(client, "SELECT COUNT(*) n FROM activity_log WHERE type = 'quiz-train'"),
        ).toBe(2);
      });
    });

    it("scopes state to the member", async () => {
      await post(review());
      const other = await call<{ states: unknown[] }>(
        "GET",
        "/trainer/states?ids=f00001",
        undefined,
        OTHER,
      );
      expect(other.body.states).toEqual([]);
    });
  });

  describe("POST /trainer/reviews/bulk", () => {
    it("applies new grades, skips replays and unknown questions", async () => {
      const existing = review();
      await post(existing);
      const res = await call<{
        applied: number;
        skipped: number;
        states: { questionId: string }[];
      }>("POST", "/trainer/reviews/bulk", {
        reviews: [
          review({ questionId: "f00006" }),
          existing,
          review({ questionId: "f00481" }),
          review({ questionId: "f00007", localDate: addDays(TODAY, -40) }),
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ applied: 1, skipped: 3 });
      expect(res.body.states.map((s) => s.questionId).sort()).toEqual(["f00001", "f00006"]);
      expect(await count(client, "SELECT COUNT(*) n FROM trainer_reviews")).toBe(2);
    });
  });

  describe("GET /trainer/queue", () => {
    // Music & Stage holds two fixture articles: a0001 (f00001–f00005) and
    // a0013 (f00061–f00065).
    const MUSIC = "domain=music-stage";
    const factsOf = (article: string) => getContentStore().getArticleMeta(article)?.factIds ?? [];

    it("deals due learning and review cards plus the begun articles' leftovers", async () => {
      await seedState(client, "f00004", {
        state: "learning",
        dueDate: TODAY,
        lastReviewedAt: "2026-01-01T10:00:00.000Z",
      });
      await seedState(client, "f00065", {
        state: "relearning",
        dueDate: TODAY,
        lastReviewedAt: "2026-01-01T09:00:00.000Z",
      });
      await seedState(client, "f00063", { state: "review", intervalDays: 8, dueDate: YESTERDAY });
      await seedState(client, "f00001", { state: "review", intervalDays: 8, dueDate: TOMORROW });
      // Another domain's due card stays out of a domain session.
      await seedState(client, "f00006", { state: "review", intervalDays: 8, dueDate: YESTERDAY });

      const { status, body } = await call<TrainerQueue>(
        "GET",
        `/trainer/queue?today=${TODAY}&${MUSIC}&limit=60`,
      );
      expect(status).toBe(200);
      expect(body.today).toBe(TODAY);
      expect(body.counts).toEqual({ learning: 2, review: 1, new: 6 });
      const byTier = (tier: string) =>
        body.items
          .filter((it) => it.tier === tier)
          .map((it) => it.questionId)
          .sort();
      expect(byTier("learning")).toEqual(["f00004", "f00065"]);
      expect(byTier("review")).toEqual(["f00063"]);
      // Both articles are begun: their unseen facts are leftovers, budget aside.
      expect(byTier("new")).toEqual(["f00002", "f00003", "f00005", "f00061", "f00062", "f00064"]);
      const relearning = body.items.find((it) => it.questionId === "f00065");
      expect(relearning).toMatchObject({ articleId: "a0013", domain: "music-stage" });
      expect(relearning?.state).toMatchObject({ state: "relearning", reps: 3 });
      for (const it of body.items.filter((i) => i.tier === "new")) {
        expect(it.state).toBeNull();
        expect(it.articleStarted).toBe(true);
      }
    });

    // A sitting that ended with one fact of an article unanswered: the next
    // day deals that leftover without re-reading the whole article.
    it("flags a new fact whose article was already begun", async () => {
      for (const id of ["f00001", "f00002", "f00003", "f00004"]) {
        await seedState(client, id, { state: "review", intervalDays: 4, dueDate: TOMORROW });
      }
      const { body } = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&${MUSIC}`);
      const fresh = body.items.filter((it) => it.tier === "new");
      expect(fresh.find((it) => it.questionId === "f00005")).toMatchObject({
        articleStarted: true,
      });
      const untouched = fresh.filter((it) => it.articleId !== "a0001");
      expect(untouched.map((it) => it.questionId).sort()).toEqual(factsOf("a0013"));
      for (const it of untouched) expect(it.articleStarted).toBe(false);
    });

    it("finishes begun articles on top of the day's fact budget", async () => {
      await call("PUT", "/settings", { language: "en", newFactsPerDay: 5 });
      for (const id of ["f00001", "f00002", "f00003", "f00004"]) {
        await seedState(client, id, { state: "review", intervalDays: 4, dueDate: TOMORROW });
        await seedReview(client, {
          questionId: id,
          grade: "good",
          prevState: "new",
          localDate: YESTERDAY,
        });
      }
      const before = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&${MUSIC}`);
      const news = before.body.items.filter((it) => it.tier === "new").map((it) => it.questionId);
      // Yesterday's leftover plus the one new article the budget allows.
      expect(news.sort()).toEqual(["f00005", ...factsOf("a0013")]);
      const ov = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(ov.body).toMatchObject({ newRemainingToday: 5, leftoverToday: 1 });

      // Every fact introduced today counts against the budget.
      await post(review({ questionId: "f00005", grade: "good" }));
      expect(
        (await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`)).body,
      ).toMatchObject({ newRemainingToday: 4, leftoverToday: 0 });
      await post(review({ questionId: "f00061", grade: "good" }));
      expect(
        (await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`)).body,
      ).toMatchObject({ newRemainingToday: 3, leftoverToday: 4 });
      // The begun article's remaining facts still come.
      const after = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&${MUSIC}`);
      expect(
        after.body.items
          .filter((it) => it.tier === "new")
          .map((it) => it.questionId)
          .sort(),
      ).toEqual(["f00062", "f00063", "f00064", "f00065"]);
    });

    it("budgets new facts by today's applied trainer introductions only", async () => {
      await call("PUT", "/settings", { language: "en", newFactsPerDay: 5 });
      const first = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      // Five facts a day = one whole article.
      expect(first.body.counts).toEqual({ learning: 0, review: 0, new: 5 });
      const opened = first.body.items[0]?.articleId ?? "";
      expect(new Set(first.body.items.map((it) => it.articleId))).toEqual(new Set([opened]));
      const [knew, missed, ...rest] = factsOf(opened);
      expect(first.body.doneToday).toBe(0);

      await post(review({ questionId: knew, grade: "good" }));
      await post(review({ questionId: missed, grade: "again" }));
      const elsewhere = getContentStore().articles.find((a) => a.id !== opened)?.factIds ?? [];
      // A game answer without the opt-in is logged applied = 0: not an introduction.
      await recordGame({ questionId: elsewhere[0], grade: "again", roomCode: "R1" });
      // Yesterday's introductions do not eat into today's budget.
      await seedReview(client, {
        questionId: elsewhere[1],
        grade: "good",
        prevState: "new",
        localDate: YESTERDAY,
      });

      const second = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      const fresh = second.body.items.filter((it) => it.tier === "new");
      // The opened article's three leftovers, then — two of five spent — the
      // first article that fits nothing is still taken whole (5).
      expect(second.body.counts).toEqual({ learning: 1, review: 0, new: 8 });
      expect(second.body.items.find((it) => it.tier === "learning")?.questionId).toBe(missed);
      expect(
        fresh
          .filter((it) => it.articleId === opened)
          .map((it) => it.questionId)
          .sort(),
      ).toEqual([...rest].sort());
      // The day's progress so far: the known fact is done; the missed one is
      // still queued and the game answer isn't study.
      expect(second.body.doneToday).toBe(1);

      const overview = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(overview.body.newRemainingToday).toBe(3);
      expect(overview.body.todayCounts).toEqual({
        reviews: 2,
        good: 1,
        again: 1,
        newIntroduced: 2,
      });
    });

    it("keeps the day's order stable across requests", async () => {
      await seedState(client, "f00006", { state: "review", intervalDays: 3, dueDate: YESTERDAY });
      const first = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      const again = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      expect(again.body.items.map((it) => it.questionId)).toEqual(
        first.body.items.map((it) => it.questionId),
      );
      // Study all: a0002's four leftovers on top of the default 15 (three articles).
      const fresh = first.body.items.filter((it) => it.tier === "new");
      expect(fresh).toHaveLength(19);
      expect(new Set(fresh.map((it) => it.articleId)).size).toBe(4);
      expect(first.body.items.some((it) => it.questionId === "f00006")).toBe(true);
      const limited = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=2`);
      expect(limited.body.items).toHaveLength(2);
    });

    it("leaves the domains excluded from Study all out of it", async () => {
      await call("PUT", "/settings", {
        language: "en",
        excludeFromAll: ["music-stage", "literature"],
      });
      await seedState(client, "f00001", { state: "review", intervalDays: 3, dueDate: YESTERDAY });
      await seedState(client, "f00011", { state: "review", intervalDays: 3, dueDate: YESTERDAY });
      const all = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      expect(
        all.body.items.some((it) => it.domain === "music-stage" || it.domain === "literature"),
      ).toBe(false);
      // Art's begun article is finished on top of the day's three new ones.
      expect(all.body.items.some((it) => it.questionId === "f00011")).toBe(true);
      expect(new Set(all.body.items.map((it) => it.articleId)).size).toBe(4);
      const own = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&${MUSIC}`);
      expect(own.body.items.some((it) => it.questionId === "f00001")).toBe(true);
      const settings = await call<{ excludeFromAll: string[] }>("GET", "/settings");
      expect(settings.body.excludeFromAll).toEqual(["music-stage", "literature"]);
    });

    it("studies only articles one of the member's sources prints", async () => {
      await call("PUT", "/settings", { language: "en", sources: ["trivial-pursuit"] });
      await seedState(client, "f00001", { state: "review", intervalDays: 3, dueDate: YESTERDAY });
      const { body } = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      expect(body.items).toEqual([]);
      const ov = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(ov.body.domains.every((d) => d.total === 0)).toBe(true);
      expect(ov.body.newRemainingToday).toBe(0);
    });

    it("hides leeches unless asked for them", async () => {
      await seedState(client, "f00001", {
        state: "review",
        intervalDays: 3,
        dueDate: YESTERDAY,
        lapses: 8,
      });
      const hidden = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&${MUSIC}`);
      expect(hidden.body.items.some((it) => it.questionId === "f00001")).toBe(false);
      const shown = await call<TrainerQueue>(
        "GET",
        `/trainer/queue?today=${TODAY}&${MUSIC}&includeLeeches=true`,
      );
      const leech = shown.body.items.find((it) => it.questionId === "f00001");
      expect(leech).toMatchObject({ tier: "review" });
      expect(leech?.state?.leech).toBe(true);
    });

    it("validates its query", async () => {
      expect((await call("GET", "/trainer/queue")).status).toBe(400);
      expect((await call("GET", `/trainer/queue?today=${TODAY}&domain=nope`)).status).toBe(400);
    });
  });

  describe("GET /trainer/overview", () => {
    it("computes streak and today's counts against the client's day", async () => {
      await post(review({ questionId: "f00001", grade: "good", localDate: YESTERDAY }));
      await post(review({ questionId: "f00002", grade: "again", localDate: YESTERDAY }));

      const today = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(today.status).toBe(200);
      expect(today.body.contentVersion).toMatch(/^[0-9a-f]{12}$/);
      expect(today.body.today).toBe(TODAY);
      expect(today.body.streak).toEqual({ current: 1, longest: 1, studiedToday: false });
      expect(today.body.todayCounts).toEqual({ reviews: 0, good: 0, again: 0, newIntroduced: 0 });
      // The begun article's three unseen facts are left to finish, on top of
      // the default budget of 15 new facts.
      expect(today.body).toMatchObject({ newRemainingToday: 15, leftoverToday: 3 });
      expect(today.body.domains).toHaveLength(DOMAIN_COUNT);
      expect(today.body.domains[0]).toEqual({
        domain: "music-stage",
        total: 10,
        seen: 2,
        due: 2,
        learningDue: 2,
        newAvailable: 8,
        known: 0,
        mature: 0,
        mastery: 0,
        retention30: null,
        reviews30: 2,
        leeches: 0,
      });
      expect(today.body.domains.find((d) => d.domain === "literature")?.seen).toBe(0);
      expect(today.body.settings.newFactsPerDay).toBe(15);

      const yesterday = await call<TrainerOverview>("GET", `/trainer/overview?today=${YESTERDAY}`);
      expect(yesterday.body.streak).toEqual({ current: 1, longest: 1, studiedToday: true });
      expect(yesterday.body.todayCounts).toEqual({
        reviews: 2,
        good: 1,
        again: 1,
        newIntroduced: 2,
      });
      // Seen from yesterday, the "good" card (due today) is not due yet.
      expect(yesterday.body.domains[0]).toMatchObject({ due: 1, learningDue: 1 });
    });

    it("derives mastery and 30-day retention from review-state grades", async () => {
      await seedState(client, "f00006", {
        state: "review",
        intervalDays: 30,
        dueDate: TOMORROW,
      });
      await seedState(client, "f00066", { state: "review", intervalDays: 5, dueDate: TODAY });
      await seedState(client, "f00007", {
        state: "relearning",
        intervalDays: 2,
        dueDate: TODAY,
        lapses: 9,
      });
      await seedReview(client, {
        questionId: "f00006",
        grade: "good",
        prevState: "review",
        localDate: TODAY,
      });
      await seedReview(client, {
        questionId: "f00066",
        grade: "again",
        prevState: "review",
        localDate: addDays(TODAY, -29),
      });
      await seedReview(client, {
        questionId: "f00007",
        grade: "good",
        prevState: "learning",
        localDate: TODAY,
      });
      // Outside the 30-day window, and an unapplied one: neither counts.
      await seedReview(client, {
        questionId: "f00066",
        grade: "again",
        prevState: "review",
        localDate: addDays(TODAY, -30),
      });
      await seedReview(client, {
        questionId: "f00066",
        grade: "again",
        prevState: "review",
        localDate: TODAY,
        applied: 0,
      });

      const { body } = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(body.domains.find((d) => d.domain === "literature")).toMatchObject({
        domain: "literature",
        seen: 3,
        known: 2,
        mature: 1,
        mastery: 0.1,
        retention30: 0.5,
        reviews30: 3,
        leeches: 1,
        due: 1, // the leech is hidden by default
        learningDue: 0,
      });
      await call("PUT", "/settings", { language: "en", includeLeeches: true });
      const withLeeches = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(withLeeches.body.domains.find((d) => d.domain === "literature")).toMatchObject({
        due: 2,
        learningDue: 1,
      });
    });
  });

  describe("GET /trainer/history", () => {
    it("lists non-zero trainer days in the window", async () => {
      await post(review({ questionId: "f00001", localDate: YESTERDAY }));
      await post(review({ questionId: "f00002", grade: "again", localDate: YESTERDAY }));
      await post(review({ questionId: "f00003", localDate: TODAY }));
      await recordGame({ questionId: "f00004", grade: "good", roomCode: "R" });
      await seedReview(client, {
        questionId: "f00005",
        grade: "good",
        prevState: "new",
        localDate: addDays(TODAY, -100),
      });
      const { status, body } = await call<TrainerHistory>(
        "GET",
        `/trainer/history?today=${TODAY}&days=90`,
      );
      expect(status).toBe(200);
      expect(body.days).toEqual([
        { date: YESTERDAY, reviews: 2, good: 1, again: 1, newIntroduced: 2 },
        { date: TODAY, reviews: 1, good: 1, again: 0, newIntroduced: 1 },
      ]);
      expect((await call("GET", `/trainer/history?today=${TODAY}&days=3`)).status).toBe(400);
    });
  });

  describe("settings", () => {
    it("round-trips, fills defaults and validates", async () => {
      const initial = await call("GET", "/settings");
      expect(initial.status).toBe(200);
      expect(initial.body).toEqual({
        language: { primary: "en", secondary: null },
        newFactsPerDay: 15,
        includeLeeches: false,
        gameReviewsAffectSrs: false,
        sources: ["quiztopia", "trivial-pursuit", "publish-or-perish", "publish-or-perish-mge"],
        sourcesKnown: [
          "quiztopia",
          "trivial-pursuit",
          "publish-or-perish",
          "publish-or-perish-mge",
        ],
        excludeFromAll: [],
      });
      const saved = await call("PUT", "/settings", {
        language: "de",
        newFactsPerDay: 8,
        includeLeeches: true,
        gameReviewsAffectSrs: true,
        sources: ["quiztopia"],
        excludeFromAll: ["history"],
      });
      expect(saved.status).toBe(200);
      expect(await call("GET", "/settings")).toEqual({ status: 200, body: saved.body });
      expect(saved.body).toEqual({
        language: { primary: "de", secondary: null },
        newFactsPerDay: 8,
        includeLeeches: true,
        gameReviewsAffectSrs: true,
        sources: ["quiztopia"],
        sourcesKnown: [
          "quiztopia",
          "trivial-pursuit",
          "publish-or-perish",
          "publish-or-perish-mge",
        ],
        excludeFromAll: ["history"],
      });
      const partial = await call("PUT", "/settings", { language: "both", newFactsPerDay: 0 });
      expect(partial.body).toMatchObject({
        includeLeeches: false,
        sources: ["quiztopia", "trivial-pursuit", "publish-or-perish", "publish-or-perish-mge"],
        excludeFromAll: [],
      });
      expect((await call("PUT", "/settings", { language: "en", newFactsPerDay: 61 })).status).toBe(
        400,
      );
      expect((await call("PUT", "/settings", { language: "fr" })).status).toBe(400);
      expect(
        (await call("PUT", "/settings", { language: { primary: "ru", secondary: "ru" } })).status,
      ).toBe(400);
      expect((await call("PUT", "/settings", { language: "en", sources: [] })).status).toBe(400);
      expect(
        (await call("PUT", "/settings", { language: "en", excludeFromAll: ["nope"] })).status,
      ).toBe(400);
      await vi.waitFor(async () => {
        expect(
          await count(client, "SELECT COUNT(*) n FROM activity_log WHERE type = 'quiz-settings'"),
        ).toBe(2);
      });
      // Each row records only what that save changed…
      const { rows } = await client.execute(
        "SELECT meta_json FROM activity_log WHERE type = 'quiz-settings' ORDER BY sort_ms",
      );
      expect(JSON.parse(String(rows[1]?.meta_json))).toEqual({
        changes: {
          language: {
            from: { primary: "de", secondary: null },
            to: { primary: "en", secondary: "de" },
          },
          newFactsPerDay: { from: 8, to: 0 },
          includeLeeches: { from: true, to: false },
          gameReviewsAffectSrs: { from: true, to: false },
          sources: {
            from: ["quiztopia"],
            to: ["quiztopia", "trivial-pursuit", "publish-or-perish", "publish-or-perish-mge"],
          },
          excludeFromAll: { from: ["history"], to: [] },
        },
      });
      // …and a save that changes nothing is not activity.
      expect((await call("PUT", "/settings", { language: "both", newFactsPerDay: 0 })).status).toBe(
        200,
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(
        await count(client, "SELECT COUNT(*) n FROM activity_log WHERE type = 'quiz-settings'"),
      ).toBe(2);
    });

    it("reads defaults over a row that holds only part of the settings", async () => {
      // Migration 0061 carried just the language across.
      await client.execute({
        sql: `INSERT INTO trainer_settings (user_id, deck, settings_json)
              VALUES (?, 'quiz', '{"language":"de"}')`,
        args: [USER],
      });
      expect((await call("GET", "/settings")).body).toMatchObject({
        language: { primary: "de", secondary: null },
        newFactsPerDay: 15,
      });
      const ov = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(ov.body.newRemainingToday).toBe(15);
    });
  });

  describe("POST /trainer/reset", () => {
    it("wipes the caller's schedule, history and reads, keeps settings and other users", async () => {
      await call("PUT", "/settings", { language: "de", newFactsPerDay: 7 });
      await post(review({ questionId: "f00001", grade: "good" }));
      await post(review({ questionId: "f00002", grade: "again" }));
      await call("POST", "/wiki/reads", { articleId: "a0001" });
      await post(review({ questionId: "f00003" }), OTHER);

      expect((await call("POST", "/trainer/reset", {})).status).toBe(400);
      const res = await call<TrainerReset>("POST", "/trainer/reset", { confirm: true });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, deleted: { states: 2, reviews: 2, reads: 1 } });

      const overview = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(overview.body.domains[0].seen).toBe(0);
      expect(overview.body.streak.current).toBe(0);
      expect((await call<WikiReads>("GET", "/wiki/reads")).body.reads).toEqual([]);
      expect((await call("GET", "/settings")).body).toMatchObject({
        language: { primary: "de", secondary: null },
        newFactsPerDay: 7,
      });
      // Someone else's progress is untouched.
      expect(
        await count(client, `SELECT COUNT(*) n FROM trainer_srs WHERE user_id = '${OTHER}'`),
      ).toBe(1);
    });
  });

  describe("GET /trainer/pins", () => {
    it("lists every studied fact as a pin, known once it graduated", async () => {
      expect((await call<TimelinePins>("GET", "/trainer/pins")).body).toEqual({
        pins: [],
        summary: { dated: 0, spanYears: 0 },
      });

      await post(review({ questionId: "f00002", grade: "again" }));
      await seedState(client, "f00086", {
        state: "review",
        intervalDays: 12,
        dueDate: TOMORROW,
        lastReviewedAt: "2026-09-01T08:00:00.000Z",
      });
      // A row for a fact the content no longer has is not a pin.
      await seedState(client, "f00481", { state: "review", dueDate: TOMORROW });

      const res = await call<TimelinePins>("GET", "/trainer/pins");
      expect(res.status).toBe(200);
      expect(res.body.pins.map((p) => p.questionId)).toEqual(["f00002", "f00086"]);
      const [learning, known] = res.body.pins;
      expect(learning.known).toBe(false);
      expect(learning.state).not.toBe("review");
      expect(learning.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(known).toEqual({
        questionId: "f00086",
        state: "review",
        known: true,
        lastReviewedAt: "2026-09-01T08:00:00.000Z",
      });

      // The teaser's numbers: both pins are dated, 26 Aug 1841 → 30 Dec 1916.
      expect(res.body.summary?.dated).toBe(2);
      expect(res.body.summary?.spanYears).toBeGreaterThan(75);
      expect(res.body.summary?.spanYears).toBeLessThan(76);

      // Pins are per member.
      expect(
        (await call<TimelinePins>("GET", "/trainer/pins", undefined, OTHER)).body.pins,
      ).toEqual([]);
    });
  });

  describe("GET /journal", () => {
    it("lists the day's studied questions and reads, newest day first", async () => {
      await post(review({ questionId: "f00001", grade: "again", localDate: YESTERDAY }));
      await post(review({ questionId: "f00001", grade: "good", localDate: YESTERDAY }));
      await post(review({ questionId: "f00072", localDate: TODAY }));
      await call("POST", "/wiki/reads", { articleId: "a0002" });

      const res = await call<Journal>("GET", "/journal?days=7&tz=UTC");
      expect(res.status).toBe(200);
      expect(res.body.days.map((d) => d.date)).toEqual([TODAY, YESTERDAY]);
      expect(res.body.days[0]?.articles.map((s) => s.articleId).sort()).toEqual(["a0002", "a0015"]);
      expect(res.body.days[1]?.articles[0]?.questions[0]).toMatchObject({
        questionId: "f00001",
        grades: ["again", "good"],
        firstSeen: true,
      });
      expect(res.body.nextBefore).toBeNull();

      const paged = await call<Journal>("GET", "/journal?days=1&tz=UTC");
      expect(paged.body.nextBefore).toBe(TODAY);
      const older = await call<Journal>("GET", `/journal?days=1&tz=UTC&before=${TODAY}`);
      expect(older.body.days.map((d) => d.date)).toEqual([YESTERDAY]);

      // Per member.
      expect((await call<Journal>("GET", "/journal", undefined, OTHER)).body.days).toEqual([]);
    });

    it("rejects a bad zone, page size or bound", async () => {
      expect((await call("GET", "/journal?tz=Mars%2FOlympus")).status).toBe(400);
      expect((await call("GET", "/journal?days=0")).status).toBe(400);
      expect((await call("GET", "/journal?before=yesterday")).status).toBe(400);
    });
  });

  describe("content reports", () => {
    const body = {
      target: { kind: "question", id: "f00003" },
      issue: "wrong-answer",
      language: "en",
      message: "The year is off",
      surface: "trainer",
    };

    it("files a report, updates it on a repeat, and logs the first one", async () => {
      const first = await call<{ report: MyReport; updated: boolean }>("POST", "/reports", body);
      expect(first.status).toBe(201);
      expect(first.body.updated).toBe(false);
      const again = await call<{ report: MyReport; updated: boolean }>("POST", "/reports", {
        ...body,
        message: "The year is off by two",
      });
      expect(again.status).toBe(200);
      expect(again.body.report.id).toBe(first.body.report.id);
      expect(
        await count(client, "SELECT COUNT(*) n FROM activity_log WHERE type = 'quiz-report'"),
      ).toBe(1);
    });

    it("refuses unknown content, an issue that doesn't fit, and 'other' without words", async () => {
      expect(
        (
          await call("POST", "/reports", {
            ...body,
            target: { kind: "question", id: "f05881" },
          })
        ).status,
      ).toBe(404);
      expect(
        (await call("POST", "/reports", { ...body, target: { kind: "article", id: "a0001" } }))
          .status,
      ).toBe(400);
      expect(
        (await call("POST", "/reports", { ...body, issue: "other", message: "" })).status,
      ).toBe(400);
    });

    it("lists only the caller's reports and lets them withdraw an open one", async () => {
      const mine = await call<{ report: MyReport }>("POST", "/reports", body);
      await call("POST", "/reports", body, OTHER);
      const list = await call<MyReports>("GET", "/reports/mine");
      expect(list.body.reports.map((r) => r.id)).toEqual([mine.body.report.id]);

      expect(
        (await call("DELETE", `/reports/${mine.body.report.id}`, undefined, OTHER)).status,
      ).toBe(404);
      const withdrawn = await call<MyReports>("DELETE", `/reports/${mine.body.report.id}`);
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body.reports).toEqual([]);
      expect((await call("DELETE", "/reports/abc")).status).toBe(400);
    });

    it("marks resolutions seen", async () => {
      const { body: filed } = await call<{ report: MyReport }>("POST", "/reports", body);
      await client.execute({
        sql: "UPDATE quiz_reports SET status = 'fixed', resolution_note = 'Done' WHERE id = ?",
        args: [filed.report.id],
      });
      expect((await call<MyReports>("GET", "/reports/mine")).body.unread).toBe(1);
      const seen = await call<MyReports>("POST", "/reports/mine/seen", { ids: [filed.report.id] });
      expect(seen.body.unread).toBe(0);
      expect((await call("POST", "/reports/mine/seen", { ids: [] })).status).toBe(400);
    });
  });

  describe("wiki read log", () => {
    const logged = () => count(client, "SELECT COUNT(*) n FROM quiz_wiki_read_log");

    it("logs a read once per sitting and unmarks only the latest read", async () => {
      await client.execute({
        sql: "INSERT INTO quiz_wiki_read_log (user_id, article_id, read_at) VALUES (?, ?, ?)",
        args: [USER, "a0001", `${YESTERDAY}T08:00:00.000Z`],
      });
      await call("POST", "/wiki/reads", { articleId: "a0001" });
      await call("POST", "/wiki/reads", { articleId: "a0001" });
      expect(await logged()).toBe(2);

      await call("DELETE", "/wiki/reads", { articleId: "a0001" });
      // The mistaken read is gone; yesterday's genuine one stays.
      const { rows } = await client.execute("SELECT read_at FROM quiz_wiki_read_log");
      expect(rows.map((r) => r.read_at)).toEqual([`${YESTERDAY}T08:00:00.000Z`]);
      // Unmarking an article that isn't marked never eats older reads.
      await call("DELETE", "/wiki/reads", { articleId: "a0001" });
      expect(await logged()).toBe(1);
    });

    it("is wiped by a progress reset", async () => {
      await call("POST", "/wiki/reads", { articleId: "a0001" });
      await call("POST", "/trainer/reset", { confirm: true });
      expect(await logged()).toBe(0);
    });
  });

  describe("wiki reads", () => {
    it("unmarks a read, idempotently and only the caller's own", async () => {
      await call("POST", "/wiki/reads", { articleId: "a0001" });
      await call("POST", "/wiki/reads", { articleId: "a0024" });
      await call("POST", "/wiki/reads", { articleId: "a0024" }, OTHER);

      const unread = await call<WikiReads>("DELETE", "/wiki/reads", { articleId: "a0001" });
      expect(unread.status).toBe(200);
      expect(unread.body.reads.map((r) => r.articleId)).toEqual(["a0024"]);
      const again = await call<WikiReads>("DELETE", "/wiki/reads", { articleId: "a0001" });
      expect(again.body.reads.map((r) => r.articleId)).toEqual(["a0024"]);
      expect((await call("DELETE", "/wiki/reads", { articleId: "c001" })).status).toBe(400);

      await call("DELETE", "/wiki/reads", { articleId: "a0024" });
      expect((await call<WikiReads>("GET", "/wiki/reads")).body.reads).toEqual([]);
      const others = await call<WikiReads>("GET", "/wiki/reads", undefined, OTHER);
      expect(others.body.reads.map((r) => r.articleId)).toEqual(["a0024"]);
    });

    it("records a read once per article and lists them", async () => {
      const first = await call<WikiReads>("POST", "/wiki/reads", { articleId: "a0001" });
      expect(first.status).toBe(200);
      expect(first.body.reads.map((r) => r.articleId)).toEqual(["a0001"]);
      const again = await call<WikiReads>("POST", "/wiki/reads", { articleId: "a0001" });
      expect(again.body.reads).toHaveLength(1);
      await call("POST", "/wiki/reads", { articleId: "a0024" });
      const list = await call<WikiReads>("GET", "/wiki/reads");
      expect(list.body.reads.map((r) => r.articleId).sort()).toEqual(["a0001", "a0024"]);

      expect(list.body.reads[0].readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(await count(client, "SELECT COUNT(*) n FROM quiz_wiki_reads")).toBe(2);
      expect((await call("POST", "/wiki/reads", { articleId: "a0097" })).status).toBe(404);
      expect((await call("POST", "/wiki/reads", { articleId: "c001" })).status).toBe(400);
      expect((await call<WikiReads>("GET", "/wiki/reads", undefined, OTHER)).body.reads).toEqual(
        [],
      );
    });
  });

  describe("GET /games/recent-misses", () => {
    it("groups game misses per question, newest first, ignoring trainer grades", async () => {
      await post(review({ questionId: "f00001", grade: "again" }));
      await recordGame({ questionId: "f00006", grade: "again", roomCode: "R1" });
      await recordGame({ questionId: "f00011", grade: "again", roomCode: "R1" });
      await recordGame({ questionId: "f00006", grade: "again", roomCode: "R2" });
      await recordGame({ questionId: "f00016", grade: "good", roomCode: "R2" });
      await seedReview(client, {
        questionId: "f00021",
        grade: "again",
        prevState: "new",
        source: "game",
        applied: 0,
        localDate: addDays(TODAY, -30),
        reviewedAt: new Date(Date.now() - 70 * 86_400_000).toISOString(),
        roomCode: "OLD",
      });
      const { status, body } = await call<RecentMisses>("GET", "/games/recent-misses");
      expect(status).toBe(200);
      expect(body.misses).toEqual([
        expect.objectContaining({
          questionId: "f00006",
          articleId: "a0002",
          domain: "literature",
          roomCode: "R2",
          missCount: 2,
        }),
        expect.objectContaining({ questionId: "f00011", roomCode: "R1", missCount: 1 }),
      ]);
      const limited = await call<RecentMisses>("GET", "/games/recent-misses?limit=1");
      expect(limited.body.misses.map((m) => m.questionId)).toEqual(["f00006"]);
    });
  });

  describe("GET /search", () => {
    it("returns scored hits from the content store", async () => {
      const { status, body } = await call<SearchResponse>("GET", "/search?q=Brecht");
      expect(status).toBe(200);
      expect(body.hits[0]).toMatchObject({
        questionId: "f00001",
        articleId: "a0001",
        domain: "music-stage",
        answer: "Bertolt Brecht",
      });
      const de = await call<SearchResponse>("GET", "/search?q=Kinderhymne&lang=de&limit=1");
      expect(de.body.hits).toHaveLength(1);
      expect(de.body.hits[0].question).toMatch(/Kinderhymne/);
      expect((await call("GET", "/search?q=B")).status).toBe(400);
      expect(
        (await call<SearchResponse>("GET", "/search?q=Brecht&domain=technology")).body.hits,
      ).toEqual([]);
    });
  });

  describe("GET /articles/:id/history", () => {
    let bank: ReturnType<typeof makeRetiredBank>;
    beforeAll(() => {
      bank = makeRetiredBank();
      __setContentStore(loadContentStore(bank.dir));
    });
    afterAll(() => {
      bank.cleanup();
      __setContentStore(loadContentStore(FIXTURE_DIR));
    });

    it("returns the article's history and its retired facts", async () => {
      const { status, body } = await call<ArticleHistoryResponse>("GET", "/articles/a0001/history");
      expect(status).toBe(200);
      expect(body.articleId).toBe("a0001");
      expect(body.entries).toEqual(FIXTURE_HISTORY.entries);
      expect(body.retired).toHaveLength(1);
      expect(body.retired).toMatchObject([
        {
          id: "f00001",
          answerEn: "Bertolt Brecht",
          answerDe: "Bertolt Brecht",
          questionEn: expect.any(String),
          questionDe: expect.any(String),
          wordingIds: ["w00001"],
          retired: { at: "2026-10-21", reason: "Duplicate of f00002.", replacedBy: ["f00002"] },
        },
      ]);
    });

    it("answers an article without a history file with no entries", async () => {
      const { status, body } = await call<ArticleHistoryResponse>("GET", "/articles/a0002/history");
      expect(status).toBe(200);
      expect(body).toEqual({ articleId: "a0002", entries: [], retired: [] });
    });

    it("404s an unknown article and 400s a malformed id", async () => {
      expect((await call("GET", "/articles/a0099/history")).status).toBe(404);
      expect((await call("GET", "/articles/c001/history")).status).toBe(400);
    });

    it("refuses a review of a retired fact", async () => {
      const review = await call("POST", "/trainer/reviews", {
        clientId: "retired-0001",
        questionId: "f00001",
        grade: "good",
        localDate: TODAY,
      });
      expect(review.status).toBe(404);
    });
  });
});
