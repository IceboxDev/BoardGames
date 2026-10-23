/**
 * A drill session on screen (state in `drill/useDrillSession.ts`).
 *
 * Board: each card opens on the position before it and plays the opponent's
 * move in, so you answer a move, not a still picture. A new move is shown
 * with an arrow and you play it once; a review asks for it. Once answered the
 * board plays your move (right or wrong), with the arrow kept on it.
 * Action bar: hint, show the move, skip / next. Side rail: the session's
 * progress, this position (the line to it, how often you reached it, and,
 * once answered, the move with its evaluation and what you played in your
 * games) and the folder's progress.
 */
import { type Learning, learnable } from "@boardgames/core/games/chess/trainer/drill";
import type { TreeNode } from "@boardgames/core/games/chess/trainer/tree";
import { useEffect, useMemo, useState } from "react";
import { Button, MicroLabel, ProgressBar } from "../../../../components/ui";
import ChessBoard, { type BoardArrow } from "../../components/board/ChessBoard";
import type { DrillSchedule } from "../drill/useDrill";
import type { Dealt, DrillState } from "../drill/useDrillSession";
import { fenAfter, legalUcis, moveLabel, type Step, sanOf, scoreText } from "../tree-nav";
import { START, walkLine } from "./model";

/** How long the position before a card shows before the opponent's move comes in. */
const ENTER_MS = 450;

const PIECE: Record<string, string> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
};

/** "Move your knight", from the answer's SAN. */
function hintText(san: string): string {
  if (san.startsWith("O-O")) return "Castle";
  return `Move your ${PIECE[san[0] ?? ""] ?? "pawn"}`;
}

const TIER_LABEL: Record<Dealt["tier"], string> = {
  learning: "Learning",
  review: "Review",
  new: "New move",
  recall: "New move · recall",
  practice: "Practice",
  neighbour: "Review · same folder",
};

/** The line to a card as text: "1. e4 e5 2. Nf3 Nc6 3. ?" */
function lineText(route: readonly Step[]): string {
  const parts = route.map((s, i) => (i % 2 === 0 ? moveLabel(i, s.san) : s.san));
  const next = route.length % 2 === 0 ? `${route.length / 2 + 1}. ?` : "?";
  return [...parts, next].join(" ");
}

const answered = (s: DrillState) => s.phase !== "ask" && s.phase !== "teach";

