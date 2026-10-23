// The game-over writer end to end: a real replay log in, `trainer_reviews`
// rows (deck "quiz") out — per human seat, per the seat policy, idempotent on re-run.

import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrations/migrator.ts";
import { type ContentStore, loadContentStore } from "./content-store.ts";
import { type FinishedTable, recordGameReviews } from "./game-reviews.ts";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/content/", import.meta.url));
const QUIET = { info() {}, warn() {} };

let client: Client;
let store: ContentStore;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  await runMigrations(client, { logger: QUIET });
  for (const id of ["anna", "ben"]) {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
      args: [id, id, `${id}@example.com`],
    });
  }
  store = loadContentStore(FIXTURE_DIR);
});

afterEach(() => {
  client.close();
});

type LoggedQuestion = {
  turn: number;
  questionId: string;
  activeSeat: number;
  readerSeat: number | null;
  correct: boolean | null;
  plenum: boolean;
};

function table(questions: LoggedQuestion[], over: Partial<FinishedTable> = {}): FinishedTable {
  return {
    sessionId: "session-abc",
    roomCode: "ROOM42",
    seatUserIds: ["anna", "ben", null],
    replayLog: { slug: "quiztopia", config: { expert: false }, questions },
    endedAt: new Date(),
    ...over,
  };
}

async function rows() {
  const { rows } = await client.execute(
    `SELECT user_id, client_id, card_id AS question_id, grade, source,
            json_extract(outcome_json, '$.roomCode') AS room_code
       FROM trainer_reviews WHERE deck = 'quiz' ORDER BY user_id, client_id`,
  );
  return rows.map((r) => ({ ...r }));
}

describe("recordGameReviews", () => {
  it("records each judged question for the human seats it tested", async () => {
    const summary = await recordGameReviews(
      client,
      store,
      table([
        // Anna answers, the AI seat reads: both humans discussed it.
        {
          turn: 1,
          questionId: "f00001",
          activeSeat: 0,
          readerSeat: 2,
          correct: true,
          plenum: false,
        },
        // Ben answers, Anna reads: only Ben is graded.
        {
          turn: 2,
          questionId: "f00066",
          activeSeat: 1,
          readerSeat: 0,
          correct: false,
          plenum: false,
        },
        // Redrawn: nobody.
        {
          turn: 3,
          questionId: "f00011",
          activeSeat: 0,
          readerSeat: 1,
          correct: null,
          plenum: false,
        },
      ]),
    );
    expect(summary).toEqual({ recorded: 3, skipped: 0 });
    expect(await rows()).toEqual([
      {
        user_id: "anna",
        client_id: "game:session-abc:1",
        question_id: "f00001",
        grade: "good",
        source: "game",
        room_code: "ROOM42",
      },
      {
        user_id: "ben",
        client_id: "game:session-abc:1",
        question_id: "f00001",
        grade: "good",
        source: "game",
        room_code: "ROOM42",
      },
      {
        user_id: "ben",
        client_id: "game:session-abc:2",
        question_id: "f00066",
        grade: "again",
        source: "game",
        room_code: "ROOM42",
      },
    ]);
  });

  it("is idempotent: a second game-over emit records nothing new", async () => {
    const t = table([
      {
        turn: 1,
        questionId: "f00001",
        activeSeat: 0,
        readerSeat: 1,
        correct: true,
        plenum: false,
      },
    ]);
    await recordGameReviews(client, store, t);
    await recordGameReviews(client, store, t);
    expect(await rows()).toHaveLength(1);
  });

  it("skips questions the content doesn't know, and keeps going", async () => {
    const summary = await recordGameReviews(
      client,
      store,
      table([
        {
          turn: 1,
          questionId: "f05881",
          activeSeat: 0,
          readerSeat: 1,
          correct: true,
          plenum: false,
        },
        {
          turn: 2,
          questionId: "f00002",
          activeSeat: 0,
          readerSeat: 1,
          correct: true,
          plenum: false,
        },
      ]),
    );
    expect(summary).toEqual({ recorded: 1, skipped: 1 });
  });

  it("leaves the schedule alone unless the member opted in", async () => {
    await recordGameReviews(
      client,
      store,
      table([
        {
          turn: 1,
          questionId: "f00001",
          activeSeat: 0,
          readerSeat: 1,
          correct: true,
          plenum: false,
        },
      ]),
    );
    const { rows: srs } = await client.execute("SELECT COUNT(*) n FROM trainer_srs");
    expect(Number(srs[0]?.n)).toBe(0);
  });

  it("refuses a log that isn't a Quiztopia replay", async () => {
    await expect(
      recordGameReviews(client, store, table([], { replayLog: { slug: "durak" } })),
    ).rejects.toThrow();
  });

  it("records the other seats when one seat's write fails, then reports the failure", async () => {
    await expect(
      recordGameReviews(
        client,
        store,
        table(
          [
            {
              turn: 1,
              questionId: "f00001",
              activeSeat: 0,
              readerSeat: 2,
              correct: true,
              plenum: false,
            },
          ],
          // "ghost" has no account row: its insert fails the foreign key.
          { seatUserIds: ["ghost", "ben", null] },
        ),
      ),
    ).rejects.toThrow(/1 game review\(s\).*1 recorded/);
    expect((await rows()).map((r) => r.user_id)).toEqual(["ben"]);
  });
});
