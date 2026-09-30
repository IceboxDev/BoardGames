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
import {
  analyze,
  type Perspective,
  pairMatrix,
} from "@boardgames/core/games/the-resistance/solver/posterior";
import { rankTeams, teamOdds } from "@boardgames/core/games/the-resistance/solver/recommend";
import { recordUpTo, winProbability } from "@boardgames/core/games/the-resistance/solver/simulate";
import { useMemo } from "react";
import { envFor } from "../../logic/solver";

const ROLLOUTS = 300;

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

  const suggestions = useMemo(() => {
    if (!snapshot || snapshot.alive === 0 || position.winner || onTable) return [];
    return rankTeams(
      analysis,
      snapshot,
      position.openMissions,
      situationOf(position),
      env,
      position.leader,
    ).slice(0, 3);
  }, [analysis, snapshot, position, onTable, env]);

  const tableOdds = useMemo(() => {
    if (!snapshot || !onTable || snapshot.alive === 0) return null;
    return teamOdds(analysis, snapshot, onTable.team, onTable.mission, situationOf(position), env);
  }, [analysis, snapshot, onTable, position, env]);

  const graded = useMemo(
    () => (full ? gradeDecisions(record, assumptions, name) : []),
    [record, assumptions, name, full],
  );

  // The Resistance's odds before each proposal, and at the end.
  const winCurve = useMemo(() => {
    if (!full) return [];
    const points = publicAnalysis.events.filter((e) => e.kind === "proposal").map((e) => e.index);
    points.push(publicAnalysis.events.length);
    return points.map((count, i) => ({
      x: i,
      count,
      y: winProbability(record, publicAnalysis, count, env, ROLLOUTS, count + 1).resistance * 100,
    }));
  }, [record, publicAnalysis, env, full]);

  return {
    analysis,
    at,
    snapshot,
    cut,
    position,
    onTable,
    facts,
    pairs,
    suggestions,
    tableOdds,
    graded,
    winCurve,
  };
}

export type SolverModel = ReturnType<typeof useSolverModel>;
