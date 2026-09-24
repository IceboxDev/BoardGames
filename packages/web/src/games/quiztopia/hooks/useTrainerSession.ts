import type {
  ContentQuestion,
  ContentSetArticle,
  ContentSetQuestions,
} from "@boardgames/core/games/quiztopia/content-types";
import {
  parseQuestionId,
  parseSetId,
  QUESTIONS_PER_SET,
  questionId,
} from "@boardgames/core/games/quiztopia/ids";
import {
  applyReview,
  daysBetween,
  newState,
  type QueueTier,
  type SrsGrade,
  type SrsState,
} from "@boardgames/core/games/quiztopia/srs";
import type { QuiztopiaLanguage, ReviewBody } from "@boardgames/core/protocol";
import { type QueryFunctionContext, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiError, SchemaError } from "../../../lib/api-fetch";
import { queueQuery, statesQuery, submitReview, todayKey } from "../api";
import {
  articleSnippet,
  findArticle,
  findQuestion,
  preloadArticles,
  preloadQuestions,
  type Snippet,
} from "../content";
import { useCardArticles, useCardQuestions } from "./useContent";
import { useOfflineReviewQueue } from "./useOfflineReviewQueue";

// One study session, start to summary. The queue is fetched ONCE and then
// owned locally: the server stays the source of truth for the schedule, but
// every grade is applied optimistically with the same `applyReview` the
// server runs, so the card's "next in 3 days" and the summary's due preview
// are exact without a round trip. A review that can't reach the server goes
// to the offline queue; one the server rejects is dropped with a notice.

// ── Spec ──────────────────────────────────────────────────────────────

export type SessionSpec =
  | { kind: "due"; category: number | null; limit?: number }
  | { kind: "set"; setId: string }
  | { kind: "ids"; ids: readonly string[] };

export interface SessionItem {
  questionId: string;
  setId: string;
  cardId: string;
  category: number;
  tier: QueueTier;
}

export interface SessionReview {
  clientId: string;
  questionId: string;
  grade: SrsGrade;
  prev: SrsState | null;
  next: SrsState;
  durationMs: number;
  /** Position of the graded card — where `undo` puts the cursor back. */
  cursorBefore: number;
  /** Index of the re-inserted copy after an "again", so `undo` can remove it. */
  insertedAt: number | null;
  /** The card's text at grade time, for the summary's missed list. */
  question: ContentQuestion | null;
  item: SessionItem;
}

export interface SessionState {
  status: "loading" | "ready";
  today: string;
  items: SessionItem[];
  cursor: number;
  states: Record<string, SrsState | null>;
  reviews: SessionReview[];
  revealed: boolean;
  /** `Date.now()` when the current card was shown — the review's duration base. */
  shownAt: number;
}

export type SessionAction =
  | {
      type: "init";
      items: readonly SessionItem[];
      states: Record<string, SrsState | null>;
      now: number;
    }
  | { type: "reveal" }
  | {
      type: "grade";
      grade: SrsGrade;
      clientId: string;
      now: number;
      nowIso: string;
      question: ContentQuestion | null;
    }
  | { type: "undo"; now: number }
  | { type: "reconcile"; questionId: string; clientId: string; state: SrsState }
  | {
      type: "extend";
      items: readonly SessionItem[];
      states: Record<string, SrsState | null>;
      now: number;
    };

/** An "again" card comes back with at least this many cards in between. */
export const REINSERT_GAP = 3;
const MAX_DURATION_MS = 600_000;

