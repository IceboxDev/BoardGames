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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifySendFailure } from "../../../lib/review-outbox";
import { queueQuery, statesQuery, submitReview, todayKey } from "../api";
import { invalidateAfterReviews } from "../cache";
import { articleSnippet, findArticle, findQuestion, type Snippet } from "../content";
import { useQuiztopiaOutbox } from "../review-outbox";
import {
  cardQuestionsQuery,
  prefetchCardArticles,
  prefetchCardQuestions,
  useCardArticles,
  useCardQuestions,
} from "./useContent";
import { articleLanguage } from "./useQuestionLanguage";

// One study session, start to summary. The queue is fetched ONCE and then
// owned locally: the server stays the source of truth for the schedule, but
// every grade is applied optimistically with the same `applyReview` the
// server runs, so the card's "next in 3 days" and the summary's due preview
// are exact without a round trip.
//
// Commit on advance: the LATEST grade stays local — and undoable — until the
// next grade, "keep going", the tab hiding or the screen closing; only then
// is it sent. So "Undo" really undoes (the server never sees a grade that was
// taken back) and a held-down key can't post a grade twice. Every earlier
// grade is already on its way. A send that can't get through (offline, 5xx,
// expired session, rate limit) waits in the review outbox; one the server
// definitively rejects is dropped with a notice. The one exposure: a tab that
// crashes outright loses its single uncommitted grade.

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
  /** Sent to the server (or handed to the outbox) — no longer undoable. */
  committed: boolean;
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
  /** Questions studied earlier today, before this sitting: the day's progress starts here. */
  doneBefore: number;
}