export function DrillBoard({
  session,
  color,
  size,
  route,
  folderOf,
  loading,
}: {
  session: DrillState;
  color: "w" | "b";
  size: number;
  /** The tree's line to the current card (null when it has none). */
  route: readonly Step[] | null;
  folderOf: (key: string) => string;
  loading: boolean;
}) {
  const current = session.current;
  const card = current?.card ?? null;
  // The position before the card, then the opponent's move into it.
  const before = useMemo(() => {
    if (!route || route.length === 0) return null;
    const prev = walkLine(route.slice(0, -1).map((s) => s.uci)).at(-1) ?? START;
    return { fen: prev.fen, uci: route.at(-1)?.uci ?? null };
  }, [route]);
  const [entered, setEntered] = useState(false);
  const dealtId = current?.id ?? null;
  useEffect(() => {
    setEntered(false);
    if (dealtId === null) return;
    const t = setTimeout(() => setEntered(true), ENTER_MS);
    return () => clearTimeout(t);
  }, [dealtId]);

  const done = answered(session);
  const fen = !card
    ? START.fen
    : done
      ? (fenAfter(card.fen, card.uci) ?? card.fen)
      : entered || !before
        ? card.fen
        : before.fen;
  const lastMove = !card ? null : done ? card.uci : entered ? (before?.uci ?? null) : null;
  const moves = useMemo(
    () =>
      card && entered && (session.phase === "ask" || session.phase === "teach")
        ? legalUcis(card.fen)
        : [],
    [card, entered, session.phase],
  );
  const arrows = useMemo((): BoardArrow[] => {
    if (!card) return [];
    const show = session.phase === "teach" ? entered : session.phase !== "ask";
    return show
      ? [{ from: card.uci.slice(0, 2), to: card.uci.slice(2, 4), tone: "best", emphasis: true }]
      : [];
  }, [card, session.phase, entered]);

  if (loading) {
    return <p className="m-auto text-fg-muted text-sm">Loading your schedule…</p>;
  }
  if (!card) {
    const ended = session.dealt.length > 0;
    return (
      <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="m-0 font-bold text-2xl text-fg-strong">
          {ended ? "Session done" : "All caught up"}
        </h2>
        <p className="m-0 text-fg-secondary text-sm">
          {ended
            ? `${session.right} right, ${session.missed} to look at again.`
            : "Nothing is due here and today's new moves are in. You can still practise."}
        </p>
        <Button variant="primary" onClick={session.startPractice}>
          {ended ? "Practise more" : "Practise anyway"}
        </Button>
      </div>
    );
  }

  const playedSan = session.played ? sanOf(card.fen, session.played) : null;
  const status = {
    teach: session.offMove ? `Not that one: play ${card.san}.` : `New move: ${card.san}. Play it.`,
    taught: "Got it. It comes back in a few cards.",
    ask: session.hinted ? `${hintText(card.san)}.` : "Your move.",
    right: `Right: ${card.san}.`,
    wrong: `You played ${playedSan}. Your move here is ${card.san}.`,
    shown: `Your move here is ${card.san}.`,
  }[session.phase];
  const tone =
    session.phase === "right" || session.phase === "taught"
      ? "text-emerald-300"
      : session.phase === "wrong" || session.phase === "shown" || session.offMove
        ? "text-amber-300"
        : "text-fg-secondary";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-end justify-between gap-3" style={{ width: size }}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-bold text-fg-strong text-lg">{folderOf(card.key)}</span>
          <span className="truncate font-mono text-2xs text-fg-muted">
            {route ? lineText(route) : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-fg-secondary text-xs">{TIER_LABEL[current?.tier ?? "new"]}</span>
          <span className="font-mono text-2xs text-fg-muted tabular-nums">
            {session.index + 1} / {session.dealt.length}
          </span>
        </span>
      </div>
      <div style={{ width: size, height: size }}>
        <ChessBoard
          className="size-full overflow-hidden rounded-card-md shadow-lg"
          fen={fen}
          orientation={color}
          moves={moves}
          onMove={session.play}
          keyboard={false}
          lastMove={lastMove}
          arrows={arrows}
          aria-label={`Drill position, ${color === "w" ? "White" : "Black"} to move`}
        />
      </div>
      <div className="flex h-9 items-center justify-between gap-3" style={{ width: size }}>
        <p aria-live="polite" className={`m-0 min-w-0 truncate font-semibold ${tone}`}>
          {status}
        </p>
        <DrillControls session={session} />
      </div>
    </div>
  );
}

/** The drill's buttons, beside the status under the board. */
function DrillControls({ session }: { session: DrillState }) {
  const asking = session.phase === "ask" && session.current !== null;
  const teaching = session.phase === "teach" && session.current !== null;
  const waiting =
    (session.phase === "wrong" || session.phase === "shown") && session.current !== null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" disabled={!asking || session.hinted} onClick={session.hint}>
        Hint
      </Button>
      <Button variant="ghost" size="sm" disabled={!asking} onClick={session.show}>
        Show
      </Button>
      {waiting ? (
        <Button variant="primary" size="sm" onClick={session.next}>
          Next
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={!asking && !teaching} onClick={session.next}>
          Skip
        </Button>
      )}
    </span>
  );
}

