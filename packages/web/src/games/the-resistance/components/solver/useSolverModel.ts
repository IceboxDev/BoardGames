import type { ResistanceRecord } from "@boardgames/core/games/the-resistance/record";
import {
  openProposal,
  type TablePosition,
  tablePosition,
} from "@boardgames/core/games/the-resistance/rules";
import type { Assumptions } from "@boardgames/core/games/the-resistance/solver/assumptions";
import {
  deductions,
  type SeatNamer,
} from "@boardgames/core/games/the-resistance/solver/deductions";
import { gradeDecisions } from "@boardgames/core/games/the-resistance/solver/grade";
import { gameValueCurve } from "@boardgames/core/games/the-resistance/solver/lookahead";
import {
  analyze,
  type Perspective,
  pairMatrix,
} from "@boardgames/core/games/the-resistance/solver/posterior";
import { rankTeams, teamOdds } from "@boardgames/core/games/the-resistance/solver/recommend";
import { recordUpTo } from "@boardgames/core/games/the-resistance/solver/simulate";
import { useMemo } from "react";
import { envFor } from "../../logic/solver";

function situationOf(position: TablePosition) {
  return {
    successes: position.successes,
    fails: position.fails,
    rejections: position.rejections,
  };
}

/**
 * Everything the dashboard shows, derived from one record. `cursor` is how
 * many events have happened (the timeline scrubber); `null` = all of them.
 */
export function useSolverModel(
  record: ResistanceRecord,
  assumptions: Assumptions,
  perspective: Perspective,
  cursor: number | null,
  name: SeatNamer,
  /** Grading and the win curve are the expensive parts — the live rail skips them. */
  full = true,
) {
  const env = useMemo(() => envFor(record, assumptions), [record, assumptions]);
  const analysis = useMemo(
    () => analyze(record, assumptions, perspective),
    [record, assumptions, perspective],
  );
  const publicAnalysis = useMemo(() => analyze(record, assumptions), [record, assumptions]);
  const at = Math.min(cursor ?? analysis.events.length, analysis.events.length);
  const snapshot = analysis.snapshots[at] ?? analysis.snapshots[0];

  const cut = useMemo(() => recordUpTo(record, analysis.events, at), [record, analysis, at]);
  const position = useMemo(() => tablePosition(cut), [cut]);
  const onTable = useMemo(() => openProposal(cut), [cut]);

  const self = perspective.kind === "seat" ? perspective.seat : undefined;
  const facts = useMemo(() => deductions(analysis, at, name, self), [analysis, at, name, self]);
  const pairs = useMemo(
    () => (snapshot ? pairMatrix(analysis, snapshot) : []),
    [analysis, snapshot],
  );

  // Teams are judged by the TABLE's view: a team only good in one player's
  // private knowledge can't be argued into an approval.
  const publicSnapshot = publicAnalysis.snapshots[at] ?? publicAnalysis.snapshots[0];
  const suggestions = useMemo(() => {
    if (!publicSnapshot || publicSnapshot.alive === 0 || position.winner || onTable) return [];
    return rankTeams(
      publicAnalysis,
      publicSnapshot,
      position.openMissions,
      situationOf(position),
      env,
      position.leader,
    ).slice(0, 3);
  }, [publicAnalysis, publicSnapshot, position, onTable, env]);

  const tableOdds = useMemo(() => {
    if (!publicSnapshot || !onTable || publicSnapshot.alive === 0) return null;
    return teamOdds(
      publicAnalysis,
      publicSnapshot,
      onTable.team,
      onTable.mission,
      situationOf(position),
      env,
    );
  }, [publicAnalysis, publicSnapshot, onTable, position, env]);
  /** The same team through the selected perspective (private knowledge included). */
  const myOdds = useMemo(() => {
    if (perspective.kind === "public" || !snapshot || !onTable || snapshot.alive === 0) return null;
    return teamOdds(analysis, snapshot, onTable.team, onTable.mission, situationOf(position), env);
  }, [perspective.kind, analysis, snapshot, onTable, position, env]);

  const graded = useMemo(
    () => (full ? gradeDecisions(record, assumptions, name) : []),
    [record, assumptions, name, full],
  );

  // The game's value before each proposal and at the end (`lookahead.ts`):
  // the table's own estimate, and with the real roles when they're known.
  const winCurve = useMemo(() => {
    if (!full) return [];
    return gameValueCurve(record, publicAnalysis, env).map((p, i) => ({
      x: i,
      count: p.count,
      y: p.table * 100,
      truth: p.truth === null ? null : p.truth * 100,
    }));
  }, [record, publicAnalysis, env, full]);

  // Where the game was lost on information: the first point where, with the
  // real roles, the table's best play can no longer win.
  const informationLoss = useMemo(() => {
    const i = winCurve.findIndex(
      (p, k) => k > 0 && p.truth !== null && p.truth < 0.5 && (winCurve[k - 1]?.truth ?? 0) >= 0.5,
    );
    const before = winCurve[i - 1];
    const after = winCurve[i];
    return before && after
      ? { from: before.count, to: after.count, before: before.truth ?? 0, value: after.truth ?? 0 }
      : null;
  }, [winCurve]);

  return {
    env,
    analysis,
    publicAnalysis,
    publicSnapshot,
    situation: situationOf(position),
    at,
    snapshot,
    cut,
    position,
    onTable,
    facts,
    pairs,
    suggestions,
    tableOdds,
    myOdds,
    graded,
    winCurve,
    informationLoss,
  };
}

export type SolverModel = ReturnType<typeof useSolverModel>;
