import { hashSeed } from "@boardgames/core/games/quiztopia/ids";
import type { GeoOverview, GeoReviewBody } from "@boardgames/core/protocol";
import {
  cardId,
  continentOf,
  type GeoCatalog,
  modeOf,
  parseCardId,
  type Stage,
} from "@boardgames/core/trainers/geography/catalog";
import type { ContinentId } from "@boardgames/core/trainers/geography/content-types";
import { gradeOf, type Verdict } from "@boardgames/core/trainers/geography/grading";
import { placeDone, unlockedBy } from "@boardgames/core/trainers/geography/ladder";
import { buildGeoSession, type GeoSessionItem } from "@boardgames/core/trainers/geography/session";
import {
  applyReview,
  newState,
  type SrsGrade,
  type SrsState,
  seededShuffle,
} from "@boardgames/core/trainers/srs";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, SchemaError } from "../../lib/api-fetch";
import { submitReview } from "./api";
import type { LonLat } from "./globe/geo";
import { useGeoOfflineQueue } from "./offline-queue";

// One study sitting. Every card is a stage of a place (see STAGES in the
// core catalog): the easiest stage is the lesson itself — borders and the
// name on screen, click it, see it light up — so there is no separate
// "learn" phase. Answers are graded on the spot, the local schedule advances
// with the same `applyReview` the server runs, and the review is posted (or
// queued offline). Clearing a stage queues the place's next stage at the end
// of the sitting; a miss comes back three cards later; clearing the last
// stage may open a new depth (a continent's countries, a subregion's cities).

export type GeoSpec =
  /** The day's session; `group` = the new group picked (null: none; absent: the suggestion). */
  | { kind: "daily"; group?: string | null }
  /** Free practice of the finished places on one continent. */
  | { kind: "drill"; continent: ContinentId };

export const REINSERT_GAP = 3;
/** Attempts at one card in one sitting. */
export const MAX_TRIES = 3;
/** Chance that a correct name-stage answer seeds a decoy later in the round. */
export const DECOY_CHANCE = 0.15;
const DRILL_SIZE = 25;
const MAX_DURATION_MS = 120_000;

export interface AnswerInput {
  verdict: Verdict | "skipped";
  hint: boolean;
  typo?: boolean;
  typed?: string;
  pin?: LonLat;
  distanceKm?: number;
  confusedWith?: string | null;
}

export interface Answered extends AnswerInput {
  item: SessionCard;
  grade: SrsGrade;
  next: SrsState;
  /** Places this answer opened (the last stage of a continent or subregion cleared). */
  opened: number;
  /** A miss that will be asked again this sitting. */
  retryQueued: boolean;
}

export interface SessionCard extends GeoSessionItem {
  /** A contrast follow-up: rescheduled only if due anyway. */
  contrast?: boolean;
  /** Missed earlier this sitting, asked again. */
  retry?: boolean;
  /**
   * A place already answered this round, asked again unannounced so the
   * name stages can't be solved by elimination. Practice only.
   */
  decoy?: boolean;
}

type Status = "ask" | "reveal" | "done";

interface State {
  status: Status;
  items: SessionCard[];
  cursor: number;
  shownAt: number;
  hints: number;
  last: Answered | null;
  results: Answered[];
  states: Map<string, SrsState>;
  contrasted: Set<string>;
  /** Each place the sitting set out with → the cards it needs (its stages left, or one review). */
  plan: Map<string, number>;
}

type Action =
  | { type: "hint" }
  | {
      type: "answer";
      answered: Answered;
      /** Asked again a few cards later (a miss). */
      retry: SessionCard | null;
      /** The place's next stage, queued among the next round. */
      followUp: SessionCard | null;
      /** 0–1, where in the next round the follow-up lands. */
      rand: number;
      /** An already-answered place to ask again later in this round. */
      decoy: SessionCard | null;
      decoyRand: number;
      contrast: SessionCard | null;
    }
  | { type: "next"; now: number };