export type SessionAction =
  | {
      type: "init";
      items: readonly SessionItem[];
      states: Record<string, SrsState | null>;
      doneBefore: number;
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
  | { type: "committed"; clientId: string }
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
    doneBefore: 0,
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
        doneBefore: a.doneBefore,
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
            committed: false,
          },
        ],
        revealed: false,
        shownAt: a.now,
      };
    }
    case "undo": {
      // Only the latest, still-uncommitted grade can be taken back: it has
      // never left this tab, so undoing it is exact on both sides.
      const last = s.reviews[s.reviews.length - 1];
      if (!last || last.committed) return s;
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
    case "committed": {
      const i = s.reviews.findIndex((r) => r.clientId === a.clientId);
      const target = s.reviews[i];
      if (!target || target.committed) return s;
      const reviews = [...s.reviews];
      reviews[i] = { ...target, committed: true };
      return { ...s, reviews };
    }
    case "reconcile": {
      // Adopt the server's state only while this review is still the latest
      // local word on the card — an undo or a later grade wins otherwise.
      const latest = [...s.reviews].reverse().find((r) => r.questionId === a.questionId);
      if (!latest || latest.clientId !== a.clientId) return s;
      return { ...s, states: { ...s.states, [a.questionId]: a.state } };
    }
    case "extend": {
      // A fresh queue may still list a card graded in this sitting whose
      // grade hasn't reached the server yet; its local state (due after
      // today) is the authority, so it is not dealt again.
      const pending = new Set(s.items.slice(s.cursor).map((i) => i.questionId));
      const fresh = a.items.filter((i) => {
        if (pending.has(i.questionId)) return false;
        const local = s.states[i.questionId];
        return !local || daysBetween(s.today, local.dueDate) <= 0;
      });
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
  /** Due sessions: questions already studied today and no longer queued. */
  doneToday?: number;
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
    return { items, states, doneToday: res.doneToday };
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

/** The latest grade, not yet sent: what `undo` can still take back. */
interface PendingCommit {
  clientId: string;
  questionId: string;
  body: ReviewBody;
}

const NOTICE_MS = 6000;

export function useTrainerSession(spec: SessionSpec) {
  const today = useMemo(() => todayKey(), []);
  const qc = useQueryClient();
  const outbox = useQuiztopiaOutbox();
  const { enqueue } = outbox;
  const [notice, setNotice] = useState<string | null>(null);

  // The session lives in a ref as well as in React state. Handlers (keys,
  // buttons, pagehide) read and advance the ref synchronously, so two events
  // in one tick each see the other's effect — a held key can't grade one
  // card twice — and React renders from the very same value.
  const [s, setS] = useState(() => initialSessionState(today));
  const sRef = useRef(s);
  const apply = useCallback((action: SessionAction): SessionState => {
    const prev = sRef.current;
    const next = sessionReducer(prev, action);
    if (next !== prev) {
      sRef.current = next;
      setS(next);
    }
    return next;
  }, []);

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
    if (sRef.current.status === "loading" && source.data) {
      apply({
        type: "init",
        items: source.data.items,
        states: source.data.states,
        doneBefore: source.data.doneToday ?? 0,
        now: Date.now(),
      });
    }
  }, [apply, source.data]);

  const item = s.items[s.cursor] ?? null;
  const nextCardId = s.items[s.cursor + 1]?.cardId ?? null;
  const currentCardId = item?.cardId ?? null;

  // Current card's questions; the next card's chunk warms while this one is read.
  const cardQuery = useCardQuestions(currentCardId);
  useEffect(() => {
    if (nextCardId) prefetchCardQuestions(qc, nextCardId);
  }, [qc, nextCardId]);
  // The article is needed on reveal; warming it as soon as the card shows
  // keeps the flip instant without loading chunks for cards never shown.
  useEffect(() => {
    if (currentCardId) prefetchCardArticles(qc, currentCardId);
  }, [qc, currentCardId]);
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
      const single = articleLanguage(lang);
      const text = single === "de" ? article.articleDe : article.articleEn;
      const span = article.answerSpans[single][current.q];
      return span ? articleSnippet(text, span) : null;
    },
    [article, current],
  );

  /**
   * The card's text, read from the cache at event time: a card whose chunk
   * hasn't arrived can be neither revealed nor graded, whatever the keyboard
   * says — the user would be grading a card they never saw.
   */
  const shownCard = useCallback(
    (target: SessionItem | undefined) => {
      if (!target) return null;
      const card = qc.getQueryData(cardQuestionsQuery(target.cardId).queryKey);
      return card ? findQuestion(card, target.questionId) : null;
    },
    [qc],
  );

  const reveal = useCallback(() => {
    const st = sRef.current;
    if (st.status !== "ready" || !shownCard(st.items[st.cursor])) return;
    apply({ type: "reveal" });
  }, [apply, shownCard]);

  // ── Commit ─────────────────────────────────────────────────────────────

  const pendingRef = useRef<PendingCommit | null>(null);

  const send = useCallback(
    (commit: PendingCommit, opts: { keepalive?: boolean } = {}): Promise<void> => {
      apply({ type: "committed", clientId: commit.clientId });
      return submitReview(commit.body, opts).then(
        (res) => {
          if (!res.state) return;
          apply({
            type: "reconcile",
            questionId: commit.questionId,
            clientId: commit.clientId,
            state: res.state,
          });
        },
        async (err: unknown) => {
          const verdict = classifySendFailure(err);
          if (verdict === "retry") await enqueue(commit.body);
          else if (verdict === "rejected") {
            setNotice(
              `A review was not saved (${err instanceof Error ? err.message : "rejected"}).`,
            );
          }
        },
      );
    },
    [apply, enqueue],
  );

  /** Send the held-back latest grade, if any. Resolves once it is delivered or queued. */
  const commitPending = useCallback(
    (opts: { keepalive?: boolean } = {}): Promise<void> => {
      const commit = pendingRef.current;
      if (!commit) return Promise.resolve();
      pendingRef.current = null;
      return send(commit, opts);
    },
    [send],
  );

  const grade = useCallback(
    (g: SrsGrade) => {
      const prev = sRef.current;
      const target = prev.items[prev.cursor];
      const shown = shownCard(target);
      if (!target || !prev.revealed || !shown) return;
      const now = Date.now();
      const clientId = newClientId();
      const nowIso = new Date(now).toISOString();
      const next = apply({
        type: "grade",
        grade: g,
        clientId,
        now,
        nowIso,
        question: shown.question,
      });
      const review = next.reviews[next.reviews.length - 1];
      if (next === prev || !review || review.clientId !== clientId) return;
      const earlier = pendingRef.current;
      pendingRef.current = {
        clientId,
        questionId: target.questionId,
        body: {
          clientId,
          questionId: target.questionId,
          grade: g,
          localDate: prev.today,
          durationMs: review.durationMs,
          // Graded now, whenever it is sent: keeps the server's ordering of
          // grades true for a commit or an outbox replay that lands later.
          reviewedAt: nowIso,
        },
      };
      if (earlier) void send(earlier);
    },
    [apply, shownCard, send],
  );

  const undo = useCallback(() => {
    const commit = pendingRef.current;
    const prev = sRef.current;
    if (!commit || prev.reviews[prev.reviews.length - 1]?.clientId !== commit.clientId) return;
    if (apply({ type: "undo", now: Date.now() }) !== prev) pendingRef.current = null;
  }, [apply]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  const complete = s.status === "ready" && s.cursor >= s.items.length;
  const summary = useMemo(() => summarize(s), [s]);
  const reviewedCount = s.reviews.length;

  // The summary has no undo, so the last grade commits as the session
  // completes; then everything the summary and hub show (due counts, the
  // lit skyline, streak, heatmap, the wiki's dots) refetches with it in.
  useEffect(() => {
    if (!complete || reviewedCount === 0) return;
    void commitPending().finally(() => invalidateAfterReviews(qc));
  }, [complete, reviewedCount, commitPending, qc]);

  // A tab that hides may never come back (mobile app switch, closed tab):
  // commit with keepalive so the request survives the page.
  useEffect(() => {
    const onHide = () => void commitPending({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [commitPending]);

  // Leaving half-way: commit, then refresh what the hub shows.
  useEffect(
    () => () => {
      if (sRef.current.reviews.length === 0) return;
      void commitPending({ keepalive: true }).finally(() => invalidateAfterReviews(qc));
    },
    [commitPending, qc],
  );

  /** Fetch a fresh queue and append what is not already ahead of the cursor. */
  const extend = useCallback(async (): Promise<number> => {
    if (spec.kind !== "due") return 0;
    await commitPending();
    const data = await qc.fetchQuery({
      queryKey: sourceKey(spec, today),
      queryFn: (ctx) => fetchSource(spec, today, ctx),
      staleTime: 0,
    });
    const before = sRef.current.items.length;
    const next = apply({ type: "extend", items: data.items, states: data.states, now: Date.now() });
    return next.items.length - before;
  }, [spec, today, qc, apply, commitPending]);

  const lastReview = s.reviews[s.reviews.length - 1] ?? null;

  return {
    spec,
    today,
    status: s.status,
    loadError: source.error,
    /** The queue came back empty — nothing to do today. */
    empty: s.status === "ready" && s.items.length === 0,
    /** The whole queue in session order (re-inserted "again" cards included). */
    items: s.items,
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
    /** Only the latest grade, while it is still held back, can be undone. */
    canUndo: lastReview !== null && !lastReview.committed,
    lastReview,
    /** The day's progress: today's earlier sittings count, so picking up again doesn't reset it. */
    progress: {
      done: s.doneBefore + s.cursor,
      total: s.doneBefore + s.items.length,
      /** Cards answered in this sitting. */
      inSession: s.cursor,
    },
    complete,
    summary,
    extend,
    notice,
    /** Reviews waiting in the outbox for the server. */
    offlinePending: outbox.pendingCount,
    /** Reviews the outbox dropped as rejected during this page's lifetime. */
    offlineRejected: outbox.rejectedCount,
  };
}

export type TrainerSession = ReturnType<typeof useTrainerSession>;
