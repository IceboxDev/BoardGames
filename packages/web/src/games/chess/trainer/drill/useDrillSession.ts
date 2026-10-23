/**
 * A drill session's state. A session of one folder studies it whole
 * (`drill.ts:drillQueue` with `whole`): every move you've met there,
 * shuffled, and every new one, taught first; there is no daily budget. A
 * session of no folder reviews what's due, a due folder at a time. A
 * "neighbour" (dealt with its folder, not due itself) moves its schedule
 * only when you miss it.
 *
 * You can't recall a move you've never seen, so a new card is first TAUGHT:
 * the board shows your move and you play it once (no grade). The card then
 * comes back a few cards later as a RECALL, which is its first graded answer,
 * as in the quiz trainers. A graded card is right ("good", or "hard" after a
 * hint) and moves on by itself, or wrong / shown ("again"), which waits and
 * deals it once more later in the session. With nothing due you can still
 * practise, which only moves cards that were due anyway.
 */
import { type DrillCard, drillQueue } from "@boardgames/core/games/chess/trainer/drill";
import type { QueueTier } from "@boardgames/core/trainers/srs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrillSchedule } from "./useDrill";

/** A session of no folder: due folders while they fit. */
const SESSION_LIMIT = 60;
const PRACTICE_SIZE = 20;
/** A taught or missed card comes back this many cards later. */
const COME_BACK_AFTER = 3;
export const NEXT_AFTER_RIGHT_MS = 900;

/**
 * teach   a new move: shown, play it once;     taught  you played it (moving on)
 * ask     your move?                            right   you knew it (moving on)
 * wrong   you played another move (waits)       shown   you asked to see it (waits)
 */
export type Phase = "teach" | "taught" | "ask" | "right" | "wrong" | "shown";

export interface Dealt {
  /** Unique within the session (a card can be dealt more than once). */
  readonly id: number;
  readonly card: DrillCard;
  readonly tier: QueueTier | "practice" | "recall" | "neighbour";
}

export interface DrillState {
  readonly dealt: readonly Dealt[];
  readonly index: number;
  readonly current: Dealt | null;
  readonly phase: Phase;
  readonly hinted: boolean;
  /** The move you played on this card, when it wasn't the one asked for. */
  readonly played: string | null;
  /** A move other than the shown one, while being taught. */
  readonly offMove: boolean;
  readonly right: number;
  readonly missed: number;
  readonly practice: boolean;
  readonly play: (uci: string) => void;
  readonly hint: () => void;
  readonly show: () => void;
  readonly next: () => void;
  readonly startPractice: () => void;
}

const firstPhase = (d: Dealt | undefined): Phase => (d?.tier === "new" ? "teach" : "ask");

/**
 * `sessionKey` names one session (its scope and when it began): a new key
 * deals afresh; null keeps the hook idle.
 */