/**
 * Put a place's next stage anywhere among the upcoming cards of that stage,
 * so every round comes in a fresh order — never straight after the card
 * just answered (the same place twice in a row). Mutates `items`.
 */
export function insertFollowUp(
  items: SessionCard[],
  cursor: number,
  followUp: SessionCard,
  rand: number,
): void {
  let from = items.length;
  for (let i = cursor + 1; i < items.length; i++) {
    if (items[i].stage === followUp.stage && items[i].tier !== "review") {
      from = i;
      break;
    }
  }
  const earliest = Math.min(items.length, Math.max(from, cursor + 2));
  const at = earliest + Math.floor(rand * (items.length - earliest + 1));
  items.splice(Math.min(items.length, at), 0, followUp);
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "hint":
      return { ...s, hints: s.hints + 1 };
    case "answer": {
      const items = [...s.items];
      if (a.retry) items.splice(Math.min(items.length, s.cursor + 1 + REINSERT_GAP), 0, a.retry);
      if (a.followUp) insertFollowUp(items, s.cursor, a.followUp, a.rand);
      if (a.decoy) insertFollowUp(items, s.cursor, a.decoy, a.decoyRand);
      const contrasted = new Set(s.contrasted);
      if (a.contrast) {
        items.splice(Math.min(items.length, s.cursor + 2), 0, a.contrast);
        contrasted.add(a.contrast.placeId);
      }
      const states = new Map(s.states);
      states.set(a.answered.item.cardId, a.answered.next);
      return {
        ...s,
        status: "reveal",
        items,
        last: a.answered,
        results: [...s.results, a.answered],
        states,
        contrasted,
      };
    }
    case "next": {
      const cursor = s.cursor + 1;
      if (cursor >= s.items.length) return { ...s, status: "done", cursor, last: null };
      return { ...s, status: "ask", cursor, hints: 0, last: null, shownAt: a.now };
    }
  }
}

function drillItems(
  catalog: GeoCatalog,
  states: ReadonlyMap<string, SrsState>,
  continent: ContinentId,
  seed: number,
): SessionCard[] {
  const items: SessionCard[] = [];
  for (const s of states.values()) {
    const parsed = parseCardId(s.questionId);
    if (!parsed || parsed.stage < 3) continue;
    const place = catalog.byId.get(parsed.placeId);
    if (!place || place.kind === "continent" || continentOf(catalog, place) !== continent) continue;
    if (!placeDone(states, place.id)) continue;
    items.push({
      cardId: s.questionId,
      placeId: place.id,
      stage: parsed.stage,
      tier: "review",
      state: s,
    });
  }
  // One card per place.
  const seen = new Set<string>();
  return seededShuffle(items, seed)
    .filter((it) => !seen.has(it.placeId) && seen.add(it.placeId))
    .slice(0, DRILL_SIZE);
}

function initialState(
  catalog: GeoCatalog,
  overview: GeoOverview,
  spec: GeoSpec,
  today: string,
  seedKey: string,
): State {
  const states = new Map(overview.states.map((s) => [s.questionId, s as SrsState]));
  const now = Date.now();
  const items =
    spec.kind === "drill"
      ? drillItems(catalog, states, spec.continent, hashSeed(`${seedKey}:${now}`))
      : buildGeoSession({
          catalog,
          states: overview.states,
          settings: { focus: overview.settings.focus },
          group: spec.group,
          today,
          seedKey,
          includeLeeches: overview.settings.includeLeeches,
        });
  // Reviews first, then the climbing and new places — in a new order every
  // sitting, so no one learns the sequence instead of the map.
  const shuffled = [
    ...items.filter((it) => it.tier === "review"),
    ...shuffleRandom(items.filter((it) => it.tier !== "review")),
  ];
  return {
    status: shuffled.length ? "ask" : "done",
    items: shuffled,
    cursor: 0,
    shownAt: now,
    hints: 0,
    last: null,
    results: [],
    states,
    contrasted: new Set(),
    plan: new Map(shuffled.map((it) => [it.placeId, it.tier === "review" ? 1 : 5 - it.stage])),
  };
}

