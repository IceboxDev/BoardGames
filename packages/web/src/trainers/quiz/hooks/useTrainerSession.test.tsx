import { DEFAULT_QUIZ_SETTINGS } from "@boardgames/core/protocol";
import type { Article } from "@boardgames/core/quiz/content-types";
import { addDays, newState } from "@boardgames/core/quiz/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api-fetch";

// The session owns its queue: a grade applies `applyReview` locally at once
// (the server's reply only reconciles), an "again" card comes back a few
// positions later, and undo puts everything back. The latest grade is held
// back until the next one (or the tab hiding / the screen closing), so undo
// never reaches the server. A send that fails for a retryable reason is
// queued in the outbox instead of lost.

const TODAY = "2026-09-24";

function article(articleId: string): Article {
  const base = (Number(articleId.slice(1)) - 1) * 5;
  const facts = Array.from({ length: 5 }, (_, q) => {
    const id = `f${String(base + q + 1).padStart(5, "0")}`;
    return {
      id,
      answerEn: `A ${q} en`,
      answerDe: `A ${q} de`,
      spans: { en: [0, 1] as [number, number], de: [0, 1] as [number, number] },
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
      source: { url: `https://example.org/${id}`, title: `Source ${q}`, lang: "en" },
      wordings: [
        {
          id: `w${id.slice(1)}`,
          en: `Q ${id} en`,
          de: `Q ${id} de`,
          origin: "generated" as const,
        },
      ],
    };
  });
  return {
    id: articleId,
    domain: "music-stage",
    sub: "classical",
    images: [],
    titleEn: `Article ${articleId}`,
    titleDe: `Artikel ${articleId}`,
    bodyEn: "A body",
    bodyDe: "A body",
    notesEn: "",
    notesDe: "",
    facts,
  };
}

const QUEUE = {
  today: TODAY,
  items: [
    {
      questionId: "f00001",
      articleId: "a0001",
      domain: "music-stage",
      tier: "new",
      state: null,
      articleStarted: false,
    },
    {
      questionId: "f00006",
      articleId: "a0002",
      domain: "music-stage",
      tier: "new",
      state: null,
      articleStarted: false,
    },
  ],
  counts: { learning: 0, review: 0, new: 2 },
  // Studied earlier today: the day's progress counts on from them.
  doneToday: 3,
};

const submitReviewMock = vi.fn();
const enqueueMock = vi.fn();
const loadArticleMock = vi.fn();

vi.mock("../api", () => ({
  todayKey: () => TODAY,
  queueQuery: () => async () => QUEUE,
  statesQuery: () => async () => ({ states: [] }),
  settingsQuery: () => async () => DEFAULT_QUIZ_SETTINGS,
  putSettings: vi.fn(),
  submitReview: (body: unknown, opts: unknown) => submitReviewMock(body, opts),
}));

// The real content cache (React Query) over stubbed chunk loaders: the hook
// reads the shown card from that cache at event time.
vi.mock("../content", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../content")>();
  return {
    ...mod,
    loadArticle: (id: string) => loadArticleMock(id),
  };
});

vi.mock("../review-outbox", () => ({
  useQuizOutbox: () => ({
    enqueue: enqueueMock,
    flush: vi.fn(),
    pendingCount: 0,
    rejectedCount: 0,
  }),
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
    questionId: `f${String(i * 5 + 1).padStart(5, "0")}`,
    articleId: `a000${i + 1}`,
    domain: "music-stage",
    tier: "new" as const,
  }));
}

beforeEach(() => {
  submitReviewMock.mockReset();
  submitReviewMock.mockResolvedValue({ ok: true, existed: false, applied: true, state: null });
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue(undefined);
  loadArticleMock.mockReset();
  loadArticleMock.mockImplementation(async (id: string) => article(id));
});

afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
});