export function useDrillSession(
  cards: readonly DrillCard[],
  schedule: DrillSchedule,
  sessionKey: string | null,
  /** The deepest folder owning a position: reviews come a folder at a time. */
  ownerOf?: (key: string) => string | undefined,
  /** The session is one folder: study it whole. */
  whole = false,
): DrillState {
  const byKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards]);
  const [dealt, setDealt] = useState<Dealt[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  const [hinted, setHinted] = useState(false);
  const [played, setPlayed] = useState<string | null>(null);
  const [offMove, setOffMove] = useState(false);
  const [right, setRight] = useState(0);
  const [missed, setMissed] = useState(0);
  const [practice, setPractice] = useState(false);
  const [dealtFor, setDealtFor] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const nextId = useRef(1);
  const dealtRef = useRef<Dealt[] | null>(null);
  dealtRef.current = dealt;

  const begin = useCallback((items: Dealt[], isPractice: boolean) => {
    setDealt(items);
    setPractice(isPractice);
    setIndex(0);
    setPhase(firstPhase(items[0]));
    setHinted(false);
    setPlayed(null);
    setOffMove(false);
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (sessionKey === dealtFor) return;
    setDealt(null);
    setRight(0);
    setMissed(0);
    setDealtFor(sessionKey);
  }, [sessionKey, dealtFor]);

  // Dealt once when the schedule is there: the session doesn't reshuffle as you answer.
  useEffect(() => {
    if (sessionKey === null || sessionKey !== dealtFor) return;
    if (dealt || !schedule.states || !schedule.overview) return;
    const queue = drillQueue({
      cards,
      states: schedule.states,
      today: schedule.today,
      newBudget: 0,
      limit: SESSION_LIMIT,
      whole,
      ownerOf,
      seed: seedOf(`${schedule.today}:${sessionKey}`),
    });
    begin(
      queue.flatMap((q) => {
        const card = byKey.get(q.questionId);
        return card ? [{ id: nextId.current++, card, tier: q.tier }] : [];
      }),
      false,
    );
  }, [sessionKey, dealtFor, dealt, schedule, cards, byKey, begin, ownerOf, whole]);

  const current = dealt?.[index] ?? null;

  /** Deal `card` again a few cards from now, as a recall. */
  const comeBack = useCallback(
    (card: DrillCard) => {
      setDealt((d) => {
        if (!d) return d;
        const at = Math.min(d.length, index + 1 + COME_BACK_AFTER);
        const copy = [...d];
        copy.splice(at, 0, { id: nextId.current++, card, tier: "recall" });
        return copy;
      });
    },
    [index],
  );

  const indexRef = useRef(index);
  indexRef.current = index;
  const next = useCallback(() => {
    const i = indexRef.current + 1;
    setIndex(i);
    setPhase(firstPhase(dealtRef.current?.[i]));
    setHinted(false);
    setPlayed(null);
    setOffMove(false);
    shownAt.current = Date.now();
  }, []);

  const grade = useCallback(
    (ok: boolean, playedUci: string | null) => {
      if (!current) return;
      // A card that wasn't due (practice, a due folder's neighbour) keeps its
      // schedule when you know it; a miss is a miss whenever it happens.
      const extra = practice || current.tier === "neighbour";
      schedule.grade(
        current.card.key,
        ok ? (hinted ? "hard" : "good") : "again",
        { played: playedUci, expected: current.card.uci, hinted },
        Date.now() - shownAt.current,
        extra && ok ? "drill" : "trainer",
      );
    },
    [current, hinted, schedule, practice],
  );

  const play = useCallback(
    (uci: string) => {
      if (!current) return;
      if (phase === "teach") {
        if (uci !== current.card.uci) {
          setOffMove(true);
          return;
        }
        setPhase("taught");
        comeBack(current.card);
        return;
      }
      if (phase !== "ask") return;
      if (uci === current.card.uci) {
        grade(true, uci);
        setRight((n) => n + 1);
        setPhase("right");
      } else {
        grade(false, uci);
        setMissed((n) => n + 1);
        setPlayed(uci);
        setPhase("wrong");
        comeBack(current.card);
      }
    },
    [current, phase, grade, comeBack],
  );

  // A right answer, or a taught move played, moves on by itself.
  useEffect(() => {
    if (phase !== "right" && phase !== "taught") return;
    const t = setTimeout(next, NEXT_AFTER_RIGHT_MS);
    return () => clearTimeout(t);
  }, [phase, next]);

  const show = useCallback(() => {
    if (!current || phase !== "ask") return;
    grade(false, null);
    setMissed((n) => n + 1);
    setPhase("shown");
    comeBack(current.card);
  }, [current, phase, grade, comeBack]);

  const startPractice = useCallback(() => {
    if (!schedule.states) return;
    const states = schedule.states;
    // The cards you'd see soonest anyway; never-seen ones are taught first.
    const order = [...cards].sort((a, b) => {
      const da = states.get(a.key)?.dueDate ?? "9999";
      const db = states.get(b.key)?.dueDate ?? "9999";
      return da.localeCompare(db) || b.following - a.following;
    });
    begin(
      order.slice(0, PRACTICE_SIZE).map((card) => ({
        id: nextId.current++,
        card,
        tier: states.has(card.key) ? ("practice" as const) : ("new" as const),
      })),
      true,
    );
  }, [cards, schedule.states, begin]);

  return {
    dealt: dealt ?? [],
    index,
    current,
    phase,
    hinted,
    played,
    offMove,
    right,
    missed,
    practice,
    play,
    hint: () => setHinted(true),
    show,
    next,
    startPractice,
  };
}

function seedOf(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h >>> 0;
}