export interface SessionProgress {
  placesDone: number;
  places: number;
  /** 0–1: stages cleared (a place finished for today counts in full). */
  fraction: number;
}

/**
 * How far through the sitting the learner is, against what it set out
 * with: retries, next stages, decoys and contrasts never grow the total.
 */
export function sessionProgress(
  plan: ReadonlyMap<string, number>,
  items: readonly SessionCard[],
  results: readonly Answered[],
): SessionProgress {
  const extra = (it: SessionCard) => it.decoy === true || it.contrast === true;
  const upcoming = items.slice(results.length);
  let placesDone = 0;
  let steps = 0;
  let cleared = 0;
  for (const [placeId, need] of plan) {
    steps += need;
    if (!upcoming.some((it) => it.placeId === placeId && !extra(it))) {
      placesDone++;
      cleared += need;
      continue;
    }
    const right = results.filter(
      (r) => r.item.placeId === placeId && !extra(r.item) && r.grade !== "again",
    ).length;
    cleared += Math.min(need, right);
  }
  return { placesDone, places: plan.size, fraction: steps ? cleared / steps : 1 };
}

function shuffleRandom<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useGeoSession(opts: {
  catalog: GeoCatalog;
  overview: GeoOverview;
  spec: GeoSpec;
  today: string;
  seedKey: string;
}) {
  const { catalog, overview, spec, today, seedKey } = opts;
  const [s, dispatch] = useReducer(reducer, null, () =>
    initialState(catalog, overview, spec, today, seedKey),
  );
  const offline = useGeoOfflineQueue();
  const qc = useQueryClient();
  const current = s.status === "ask" || s.status === "reveal" ? s.items[s.cursor] : undefined;
  const place = current ? catalog.byId.get(current.placeId) : undefined;

  const answer = useCallback(
    (input: AnswerInput) => {
      if (s.status !== "ask" || !current) return;
      const now = Date.now();
      const durationMs = Math.max(0, Math.min(MAX_DURATION_MS, now - s.shownAt));
      // A stage is only cleared by getting it right: while a place climbs its
      // stages, a near miss is a miss (it comes back in a few cards). The
      // "close enough" leniency is for reviews of places already learned.
      const climbing = current.tier !== "review";
      const grade: SrsGrade =
        input.verdict === "skipped" || (input.verdict === "near" && climbing)
          ? "again"
          : gradeOf({
              verdict: input.verdict,
              hint: input.hint,
              typo: input.typo,
              durationMs,
              direction: modeOf(current.stage),
            });
      const prev = s.states.get(current.cardId) ?? newState(current.cardId, today);
      const drill = spec.kind === "drill" || current.contrast === true || current.decoy === true;
      const counts = !drill || prev.dueDate <= today;
      const next = counts
        ? applyReview(prev, grade, { localDate: today, now: new Date(now).toISOString() })
        : prev;
      const after = new Map(s.states);
      after.set(current.cardId, next);

      let retry: SessionCard | null = null;
      let followUp: SessionCard | null = null;
      let opened = 0;
      if (grade === "again" && current.decoy) {
        // A decoy missed is shown and corrected; the place's own cards carry on.
      } else if (grade === "again") {
        // Back in a few cards — but not forever: after MAX_TRIES misses the
        // card rests until tomorrow instead of stalling the sitting.
        const tries = s.results.filter((r) => r.item.cardId === current.cardId).length + 1;
        if (tries < MAX_TRIES) retry = { ...current, state: next, retry: true };
      } else if (current.tier !== "review" && !drill) {
        if (current.stage < 4) {
          const stage = (current.stage + 1) as Stage;
          const id = cardId(current.placeId, stage);
          followUp = {
            cardId: id,
            placeId: current.placeId,
            stage,
            tier: "stage",
            state: after.get(id) ?? null,
          };
        } else if (place && placeDone(after, place.id)) {
          opened = unlockedBy(catalog, after, place).length;
        }
      }

      // A mix-up with another finished place: ask that one once, soon.
      let contrast: SessionCard | null = null;
      const other = input.confusedWith;
      const otherPlace = other ? catalog.byId.get(other) : undefined;
      if (
        other &&
        grade === "again" &&
        // Only like with like: a city with a city, a country with a country.
        otherPlace?.kind === place?.kind &&
        !s.contrasted.has(other) &&
        placeDone(s.states, other)
      ) {
        const stage = current.stage >= 3 ? current.stage : 3;
        const otherCard = cardId(other, stage);
        const upcoming = s.items.slice(s.cursor + 1).some((it) => it.placeId === other);
        if (!upcoming) {
          contrast = {
            cardId: otherCard,
            placeId: other,
            stage,
            tier: "review",
            state: s.states.get(otherCard) ?? null,
            contrast: true,
          };
        }
      }
      // Keep the name stages honest: now and then, a place already answered
      // this round comes back, so what's left can't be worked out by elimination.
      let decoy: SessionCard | null = null;
      if (
        grade !== "again" &&
        !drill &&
        (current.stage === 2 || current.stage === 4) &&
        Math.random() < DECOY_CHANCE
      ) {
        const pool = s.results.filter(
          (r) =>
            r.item.stage === current.stage &&
            r.grade !== "again" &&
            r.item.placeId !== current.placeId &&
            !r.item.decoy,
        );
        const pickFrom = pool[Math.floor(Math.random() * pool.length)];
        if (pickFrom) {
          const already = s.items.filter((it) => it.decoy && it.placeId === pickFrom.item.placeId);
          if (already.length === 0) {
            decoy = {
              ...pickFrom.item,
              state: s.states.get(pickFrom.item.cardId) ?? null,
              decoy: true,
              retry: false,
            };
          }
        }
      }
      dispatch({
        type: "answer",
        answered: { ...input, item: current, grade, next, opened, retryQueued: retry !== null },
        retry,
        followUp,
        contrast,
        rand: Math.random(),
        decoy,
        decoyRand: Math.random(),
      });

      const body: GeoReviewBody = {
        clientId: newClientId(),
        cardId: current.cardId,
        grade,
        localDate: today,
        durationMs,
        source: drill ? "drill" : "trainer",
        outcome: {
          verdict: input.verdict,
          hint: input.hint,
          typo: input.typo,
          distanceKm:
            input.distanceKm === undefined
              ? undefined
              : Math.min(21_000, Math.round(input.distanceKm)),
          typed: input.typed?.slice(0, 80),
          confusedWith: input.confusedWith ?? null,
        },
      };
      submitReview(body).catch((err: unknown) => {
        // A 4xx means the review itself is bad (unknown card): drop it.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return;
        if (err instanceof SchemaError) return;
        offline.enqueue(body);
      });
    },
    [s, current, place, spec.kind, today, offline, catalog],
  );

  const next = useCallback(() => dispatch({ type: "next", now: Date.now() }), []);
  const hint = useCallback(() => dispatch({ type: "hint" }), []);

  // Leaving (or finishing) refreshes the hub's numbers.
  const done = s.status === "done";
  const qcRef = useRef(qc);
  qcRef.current = qc;
  useEffect(() => {
    if (done) void qcRef.current.invalidateQueries({ queryKey: ["geography", "overview"] });
  }, [done]);
  useEffect(
    () => () => {
      void qcRef.current.invalidateQueries({ queryKey: ["geography", "overview"] });
      void qcRef.current.invalidateQueries({ queryKey: ["geography", "history"] });
    },
    [],
  );

  return {
    status: s.status,
    items: s.items,
    cursor: s.cursor,
    current,
    place,
    hints: s.hints,
    last: s.last,
    results: s.results,
    states: s.states,
    progress: sessionProgress(s.plan, s.items, s.results),
    answer,
    next,
    hint,
    pendingCount: offline.pendingCount,
  };
}