export function DrillRail({
  session,
  schedule,
  scope,
  scopeLearning,
  node,
  route,
}: {
  session: DrillState;
  schedule: DrillSchedule;
  scope: string;
  scopeLearning: Learning;
  /** The tree's node for the current card. */
  node: TreeNode | null;
  route: readonly Step[] | null;
}) {
  const o = schedule.overview;
  const card = session.current?.card ?? null;
  const total = session.dealt.length;
  const reveal = card !== null && session.phase !== "ask";
  const best = node?.engine?.[0];
  const history = node?.history ?? [];
  const gamesHere = history.reduce((t, h) => t + h.games, 0);
  const yours = history.find((h) => h.uci === card?.uci)?.games ?? 0;
  const others = history.filter((h) => h.uci !== card?.uci);
  const folderCards = learnable(scopeLearning);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <MicroLabel>{session.practice ? "Practice" : "Session"}</MicroLabel>
        <h2 className="m-0 font-bold text-fg-strong text-xl">{scope}</h2>
        <ProgressBar
          label="Session progress"
          value={total > 0 ? Math.min(session.index, total) / total : 0}
        />
        <span className="text-fg-muted text-xs">
          {Math.min(session.index + (card ? 1 : 0), total)} of {total} ·{" "}
          <span className="text-emerald-300">{session.right} right</span> ·{" "}
          <span className="text-amber-300">{session.missed} missed</span>
        </span>
      </div>

      {card && (
        <div className="flex flex-col gap-2">
          <MicroLabel>This position</MicroLabel>
          {route && <span className="font-mono text-fg-secondary text-xs">{lineText(route)}</span>}
          <span className="text-fg-secondary text-sm">
            {node?.following
              ? `You reached it in ${node.following.toLocaleString()} of your games.`
              : "Past the end of your games: the farm's extension."}
          </span>
          {reveal ? (
            <dl className="m-0 flex flex-col text-sm">
              <div className="flex justify-between border-line-soft border-b py-1.5">
                <dt className="text-fg-muted">Your move</dt>
                <dd className="m-0 font-mono text-fg-strong">{card.san}</dd>
              </div>
              {best && (
                <div className="flex justify-between border-line-soft border-b py-1.5">
                  <dt className="text-fg-muted">Evaluation</dt>
                  <dd className="m-0 font-mono text-fg-primary">
                    {scoreText(card.fen, best)} · d{best.depth}
                    {node?.evalSource ? ` · ${node.evalSource}` : ""}
                  </dd>
                </div>
              )}
              {gamesHere > 0 && (
                <div className="flex justify-between border-line-soft border-b py-1.5">
                  <dt className="text-fg-muted">You played it</dt>
                  <dd className="m-0 font-mono text-fg-primary">
                    {yours} of {gamesHere} games
                  </dd>
                </div>
              )}
              {others.length > 0 && (
                <div className="flex justify-between gap-3 py-1.5">
                  <dt className="shrink-0 text-fg-muted">Instead you played</dt>
                  <dd className="m-0 text-right font-mono text-fg-secondary">
                    {others.map((h) => `${h.san} ×${h.games}`).join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <span className="text-fg-muted text-xs">The answer shows once you've moved.</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <MicroLabel>{scope}</MicroLabel>
        <ProgressBar
          label={`${scope}: moves learnt`}
          value={folderCards > 0 ? scopeLearning.learnt / folderCards : 0}
        />
        <span className="text-fg-muted text-xs">
          {scopeLearning.learnt} of {folderCards} of your moves learnt · {scopeLearning.learning}{" "}
          learning
        </span>
      </div>

      {o && (
        <div className="mt-auto flex flex-col gap-1 border-line-soft border-t pt-3 text-fg-muted text-xs">
          <span>
            Today: {o.today.reviews} answers, {o.today.correct} right
          </span>
          <span>
            Streak {o.streak.current} {o.streak.current === 1 ? "day" : "days"}
            {o.retention30 !== null
              ? ` · ${Math.round(o.retention30 * 100)}% kept over 30 days`
              : ""}
          </span>
          {schedule.pending > 0 && (
            <span>{schedule.pending} answers waiting to reach the server</span>
          )}
        </div>
      )}
    </div>
  );
}
