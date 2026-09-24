import type { CardQuestions } from "@boardgames/core/games/quiztopia/content-types";
import { addDays } from "@boardgames/core/games/quiztopia/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The session owns its queue: a grade applies `applyReview` locally at once
// (the server's reply only reconciles), an "again" card comes back a few
// positions later, and undo puts everything back. Offline, the review is
// queued instead of lost.

const TODAY = "2026-09-24";

function card(cardId: string): CardQuestions {
  return {
    id: cardId,
    sourceImage: `${cardId}.jpg`,
    sets: Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      const sid = `${cardId}-s${String(n).padStart(2, "0")}`;
      return {
        id: sid,
        n,
        notesEn: "",
        notesDe: "",
        questions: Array.from({ length: 5 }, (_, q) => ({
          id: `${sid}-q${q}`,
          en: `Q ${sid} ${q} en`,
          de: `Q ${sid} ${q} de`,
          answerEn: `A ${q} en`,
          answerDe: `A ${q} de`,
          timeline: {
            kind: "event" as const,
            start: "1900",
            end: null,
            precision: "year" as const,
            approx: false,
            ongoing: false,
            labelEn: `Event ${q}`,
            labelDe: `Ereignis ${q}`,
          },
          source: { url: `https://example.org/${sid}/${q}`, title: `Source ${q}`, lang: "en" },
        })),
      };
    }),
  };
}

const QUEUE = {
  today: TODAY,
  items: [
    {
      questionId: "c001-s01-q0",
      setId: "c001-s01",
      cardId: "c001",
      category: 1,
      tier: "new",
      state: null,
    },
    {
      questionId: "c002-s05-q0",
      setId: "c002-s05",
      cardId: "c002",
      category: 5,
      tier: "new",
      state: null,
    },
  ],
  counts: { learning: 0, review: 0, new: 2 },
};

const submitReviewMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock("../api", () => ({
  todayKey: () => TODAY,
  queueQuery: () => async () => QUEUE,
  statesQuery: () => async () => ({ states: [] }),
  submitReview: (body: unknown) => submitReviewMock(body),
}));

vi.mock("../content", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../content")>();
  return {
    ...mod,
    preloadQuestions: vi.fn(),
    preloadArticles: vi.fn(),
  };
});

vi.mock("./useContent", () => ({
  useCardQuestions: (cardId: string | null) => ({
    data: cardId ? card(cardId) : undefined,
    isPending: !cardId,
  }),
  useCardArticles: () => ({ data: undefined, isPending: true }),
}));

vi.mock("./useOfflineReviewQueue", () => ({
  useOfflineReviewQueue: () => ({ enqueue: enqueueMock, flush: vi.fn(), pendingCount: 0 }),
}));

import {
  initialSessionState,
  REINSERT_GAP,
  type SessionItem,
  sessionReducer,
  useTrainerSession,
} from "./useTrainerSession";

function withClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function items(n: number): SessionItem[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: `c00${i + 1}-s01-q0`,
    setId: `c00${i + 1}-s01`,
    cardId: `c00${i + 1}`,
    category: 1,
    tier: "new" as const,
  }));
}

beforeEach(() => {
  submitReviewMock.mockReset();
  submitReviewMock.mockResolvedValue({ ok: true, existed: false, applied: true, state: null });
  enqueueMock.mockReset();
});