describe("sessionReducer", () => {
  const ready = (n: number) =>
    sessionReducer(initialSessionState(TODAY), {
      type: "init",
      items: items(n),
      states: {},
      doneBefore: 0,
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
    expect(s.states.f00001).toMatchObject({
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
    expect(s.items[at]).toMatchObject({ questionId: "f00001", tier: "learning" });
    expect(s.reviews[0].insertedAt).toBe(at);
    expect(s.states.f00001).toMatchObject({ state: "learning", dueDate: TODAY });
  });

  it("appends the 'again' copy at the end of a short queue", () => {
    const s = grade(ready(2), "again");
    expect(s.items).toHaveLength(3);
    expect(s.items[2].questionId).toBe("f00001");
  });

  it("undo removes the re-inserted copy and restores the state", () => {
    const graded = grade(ready(8), "again");
    const undone = sessionReducer(graded, { type: "undo", now: 3000 });
    expect(undone.items).toHaveLength(8);
    expect(undone.cursor).toBe(0);
    expect(undone.states.f00001).toBeNull();
    expect(undone.reviews).toHaveLength(0);
    expect(undone.revealed).toBe(true);
  });

  it("undo refuses a grade that has already been committed", () => {
    const graded = grade(ready(3), "good", "a");
    const committed = sessionReducer(graded, { type: "committed", clientId: "client-a" });
    expect(committed.reviews[0].committed).toBe(true);
    expect(sessionReducer(committed, { type: "undo", now: 3000 })).toBe(committed);
  });

  it("reconcile adopts the server state only for the latest review of the card", () => {
    const s = grade(ready(3), "good", "a");
    const prev = s.states.f00001;
    if (!prev) throw new Error("state missing");
    const server = { ...prev, ease: 2.6 };
    const adopted = sessionReducer(s, {
      type: "reconcile",
      questionId: "f00001",
      clientId: "client-a",
      state: server,
    });
    expect(adopted.states.f00001?.ease).toBe(2.6);
    const stale = sessionReducer(s, {
      type: "reconcile",
      questionId: "f00001",
      clientId: "client-old",
      state: server,
    });
    expect(stale).toBe(s);
  });

  it("extend appends only cards not ahead of the cursor and not already graded past today", () => {
    const s = grade(ready(2), "good");
    const extended = sessionReducer(s, {
      type: "extend",
      items: items(3),
      states: {},
      now: 4000,
    });
    // c002 is still pending; c001 was graded "good" in this sitting (due
    // tomorrow locally) — a fresh queue that still lists it, because the
    // grade hasn't reached the server yet, must not deal it again.
    expect(extended.items.map((i) => i.articleId)).toEqual(["a0001", "a0002", "a0003"]);
  });

  it("extend may bring back a card behind the cursor that is due again today", () => {
    // c001 is behind the cursor with a schedule due today (e.g. a relearning
    // step): a fresh queue that lists it deals it again.
    const s = {
      ...ready(1),
      cursor: 1,
      states: { f00001: newState("f00001", TODAY) },
    };
    const extended = sessionReducer(s, { type: "extend", items: items(2), states: {}, now: 4000 });
    expect(extended.items.map((i) => i.articleId)).toEqual(["a0001", "a0001", "a0002"]);
  });
});

describe("useTrainerSession", () => {
  async function started(
    spec: Parameters<typeof useTrainerSession>[0] = { kind: "due", domain: null },
  ) {
    const hook = renderHook(() => useTrainerSession(spec), { wrapper: withClient() });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    await waitFor(() => expect(hook.result.current.current).not.toBeNull());
    return hook;
  }

  it("grades optimistically and holds the latest grade back until the next", async () => {
    const { result } = await started();
    expect(result.current.progress).toEqual({ done: 3, total: 5, inSession: 0 });
    expect(result.current.current?.question.id).toBe("f00001");

    act(() => result.current.reveal());
    expect(result.current.revealed).toBe(true);
    act(() => result.current.grade("good"));

    expect(result.current.progress).toMatchObject({ done: 4, inSession: 1 });
    expect(result.current.lastReview?.next).toMatchObject({
      state: "learning",
      dueDate: addDays(TODAY, 1),
    });
    expect(result.current.canUndo).toBe(true);
    expect(submitReviewMock).not.toHaveBeenCalled();

    // The next grade sends the previous one.
    await waitFor(() => expect(result.current.current?.question.id).toBe("f00006"));
    act(() => result.current.reveal());
    act(() => result.current.grade("again"));
    expect(submitReviewMock).toHaveBeenCalledTimes(1);
    expect(submitReviewMock.mock.calls[0][0]).toMatchObject({
      questionId: "f00001",
      grade: "good",
      localDate: TODAY,
      reviewedAt: expect.any(String),
    });
    expect(result.current.progress).toEqual({ done: 5, total: 6, inSession: 2 });
    expect(result.current.summary.missed.map((m) => m.questionId)).toEqual(["f00006"]);
  });

  it("undo takes back a grade the server never saw, and only that one", async () => {
    const { result } = await started();
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    await waitFor(() => expect(result.current.current?.question.id).toBe("f00006"));
    act(() => result.current.reveal());
    act(() => result.current.grade("again"));

    act(() => result.current.undo());
    expect(result.current.progress).toEqual({ done: 4, total: 5, inSession: 1 });
    expect(result.current.revealed).toBe(true);
    // c001 was already sent with the second grade: it can't be undone.
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.progress.inSession).toBe(1);

    // Re-grade c002: the session completes and commits it — the server sees
    // "good" for c002 and never the undone "again".
    act(() => result.current.grade("good"));
    await waitFor(() => expect(submitReviewMock).toHaveBeenCalledTimes(2));
    expect(result.current.complete).toBe(true);
    const sent = submitReviewMock.mock.calls.map(
      ([body]) => body as { questionId: string; grade: string },
    );
    expect(sent.map((b) => [b.questionId, b.grade])).toEqual([
      ["f00001", "good"],
      ["f00006", "good"],
    ]);
  });

  it("grades a card once even when two key presses land in the same tick", async () => {
    const { result } = await started();
    act(() => result.current.reveal());
    act(() => {
      result.current.grade("good");
      result.current.grade("good");
    });
    expect(result.current.summary.reviewed).toBe(1);
    expect(result.current.progress.inSession).toBe(1);
  });

  it("refuses to reveal or grade a card whose text hasn't loaded", async () => {
    loadArticleMock.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useTrainerSession({ kind: "due", domain: null }), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cardPending).toBe(true);
    act(() => result.current.reveal());
    expect(result.current.revealed).toBe(false);
    act(() => result.current.grade("good"));
    expect(result.current.summary.reviewed).toBe(0);
  });

  it("commits the held-back grade with keepalive when the tab hides", async () => {
    const { result } = await started();
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    expect(submitReviewMock).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(submitReviewMock).toHaveBeenCalledTimes(1);
    expect(submitReviewMock.mock.calls[0][1]).toEqual({ keepalive: true });
    expect(result.current.canUndo).toBe(false);
  });

  it("commits the held-back grade when the screen closes", async () => {
    const { result, unmount } = await started();
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    unmount();
    expect(submitReviewMock).toHaveBeenCalledTimes(1);
    expect(submitReviewMock.mock.calls[0][0]).toMatchObject({ questionId: "f00001" });
  });

  it("queues the review in the outbox when the network fails", async () => {
    submitReviewMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result, unmount } = await started();
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    unmount();
    await waitFor(() => expect(enqueueMock).toHaveBeenCalledTimes(1));
    expect(enqueueMock.mock.calls[0][0]).toMatchObject({
      questionId: "f00001",
      grade: "good",
    });
  });

  it("keeps a review for replay when the session has expired (401)", async () => {
    submitReviewMock.mockRejectedValue(new ApiError(401, "Unauthorized"));
    const { result, unmount } = await started();
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    unmount();
    await waitFor(() => expect(enqueueMock).toHaveBeenCalledTimes(1));
  });

  it("drops a definitively rejected review with a notice", async () => {
    submitReviewMock.mockRejectedValue(new ApiError(404, "question not found"));
    const { result } = await started();
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    await waitFor(() => expect(result.current.current?.question.id).toBe("f00006"));
    act(() => result.current.reveal());
    act(() => result.current.grade("good"));
    await waitFor(() => expect(result.current.notice).toMatch(/not saved/));
    expect(enqueueMock).not.toHaveBeenCalled();
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