export function initialSessionState(today: string): SessionState {
  return {
    status: "loading",
    today,
    items: [],
    cursor: 0,
    states: {},
    reviews: [],
    revealed: false,
    shownAt: 0,
  };
}

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case "init":
      return {
        ...s,
        status: "ready",
        items: [...a.items],
        states: { ...a.states },
        cursor: 0,
        reviews: [],
        revealed: false,
        shownAt: a.now,
      };
    case "reveal":
      return s.revealed ? s : { ...s, revealed: true };
    case "grade": {
      const item = s.items[s.cursor];
      if (!item || !s.revealed) return s;
      const prev = s.states[item.questionId] ?? null;
      const next = applyReview(prev ?? newState(item.questionId, s.today), a.grade, {
        localDate: s.today,
        now: a.nowIso,
      });
      const items = [...s.items];
      let insertedAt: number | null = null;
      if (a.grade === "again") {
        insertedAt = Math.min(items.length, s.cursor + 1 + REINSERT_GAP);
        items.splice(insertedAt, 0, { ...item, tier: "learning" });
      }
      const durationMs = Math.max(0, Math.min(MAX_DURATION_MS, a.now - s.shownAt));
      return {
        ...s,
        items,
        cursor: s.cursor + 1,
        states: { ...s.states, [item.questionId]: next },
        reviews: [
          ...s.reviews,
          {
            clientId: a.clientId,
            questionId: item.questionId,
            grade: a.grade,
            prev,
            next,
            durationMs,
            cursorBefore: s.cursor,
            insertedAt,
            question: a.question,
            item,
          },
        ],
        revealed: false,
        shownAt: a.now,
      };
    }
    case "undo": {
      // Local only: the review row already exists on the server (reviews are
      // append-only, idempotent on clientId). The schedule the server holds
      // is therefore one grade ahead until the next review of this card —
      // acceptable for a mis-tap, and honest in the summary, which counts
      // only what is left in `reviews`.
      const last = s.reviews[s.reviews.length - 1];
      if (!last) return s;
      const items = [...s.items];
      if (last.insertedAt !== null) items.splice(last.insertedAt, 1);
      const states = { ...s.states };
      states[last.questionId] = last.prev;
      return {
        ...s,
        items,
        cursor: last.cursorBefore,
        states,
        reviews: s.reviews.slice(0, -1),
        revealed: true,
        shownAt: a.now,
      };
    }
    case "reconcile": {
      // Adopt the server's state only while this review is still the latest
      // local word on the card — an undo or a later grade wins otherwise.
      const latest = [...s.reviews].reverse().find((r) => r.questionId === a.questionId);
      if (!latest || latest.clientId !== a.clientId) return s;
      return { ...s, states: { ...s.states, [a.questionId]: a.state } };
    }
    case "extend": {
      const pending = new Set(s.items.slice(s.cursor).map((i) => i.questionId));
      const fresh = a.items.filter((i) => !pending.has(i.questionId));
      if (fresh.length === 0) return s;
      const states = { ...s.states };
      for (const it of fresh) {
        if (!(it.questionId in states)) states[it.questionId] = a.states[it.questionId] ?? null;
      }
      const wasDone = s.cursor >= s.items.length;
      return {
        ...s,
        items: [...s.items, ...fresh],
        states,
        revealed: false,
        shownAt: wasDone ? a.now : s.shownAt,
      };
    }
  }
}

// ── Source ────────────────────────────────────────────────────────────

interface SessionSource {
  items: SessionItem[];
  states: Record<string, SrsState | null>;
}

function tierOf(state: SrsState | null): QueueTier {
  if (!state) return "new";
  return state.state === "review" ? "review" : "learning";
}

function itemFor(id: string, state: SrsState | null): SessionItem | null {
  const p = parseQuestionId(id);
  if (!p) return null;
  return { questionId: id, setId: p.setId, cardId: p.cardId, category: p.n, tier: tierOf(state) };
}

export function specQuestionIds(spec: SessionSpec): string[] {
  if (spec.kind === "set") {
    if (!parseSetId(spec.setId)) return [];
    return Array.from({ length: QUESTIONS_PER_SET }, (_, q) => questionId(spec.setId, q));
  }
  if (spec.kind === "ids") return spec.ids.filter((id) => parseQuestionId(id) !== null);
  return [];
}

// The session snapshot has its OWN key namespace: it must never share a
// cache entry with the raw `queue` / `states` responses other screens hold
// (the wiki article caches `statesQuery` under `qk.quiztopiaStates`, whose
// shape is `{ states }`, not `{ items, states }`).
function sourceKey(spec: SessionSpec, today: string) {
  if (spec.kind === "due") {
    return ["quiztopia", "session", "due", spec.category, today, spec.limit ?? null] as const;
  }
  return ["quiztopia", "session", "ids", specQuestionIds(spec).join(",")] as const;
}

async function fetchSource(
  spec: SessionSpec,
  today: string,
  ctx: QueryFunctionContext,
): Promise<SessionSource> {
  if (spec.kind === "due") {
    const res = await queueQuery({
      today,
      category: spec.category ?? undefined,
      limit: spec.limit,
    })(ctx);
    const states: Record<string, SrsState | null> = {};
    const items = res.items.map((i) => {
      states[i.questionId] = i.state;
      return {
        questionId: i.questionId,
        setId: i.setId,
        cardId: i.cardId,
        category: i.category,
        tier: i.tier,
      };
    });
    return { items, states };
  }
  const ids = specQuestionIds(spec);
  if (ids.length === 0) return { items: [], states: {} };
  const res = await statesQuery(ids)(ctx);
  const byId = new Map(res.states.map((st) => [st.questionId, st]));
  const states: Record<string, SrsState | null> = {};
  const items: SessionItem[] = [];
  for (const id of ids) {
    const st = byId.get(id) ?? null;
    states[id] = st;
    const it = itemFor(id, st);
    if (it) items.push(it);
  }
  return { items, states };
}