describe("sessionReducer", () => {
  const ready = (n: number) =>
    sessionReducer(initialSessionState(TODAY), {
      type: "init",
      items: items(n),
      states: {},
      now: 1000,
    });
  const grade = (s: ReturnType<typeof ready>, g: "good" | "again", id = "x") =>
    sessionReducer(sessionReducer(s, { type: "reveal" }), {
      type: "grade",
      grade: g,
      clientId: `client-${id}`,
      now: 2000,
      nowIso: "2026-09-24T10:00:00.000Z",
      question: null,
    });

  it("applies a good grade optimistically with applyReview", () => {
    const s = grade(ready(3), "good");
    expect(s.cursor).toBe(1);
    expect(s.items).toHaveLength(3);
    expect(s.states["c001-s01-q0"]).toMatchObject({
      state: "learning",
      intervalDays: 1,
      dueDate: addDays(TODAY, 1),
      reps: 1,
    });
    expect(s.reviews[0]).toMatchObject({ grade: "good", prev: null, durationMs: 1000 });
    expect(s.revealed).toBe(false);
  });

  it("ignores a grade before the reveal", () => {
    const s = ready(2);
    const after = sessionReducer(s, {
      type: "grade",
      grade: "good",
      clientId: "client-1",
      now: 2000,
      nowIso: "2026-09-24T10:00:00.000Z",
      question: null,
    });
    expect(after).toBe(s);
  });

  it("re-inserts an 'again' card REINSERT_GAP positions later, as learning", () => {
    const s = grade(ready(8), "again");
    expect(s.items).toHaveLength(9);
    const at = s.cursor + REINSERT_GAP;
    expect(s.items[at]).toMatchObject({ questionId: "c001-s01-q0", tier: "learning" });
    expect(s.reviews[0].insertedAt).toBe(at);
    expect(s.states["c001-s01-q0"]).toMatchObject({ state: "learning", dueDate: TODAY });
  });

  it("appends the 'again' copy at the end of a short queue", () => {
    const s = grade(ready(2), "again");
    expect(s.items).toHaveLength(3);
    expect(s.items[2].questionId).toBe("c001-s01-q0");
  });

  it("undo removes the re-inserted copy and restores the state", () => {
    const graded = grade(ready(8), "again");
    const undone = sessionReducer(graded, { type: "undo", now: 3000 });
    expect(undone.items).toHaveLength(8);
    expect(undone.cursor).toBe(0);
    expect(undone.states["c001-s01-q0"]).toBeNull();
    expect(undone.reviews).toHaveLength(0);
    expect(undone.revealed).toBe(true);
  });

  it("reconcile adopts the server state only for the latest review of the card", () => {
    const s = grade(ready(3), "good", "a");
    const prev = s.states["c001-s01-q0"];
    if (!prev) throw new Error("state missing");
    const server = { ...prev, ease: 2.6 };
    const adopted = sessionReducer(s, {
      type: "reconcile",
      questionId: "c001-s01-q0",
      clientId: "client-a",
      state: server,
    });
    expect(adopted.states["c001-s01-q0"]?.ease).toBe(2.6);
    const stale = sessionReducer(s, {
      type: "reconcile",
      questionId: "c001-s01-q0",
      clientId: "client-old",
      state: server,
    });
    expect(stale).toBe(s);
  });

  it("extend appends only cards not already ahead of the cursor", () => {
    const s = grade(ready(2), "good");
    const extended = sessionReducer(s, {
      type: "extend",
      items: items(3),
      states: {},
      now: 4000,
    });
    // c002 is still pending and is skipped; c001 was graded (behind the
    // cursor) so a fresh queue may legitimately bring it back.
    expect(extended.items.map((i) => i.cardId)).toEqual(["c001", "c002", "c001", "c003"]);
  });
});

describe("useTrainerSession", () => {
  it("loads the queue, grades optimistically and posts the review", async () => {
    const { result } = renderHook(() => useTrainerSession({ kind: "due", category: null }), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.progress).toEqual({ done: 0, total: 2 });
    await waitFor(() => expect(result.current.current?.question.id).toBe("c001-s01-q0"));

    act(() => result.current.reveal());
    expect(result.current.revealed).toBe(true);
    act(() => result.current.grade("good"));

    expect(result.current.progress.done).toBe(1);
    expect(result.current.lastReview?.next).toMatchObject({
      state: "learning",
      dueDate: addDays(TODAY, 1),
    });
    expect(submitReviewMock).toHaveBeenCalledTimes(1);
    expect(submitReviewMock.mock.calls[0][0]).toMatchObject({
      questionId: "c001-s01-q0",
      grade: "good",
      localDate: TODAY,
    });

    // Second card: "again" brings it back at the end of this short queue.
    act(() => result.current.reveal());
    act(() => result.current.grade("again"));
    expect(result.current.progress).toEqual({ done: 2, total: 3 });
    expect(result.current.item?.questionId).toBe("c002-s05-q0");
    expect(result.current.summary.missed.map((m) => m.questionId)).toEqual(["c002-s05-q0"]);

    act(() => result.current.undo());
    expect(result.current.progress).toEqual({ done: 1, total: 2 });
    expect(result.current.revealed).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("queues the review offline when the network fails", async () => {
    submitReviewMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useTrainerSession({ kind: "due", category: null }), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    await waitFor(() => expect(enqueueMock).toHaveBeenCalledTimes(1));
    expect(enqueueMock.mock.calls[0][0]).toMatchObject({
      questionId: "c001-s01-q0",
      grade: "good",
    });
    // The optimistic state stands regardless.
    expect(result.current.summary.knew).toBe(1);
  });

  it("reports an empty queue", async () => {
    const { result } = renderHook(() => useTrainerSession({ kind: "ids", ids: [] }), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.empty).toBe(true);
    expect(result.current.complete).toBe(true);
  });
});
