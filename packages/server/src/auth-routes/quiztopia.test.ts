// The trainer API end to end: real migration chain, in-memory libsql, the
// real routes behind an auth stub, and the 2-card fixture content store.
// Dates are computed from the real UTC day because the review window is
// anchored on the server's clock.

import { fileURLToPath } from "node:url";
import { addDays } from "@boardgames/core/games/quiztopia/srs";
import type {
  RecentMisses,
  ReviewBody,
  ReviewResponse,
  SearchResponse,
  TrainerHistory,
  TrainerOverview,
  TrainerQueue,
  WikiReads,
} from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { __setContentStore, loadContentStore } from "../lib/quiztopia/content-store.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { quiztopiaRoutes } = await import("./quiztopia.ts");

const FIXTURE_DIR = fileURLToPath(
  new URL("../lib/quiztopia/__fixtures__/content/", import.meta.url),
);
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
  a.route("/api/quiztopia", quiztopiaRoutes);
  return a;
}

async function call<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  viewerId = USER,
): Promise<{ status: number; body: T }> {
  const res = await app(viewerId).request(`/api/quiztopia${path}`, {
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
    questionId: "c001-s01-q0",
    grade: "good",
    localDate: TODAY,
    ...overrides,
  };
}

function post(body: ReviewBody, viewerId = USER) {
  return call<ReviewResponse>("POST", "/trainer/reviews", body, viewerId);
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
    sql: `INSERT INTO quiztopia_srs
            (user_id, question_id, category, state, ease, interval_days, due_date, reps, lapses,
             last_reviewed_at)
          VALUES (?, ?, ?, ?, 2.5, ?, ?, ?, ?, ?)`,
    args: [
      USER,
      questionId,
      Number(questionId.slice(6, 8)),
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
    sql: `INSERT INTO quiztopia_reviews
            (user_id, client_id, question_id, category, grade, prev_state, source, applied,
             reviewed_at, local_date, room_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      USER,
      `seed-${seq}`,
      fields.questionId,
      Number(fields.questionId.slice(6, 8)),
      fields.grade,
      fields.prevState,
      fields.source ?? "trainer",
      fields.applied ?? 1,
      fields.reviewedAt ?? new Date().toISOString(),
      fields.localDate,
      fields.roomCode ?? null,
    ],
  });
}

async function count(client: Client, sql: string, args: (string | number)[] = []) {
  const { rows } = await client.execute({ sql, args });
  return Number(rows[0]?.n);
}

describe("/api/quiztopia", () => {
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
        questionId: "c001-s01-q0",
        state: "learning",
        intervalDays: 1,
        dueDate: TOMORROW,
        reps: 1,
        lapses: 0,
        leech: false,
      });
      const states = await call<{ states: { questionId: string; reps: number }[] }>(
        "GET",
        "/trainer/states?ids=c001-s01-q0,c001-s01-q1",
      );
      expect(states.status).toBe(200);
      expect(states.body.states).toEqual([
        expect.objectContaining({ questionId: "c001-s01-q0", reps: 1 }),
      ]);
      expect(await count(client, "SELECT COUNT(*) n FROM quiztopia_reviews")).toBe(1);
    });

    it("replays an already logged clientId with 200 and no second application", async () => {
      const body = review();
      const first = await post(body);
      expect(first.status).toBe(201);
      const again = await post(body);
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ ok: true, existed: true, applied: true });
      expect(again.body.state?.reps).toBe(1);
      expect(await count(client, "SELECT COUNT(*) n FROM quiztopia_reviews")).toBe(1);
      expect(
        await count(client, "SELECT reps n FROM quiztopia_srs WHERE question_id = 'c001-s01-q0'"),
      ).toBe(1);
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
      expect(
        await count(client, "SELECT COUNT(*) n FROM quiztopia_reviews WHERE applied = 0"),
      ).toBe(1);
      expect(await count(client, "SELECT COUNT(*) n FROM quiztopia_reviews")).toBe(2);
    });

    it("keeps game answers out of the schedule until the member opts in", async () => {
      const off = await post(
        review({
          questionId: "c001-s03-q0",
          grade: "again",
          source: "game",
          roomCode: "ABCD",
          clientId: "game:ABCD:3",
        }),
      );
      expect(off.status).toBe(201);
      expect(off.body).toMatchObject({ existed: false, applied: false, state: null });
      expect(await count(client, "SELECT COUNT(*) n FROM quiztopia_srs")).toBe(0);

      const put = await call("PUT", "/settings", {
        language: "en",
        newPerDay: 10,
        newPerDayByCategory: {},
        includeLeeches: false,
        gameReviewsAffectSrs: true,
      });
      expect(put.status).toBe(200);

      const on = await post(
        review({
          questionId: "c001-s03-q1",
          grade: "good",
          source: "game",
          roomCode: "ABCD",
          clientId: "game:ABCD:4",
        }),
      );
      expect(on.body).toMatchObject({ applied: true });
      expect(on.body.state).toMatchObject({ questionId: "c001-s03-q1", state: "learning" });

      // Game reviews never count as a study day.
      const overview = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(overview.body.streak).toEqual({ current: 0, longest: 0, studiedToday: false });
      expect(overview.body.todayCounts.reviews).toBe(0);
    });

    it("rejects an unknown question with 404 and an out-of-window date with 400", async () => {
      const unknown = await post(review({ questionId: "c009-s01-q0" }));
      expect(unknown.status).toBe(404);
      const malformed = await post(review({ questionId: "c001-s13-q0" }));
      expect(malformed.status).toBe(400);
      const old = await post(review({ localDate: addDays(TODAY, -40) }));
      expect(old.status).toBe(400);
      const future = await post(review({ localDate: addDays(TODAY, 2) }));
      expect(future.status).toBe(400);
      const edge = await post(review({ localDate: addDays(TODAY, -30) }));
      expect(edge.status).toBe(201);
      const tomorrow = await post(review({ questionId: "c001-s01-q1", localDate: TOMORROW }));
      expect(tomorrow.status).toBe(201);
    });

    it("logs the first trainer review of a local date as activity, once", async () => {
      await post(review());
      await post(review({ questionId: "c001-s01-q1" }));
      await post(review({ questionId: "c001-s01-q2", localDate: YESTERDAY }));
      await vi.waitFor(async () => {
        expect(
          await count(client, "SELECT COUNT(*) n FROM activity_log WHERE type = 'quiztopia-train'"),
        ).toBe(2);
      });
    });

    it("scopes state to the member", async () => {
      await post(review());
      const other = await call<{ states: unknown[] }>(
        "GET",
        "/trainer/states?ids=c001-s01-q0",
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
          review({ questionId: "c001-s02-q0" }),
          existing,
          review({ questionId: "c009-s01-q0" }),
          review({ questionId: "c001-s02-q1", localDate: addDays(TODAY, -40) }),
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ applied: 1, skipped: 3 });
      expect(res.body.states.map((s) => s.questionId).sort()).toEqual([
        "c001-s01-q0",
        "c001-s02-q0",
      ]);
      expect(await count(client, "SELECT COUNT(*) n FROM quiztopia_reviews")).toBe(2);
    });
  });

  describe("GET /trainer/queue", () => {
    it("orders learning, then review, then new, spreading siblings", async () => {
      await call("PUT", "/settings", { language: "en", newPerDay: 10, newCardOrder: "originals" });
      await seedState(client, "c001-s01-q3", {
        state: "learning",
        dueDate: TODAY,
        lastReviewedAt: "2026-01-01T10:00:00.000Z",
      });
      await seedState(client, "c002-s01-q4", {
        state: "relearning",
        dueDate: TODAY,
        lastReviewedAt: "2026-01-01T09:00:00.000Z",
      });
      await seedState(client, "c002-s01-q2", {
        state: "review",
        intervalDays: 8,
        dueDate: YESTERDAY,
      });
      await seedState(client, "c001-s01-q0", {
        state: "review",
        intervalDays: 8,
        dueDate: TOMORROW,
      });
      await seedState(client, "c001-s02-q0", {
        state: "review",
        intervalDays: 8,
        dueDate: YESTERDAY,
      });

      const { status, body } = await call<TrainerQueue>(
        "GET",
        `/trainer/queue?today=${TODAY}&category=1&limit=60`,
      );
      expect(status).toBe(200);
      expect(body.today).toBe(TODAY);
      const tiers = body.items.map((it) => it.tier);
      // Tier order is fixed; the order of NEW cards is a per-user shuffle.
      expect(tiers.slice(0, 2)).toEqual(["learning", "learning"]);
      expect(tiers[2]).toBe("review");
      expect(tiers.slice(3)).toEqual(Array(6).fill("new"));
      expect(body.items.slice(0, 3).map((it) => it.questionId)).toEqual([
        "c002-s01-q4",
        "c001-s01-q3",
        "c002-s01-q2",
      ]);
      expect(new Set(body.items.slice(3).map((it) => it.questionId))).toEqual(
        new Set([
          "c002-s01-q0",
          "c001-s01-q1",
          "c002-s01-q1",
          "c001-s01-q2",
          "c002-s01-q3",
          "c001-s01-q4",
        ]),
      );
      expect(body.counts).toEqual({ learning: 2, review: 1, new: 6 });
      expect(body.items[0]).toMatchObject({ setId: "c002-s01", cardId: "c002", category: 1 });
      expect(body.items[0].state).toMatchObject({ state: "relearning", reps: 3 });
      expect(body.items[3].state).toBeNull();
      for (let i = 1; i < body.items.length; i++) {
        expect(body.items[i].setId).not.toBe(body.items[i - 1].setId);
      }
    });

    it("never puts two questions of one set back to back", async () => {
      await call("PUT", "/settings", { language: "en", newPerDay: 10, newCardOrder: "originals" });
      await seedState(client, "c001-s01-q3", {
        state: "learning",
        dueDate: TODAY,
        lastReviewedAt: "2026-01-01T09:00:00.000Z",
      });
      await seedState(client, "c001-s01-q4", {
        state: "learning",
        dueDate: TODAY,
        lastReviewedAt: "2026-01-01T10:00:00.000Z",
      });
      const { body } = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&category=1`);
      expect(body.items.length).toBeGreaterThan(3);
      for (let i = 1; i < body.items.length; i++) {
        expect(body.items[i].setId).not.toBe(body.items[i - 1].setId);
      }
      expect(body.items.filter((it) => it.tier === "learning")).toHaveLength(2);
    });

    it("caps new cards per day by today's applied introductions only", async () => {
      await call("PUT", "/settings", { language: "en", newPerDay: 3, newCardOrder: "originals" });
      const first = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&category=1`);
      expect(first.body.items.map((it) => it.tier)).toEqual(["new", "new", "new"]);
      // Originals first (in the user's shuffled order), then a first sibling.
      const firstIds = first.body.items.map((it) => it.questionId);
      expect([...firstIds.slice(0, 2)].sort()).toEqual(["c001-s01-q0", "c002-s01-q0"]);
      expect(firstIds[2]).toMatch(/^c00[12]-s01-q1$/);

      await post(review({ questionId: "c001-s01-q0", grade: "good" }));
      await post(review({ questionId: "c002-s01-q0", grade: "again" }));
      // A game answer without the opt-in is logged applied = 0: not an introduction.
      await post(
        review({ questionId: "c001-s01-q1", grade: "again", source: "game", roomCode: "R1" }),
      );
      // Yesterday's introductions do not eat into today's cap.
      await seedReview(client, {
        questionId: "c001-s01-q2",
        grade: "good",
        prevState: "new",
        localDate: YESTERDAY,
      });

      const second = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&category=1`);
      const secondIds = second.body.items.map((it) => `${it.tier}:${it.questionId}`);
      expect(secondIds).toHaveLength(2);
      expect(secondIds[0]).toBe("learning:c002-s01-q0");
      expect(secondIds[1]).toMatch(/^new:c00[12]-s01-q1$/);
      expect(second.body.counts).toEqual({ learning: 1, review: 0, new: 1 });

      const overview = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(overview.body.categories[0]).toMatchObject({ newRemainingToday: 1, newAvailable: 8 });
      expect(overview.body.todayCounts).toEqual({
        reviews: 2,
        good: 1,
        again: 1,
        newIntroduced: 2,
      });
    });

    it("round-robins the categories when none is given", async () => {
      await call("PUT", "/settings", { language: "en", newPerDay: 2, newCardOrder: "originals" });
      const { body } = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      expect(body.items).toHaveLength(24);
      expect(body.items.slice(0, 12).map((it) => it.category)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      // Each district leads with one of its originals (whichever the shuffle put first).
      expect(body.items.slice(0, 12).every((it) => /^c00[12]-s\d\d-q0$/.test(it.questionId))).toBe(
        true,
      );
      expect(body.counts).toEqual({ learning: 0, review: 0, new: 24 });
      const limited = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=5`);
      expect(limited.body.items).toHaveLength(5);
      expect(limited.body.counts.new).toBe(24);
    });

    it("in set mode, introduces and reviews whole sets together", async () => {
      await call("PUT", "/settings", { language: "en", newPerDay: 3 });
      const first = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&category=1`);
      // A cap of 3 still brings the whole set: five siblings, original first.
      const ids = first.body.items.map((it) => it.questionId);
      expect(ids).toHaveLength(5);
      expect(new Set(first.body.items.map((it) => it.setId)).size).toBe(1);
      expect(ids.map((id) => id.slice(-2))).toEqual(["q0", "q1", "q2", "q3", "q4"]);

      const mixed = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&limit=200`);
      expect(mixed.body.items).toHaveLength(60);
      // Round-robin takes a whole set per district turn.
      for (let i = 0; i < 60; i += 5) {
        const run = mixed.body.items.slice(i, i + 5);
        expect(new Set(run.map((it) => it.setId)).size).toBe(1);
        expect(run[0].category).toBe(i / 5 + 1);
      }
    });

    it("hides leeches unless asked for them", async () => {
      await seedState(client, "c001-s01-q0", {
        state: "review",
        intervalDays: 3,
        dueDate: YESTERDAY,
        lapses: 8,
      });
      const hidden = await call<TrainerQueue>("GET", `/trainer/queue?today=${TODAY}&category=1`);
      expect(hidden.body.items.some((it) => it.questionId === "c001-s01-q0")).toBe(false);
      const shown = await call<TrainerQueue>(
        "GET",
        `/trainer/queue?today=${TODAY}&category=1&includeLeeches=true`,
      );
      expect(shown.body.items[0]).toMatchObject({ questionId: "c001-s01-q0", tier: "review" });
      expect(shown.body.items[0].state?.leech).toBe(true);
    });

    it("validates its query", async () => {
      expect((await call("GET", "/trainer/queue")).status).toBe(400);
      expect((await call("GET", `/trainer/queue?today=${TODAY}&category=13`)).status).toBe(400);
    });
  });

  describe("GET /trainer/overview", () => {
    it("computes streak and today's counts against the client's day", async () => {
      await post(review({ questionId: "c001-s01-q0", grade: "good", localDate: YESTERDAY }));
      await post(review({ questionId: "c001-s01-q1", grade: "again", localDate: YESTERDAY }));

      const today = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(today.status).toBe(200);
      expect(today.body.contentVersion).toMatch(/^[0-9a-f]{12}$/);
      expect(today.body.today).toBe(TODAY);
      expect(today.body.streak).toEqual({ current: 1, longest: 1, studiedToday: false });
      expect(today.body.todayCounts).toEqual({ reviews: 0, good: 0, again: 0, newIntroduced: 0 });
      expect(today.body.categories).toHaveLength(12);
      expect(today.body.categories[0]).toEqual({
        n: 1,
        total: 10,
        seen: 2,
        due: 2,
        learningDue: 2,
        newAvailable: 8,
        newRemainingToday: 8,
        known: 0,
        mature: 0,
        mastery: 0,
        retention30: null,
        reviews30: 2,
        leeches: 0,
      });
      expect(today.body.categories[1].seen).toBe(0);
      expect(today.body.settings.newPerDay).toBe(10);

      const yesterday = await call<TrainerOverview>("GET", `/trainer/overview?today=${YESTERDAY}`);
      expect(yesterday.body.streak).toEqual({ current: 1, longest: 1, studiedToday: true });
      expect(yesterday.body.todayCounts).toEqual({
        reviews: 2,
        good: 1,
        again: 1,
        newIntroduced: 2,
      });
      // Seen from yesterday, the "good" card (due today) is not due yet.
      expect(yesterday.body.categories[0]).toMatchObject({ due: 1, learningDue: 1 });
    });

    it("derives mastery and 30-day retention from review-state grades", async () => {
      await seedState(client, "c001-s02-q0", {
        state: "review",
        intervalDays: 30,
        dueDate: TOMORROW,
      });
      await seedState(client, "c002-s02-q0", { state: "review", intervalDays: 5, dueDate: TODAY });
      await seedState(client, "c001-s02-q1", {
        state: "relearning",
        intervalDays: 2,
        dueDate: TODAY,
        lapses: 9,
      });
      await seedReview(client, {
        questionId: "c001-s02-q0",
        grade: "good",
        prevState: "review",
        localDate: TODAY,
      });
      await seedReview(client, {
        questionId: "c002-s02-q0",
        grade: "again",
        prevState: "review",
        localDate: addDays(TODAY, -29),
      });
      await seedReview(client, {
        questionId: "c001-s02-q1",
        grade: "good",
        prevState: "learning",
        localDate: TODAY,
      });
      // Outside the 30-day window, and an unapplied one: neither counts.
      await seedReview(client, {
        questionId: "c002-s02-q0",
        grade: "again",
        prevState: "review",
        localDate: addDays(TODAY, -30),
      });
      await seedReview(client, {
        questionId: "c002-s02-q0",
        grade: "again",
        prevState: "review",
        localDate: TODAY,
        applied: 0,
      });

      const { body } = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(body.categories[1]).toMatchObject({
        n: 2,
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
      await call("PUT", "/settings", { language: "en", newPerDay: 10, includeLeeches: true });
      const withLeeches = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(withLeeches.body.categories[1]).toMatchObject({ due: 2, learningDue: 1 });
    });
  });

  describe("GET /trainer/history", () => {
    it("lists non-zero trainer days in the window", async () => {
      await post(review({ questionId: "c001-s01-q0", localDate: YESTERDAY }));
      await post(review({ questionId: "c001-s01-q1", grade: "again", localDate: YESTERDAY }));
      await post(review({ questionId: "c001-s01-q2", localDate: TODAY }));
      await post(
        review({ questionId: "c001-s01-q3", source: "game", roomCode: "R", localDate: TODAY }),
      );
      await seedReview(client, {
        questionId: "c001-s01-q4",
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
        language: "en",
        newPerDay: 10,
        newPerDayByCategory: {},
        includeLeeches: false,
        gameReviewsAffectSrs: false,
        newCardOrder: "sets",
      });
      const saved = await call("PUT", "/settings", {
        language: "de",
        newPerDay: 5,
        newPerDayByCategory: { "3": 2 },
        includeLeeches: true,
        gameReviewsAffectSrs: true,
        newCardOrder: "originals",
      });
      expect(saved.status).toBe(200);
      expect(await call("GET", "/settings")).toEqual({ status: 200, body: saved.body });
      expect(saved.body).toEqual({
        language: "de",
        newPerDay: 5,
        newPerDayByCategory: { "3": 2 },
        includeLeeches: true,
        gameReviewsAffectSrs: true,
        newCardOrder: "originals",
      });
      const partial = await call("PUT", "/settings", { language: "both", newPerDay: 0 });
      expect(partial.body).toMatchObject({
        newPerDayByCategory: {},
        includeLeeches: false,
        newCardOrder: "sets",
      });
      expect((await call("PUT", "/settings", { language: "fr", newPerDay: 5 })).status).toBe(400);
      expect((await call("PUT", "/settings", { language: "en", newPerDay: 99 })).status).toBe(400);
      await vi.waitFor(async () => {
        expect(
          await count(
            client,
            "SELECT COUNT(*) n FROM activity_log WHERE type = 'quiztopia-settings'",
          ),
        ).toBe(2);
      });
    });

    it("applies a per-category new-card override to that category only", async () => {
      await call("PUT", "/settings", {
        language: "en",
        newPerDay: 4,
        newPerDayByCategory: { "2": 1 },
        newCardOrder: "originals",
      });
      const { body } = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(body.categories[0].newRemainingToday).toBe(4);
      expect(body.categories[1].newRemainingToday).toBe(1);
      // Set mode rounds each cap up to whole sets of five.
      await call("PUT", "/settings", {
        language: "en",
        newPerDay: 4,
        newPerDayByCategory: { "2": 1 },
      });
      const sets = await call<TrainerOverview>("GET", `/trainer/overview?today=${TODAY}`);
      expect(sets.body.categories[0].newRemainingToday).toBe(5);
      expect(sets.body.categories[1].newRemainingToday).toBe(5);
    });
  });

  describe("wiki reads", () => {
    it("records a read once per set and lists them", async () => {
      const first = await call<WikiReads>("POST", "/wiki/reads", { setId: "c001-s01" });
      expect(first.status).toBe(200);
      expect(first.body.reads.map((r) => r.setId)).toEqual(["c001-s01"]);
      const again = await call<WikiReads>("POST", "/wiki/reads", { setId: "c001-s01" });
      expect(again.body.reads).toHaveLength(1);
      await call("POST", "/wiki/reads", { setId: "c002-s12" });
      const list = await call<WikiReads>("GET", "/wiki/reads");
      expect(list.body.reads.map((r) => r.setId).sort()).toEqual(["c001-s01", "c002-s12"]);
      expect(list.body.reads[0].readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(await count(client, "SELECT COUNT(*) n FROM quiztopia_wiki_reads")).toBe(2);
      expect((await call("POST", "/wiki/reads", { setId: "c009-s01" })).status).toBe(404);
      expect((await call("POST", "/wiki/reads", { setId: "c001" })).status).toBe(400);
      expect((await call<WikiReads>("GET", "/wiki/reads", undefined, OTHER)).body.reads).toEqual(
        [],
      );
    });
  });

  describe("GET /games/recent-misses", () => {
    it("groups game misses per question, newest first, ignoring trainer grades", async () => {
      await post(review({ questionId: "c001-s01-q0", grade: "again" }));
      await post(
        review({ questionId: "c001-s02-q0", grade: "again", source: "game", roomCode: "R1" }),
      );
      await post(
        review({ questionId: "c001-s03-q0", grade: "again", source: "game", roomCode: "R1" }),
      );
      await post(
        review({ questionId: "c001-s02-q0", grade: "again", source: "game", roomCode: "R2" }),
      );
      await post(
        review({ questionId: "c001-s04-q0", grade: "good", source: "game", roomCode: "R2" }),
      );
      await seedReview(client, {
        questionId: "c001-s05-q0",
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
          questionId: "c001-s02-q0",
          setId: "c001-s02",
          cardId: "c001",
          category: 2,
          roomCode: "R2",
          missCount: 2,
        }),
        expect.objectContaining({ questionId: "c001-s03-q0", roomCode: "R1", missCount: 1 }),
      ]);
      const limited = await call<RecentMisses>("GET", "/games/recent-misses?limit=1");
      expect(limited.body.misses.map((m) => m.questionId)).toEqual(["c001-s02-q0"]);
    });
  });

  describe("GET /search", () => {
    it("returns scored hits from the content store", async () => {
      const { status, body } = await call<SearchResponse>("GET", "/search?q=Brecht");
      expect(status).toBe(200);
      expect(body.hits[0]).toMatchObject({
        questionId: "c001-s01-q0",
        setId: "c001-s01",
        cardId: "c001",
        category: 1,
        answer: "Bertolt Brecht",
      });
      const de = await call<SearchResponse>("GET", "/search?q=Kinderhymne&lang=de&limit=1");
      expect(de.body.hits).toHaveLength(1);
      expect(de.body.hits[0].question).toMatch(/Kinderhymne/);
      expect((await call("GET", "/search?q=B")).status).toBe(400);
      expect((await call<SearchResponse>("GET", "/search?q=Brecht&category=12")).body.hits).toEqual(
        [],
      );
    });
  });
});