// ── Summary ───────────────────────────────────────────────────────────

export interface MissedItem {
  questionId: string;
  item: SessionItem;
  question: ContentQuestion | null;
  /** Times it was graded "again" this session. */
  misses: number;
}

export interface SessionSummary {
  reviewed: number;
  knew: number;
  didnt: number;
  /** 0..1, null before the first grade. */
  accuracy: number | null;
  missed: MissedItem[];
  /** Cards from this session due again on each of the next 7 days (index 0 = today). */
  dueNext7: number[];
  /** Cards that graduated to `review` this session. */
  learned: number;
}

export function summarize(s: SessionState): SessionSummary {
  const reviewed = s.reviews.length;
  const knew = s.reviews.filter((r) => r.grade === "good").length;
  const missedById = new Map<string, MissedItem>();
  let learned = 0;
  for (const r of s.reviews) {
    if (r.grade === "again") {
      const cur = missedById.get(r.questionId);
      if (cur) cur.misses++;
      else {
        missedById.set(r.questionId, {
          questionId: r.questionId,
          item: r.item,
          question: r.question,
          misses: 1,
        });
      }
    }
    if (r.next.state === "review" && r.prev?.state !== "review") learned++;
  }
  const dueNext7 = new Array<number>(7).fill(0);
  for (const st of Object.values(s.states)) {
    if (!st) continue;
    const d = daysBetween(s.today, st.dueDate);
    if (d >= 0 && d < 7) dueNext7[d]++;
  }
  return {
    reviewed,
    knew,
    didnt: reviewed - knew,
    accuracy: reviewed > 0 ? knew / reviewed : null,
    missed: [...missedById.values()],
    dueNext7,
    learned,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────

export interface CurrentCard {
  item: SessionItem;
  set: ContentSetQuestions;
  question: ContentQuestion;
  /** 0 = the card's original question, 1–4 a sibling. */
  q: number;
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useTrainerSession(spec: SessionSpec) {
  const today = useMemo(() => todayKey(), []);
  const qc = useQueryClient();
  const offline = useOfflineReviewQueue();
  const [s, dispatch] = useReducer(sessionReducer, today, initialSessionState);
  const [notice, setNotice] = useState<string | null>(null);

  // The queue snapshot. Fetched once per session — never refetched behind
  // the user's back, since the local list is what they are working through.
  const source = useQuery({
    queryKey: sourceKey(spec, today),
    queryFn: (ctx) => fetchSource(spec, today, ctx),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (s.status === "loading" && source.data) {
      dispatch({
        type: "init",
        items: source.data.items,
        states: source.data.states,
        now: Date.now(),
      });
    }
  }, [s.status, source.data]);

  const item = s.items[s.cursor] ?? null;
  const nextCardId = s.items[s.cursor + 1]?.cardId ?? null;
  const currentCardId = item?.cardId ?? null;

  // Current card's questions; the next card's chunk warms while this one is read.
  const cardQuery = useCardQuestions(currentCardId);
  useEffect(() => {
    if (nextCardId) preloadQuestions(nextCardId);
  }, [nextCardId]);
  // The article is needed on reveal; warming it as soon as the card shows
  // keeps the flip instant without loading chunks for cards never shown.
  useEffect(() => {
    if (currentCardId) preloadArticles(currentCardId);
  }, [currentCardId]);
  const articleQuery = useCardArticles(currentCardId, s.revealed);

  const current: CurrentCard | null = useMemo(() => {
    if (!item || !cardQuery.data) return null;
    const found = findQuestion(cardQuery.data, item.questionId);
    if (!found) return null;
    return { item, set: found.set, question: found.question, q: found.q };
  }, [item, cardQuery.data]);

  const article: ContentSetArticle | null = useMemo(() => {
    if (!item || !articleQuery.data) return null;
    return findArticle(articleQuery.data, item.setId);
  }, [item, articleQuery.data]);

  const snippetFor = useCallback(
    (lang: QuiztopiaLanguage): Snippet | null => {
      if (!article || !current) return null;
      const single = lang === "de" ? "de" : "en";
      const text = single === "de" ? article.articleDe : article.articleEn;
      const span = article.answerSpans[single][current.q];
      return span ? articleSnippet(text, span) : null;
    },
    [article, current],
  );

  const reveal = useCallback(() => dispatch({ type: "reveal" }), []);

  const enqueue = offline.enqueue;
  const grade = useCallback(
    (g: SrsGrade) => {
      const target = s.items[s.cursor];
      if (!target || !s.revealed) return;
      const now = Date.now();
      const clientId = newClientId();
      const durationMs = Math.max(0, Math.min(MAX_DURATION_MS, now - s.shownAt));
      dispatch({
        type: "grade",
        grade: g,
        clientId,
        now,
        nowIso: new Date(now).toISOString(),
        question: current?.question ?? null,
      });
      const body: ReviewBody = {
        clientId,
        questionId: target.questionId,
        grade: g,
        localDate: today,
        durationMs,
      };
      submitReview(body)
        .then((res) => {
          if (res.state) {
            dispatch({
              type: "reconcile",
              questionId: target.questionId,
              clientId,
              state: res.state,
            });
          }
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            setNotice(`This review was not saved (${err.message}).`);
            return;
          }
          if (err instanceof SchemaError) {
            setNotice("Saved, but the reply looked wrong — the schedule will catch up.");
            return;
          }
          // Offline or a server hiccup: keep it and replay later.
          enqueue(body);
        });
    },
    [s.items, s.cursor, s.revealed, s.shownAt, current, today, enqueue],
  );

  const undo = useCallback(() => dispatch({ type: "undo", now: Date.now() }), []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const complete = s.status === "ready" && s.cursor >= s.items.length;
  const summary = useMemo(() => summarize(s), [s]);

  // Anything the hub shows (due counts, streak, heatmap) is stale once a
  // grade has landed — refresh it at the end of the session and, for a
  // session left half-way, on unmount.
  const reviewedCount = s.reviews.length;
  const reviewedRef = useRef(0);
  reviewedRef.current = reviewedCount;
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["quiztopia", "overview"] });
    void qc.invalidateQueries({ queryKey: ["quiztopia", "history"] });
    void qc.invalidateQueries({ queryKey: ["quiztopia", "queue"] });
  }, [qc]);
  const invalidatedRef = useRef(false);
  useEffect(() => {
    if (complete && reviewedCount > 0 && !invalidatedRef.current) {
      invalidatedRef.current = true;
      invalidate();
    }
    if (!complete) invalidatedRef.current = false;
  }, [complete, reviewedCount, invalidate]);
  useEffect(
    () => () => {
      if (reviewedRef.current > 0) invalidate();
    },
    [invalidate],
  );

  /** Fetch a fresh queue and append what is not already ahead of the cursor. */
  const extend = useCallback(async (): Promise<number> => {
    if (spec.kind !== "due") return 0;
    const data = await qc.fetchQuery({
      queryKey: sourceKey(spec, today),
      queryFn: (ctx) => fetchSource(spec, today, ctx),
      staleTime: 0,
    });
    const pending = new Set(s.items.slice(s.cursor).map((i) => i.questionId));
    const fresh = data.items.filter((i) => !pending.has(i.questionId));
    if (fresh.length > 0) {
      dispatch({ type: "extend", items: fresh, states: data.states, now: Date.now() });
      invalidatedRef.current = false;
    }
    return fresh.length;
  }, [spec, today, qc, s.items, s.cursor]);

  const lastReview = s.reviews[s.reviews.length - 1] ?? null;

  return {
    spec,
    today,
    status: s.status,
    loadError: source.error,
    /** The queue came back empty — nothing to do today. */
    empty: s.status === "ready" && s.items.length === 0,
    item,
    current,
    cardPending: cardQuery.isPending,
    article,
    articlePending: s.revealed && articleQuery.isPending,
    snippetFor,
    state: item ? (s.states[item.questionId] ?? null) : null,
    revealed: s.revealed,
    reveal,
    grade,
    undo,
    canUndo: s.reviews.length > 0,
    lastReview,
    progress: { done: s.cursor, total: s.items.length },
    complete,
    summary,
    extend,
    notice,
    offlinePending: offline.pendingCount,
  };
}

export type TrainerSession = ReturnType<typeof useTrainerSession>;
