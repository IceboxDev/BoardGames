/**
 * Misplay detection. Every decision is judged from the DECIDER's own
 * perspective at that moment — their role, the spies they knew, and only the
 * events before it — never with hindsight.
 *
 * With roles known (an online replay, or a tabletop game whose roles were
 * entered at the end) every decision is graded. Without them, proposals and
 * votes are graded "as Resistance" for seats that could still be Resistance.
 *
 * A double fail from two spies is never a misplay: spies can't coordinate at
 * the table. Putting two spies on one team is — that's the leader's error.
 */

import type { ResistanceRecord, Role } from "../record";
import { failsNeeded, isApproved, maskOf, popcount, spyCount } from "../rules";
import type { Assumptions } from "./assumptions";
import { defaultNamer, type SeatNamer } from "./deductions";
import type { ModelEnv } from "./model";
import { type Analysis, analyze, type Perspective, type SolverEvent } from "./posterior";
import { rankSpyTeams, rankTeams, teamOdds } from "./recommend";

export const GRADES = ["best", "good", "note", "inaccuracy", "mistake", "blunder"] as const;
export type Grade = (typeof GRADES)[number];

export interface GradedDecision {
  eventIndex: number;
  round: number;
  seat: number;
  kind: "proposal" | "vote" | "card";
  grade: Grade;
  title: string;
  detail: string;
  /** Judged as though the seat were Resistance — its real role unknown. */
  hypothetical: boolean;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

function gradeFromDelta(delta: number): Grade {
  if (delta <= 0.02) return "best";
  if (delta <= 0.08) return "good";
  if (delta <= 0.2) return "inaccuracy";
  if (delta <= 0.4) return "mistake";
  return "blunder";
}

interface Ctx {
  record: ResistanceRecord;
  roles: readonly Role[] | null;
  env: ModelEnv;
  name: SeatNamer;
  publicAnalysis: Analysis;
  perSeat: Map<number, Analysis>;
}

function perspectiveOf(
  ctx: Ctx,
  seat: number,
): { perspective: Perspective; hypothetical: boolean } {
  const { roles, record } = ctx;
  if (!roles) {
    return {
      perspective: { kind: "seat", seat, role: "resistance", knownSpies: [] },
      hypothetical: true,
    };
  }
  const role = roles[seat] ?? "resistance";
  const knownSpies =
    role !== "spy"
      ? []
      : record.variants.blindSpies
        ? [seat]
        : roles.flatMap((r, i) => (r === "spy" ? [i] : []));
  return { perspective: { kind: "seat", seat, role, knownSpies }, hypothetical: false };
}

function seatAnalysis(ctx: Ctx, seat: number): { analysis: Analysis; hypothetical: boolean } {
  const { perspective, hypothetical } = perspectiveOf(ctx, seat);
  let analysis = ctx.perSeat.get(seat);
  if (!analysis) {
    analysis = analyze(ctx.record, ctx.env.assumptions, perspective);
    ctx.perSeat.set(seat, analysis);
  }
  return { analysis, hypothetical };
}

function roleOf(ctx: Ctx, seat: number): Role | null {
  return ctx.roles?.[seat] ?? null;
}

function gradeProposal(ctx: Ctx, event: SolverEvent): GradedDecision | null {
  const { proposal, situation } = event;
  const leader = proposal.leader;
  const base = {
    eventIndex: event.index,
    round: event.round,
    seat: leader,
    kind: "proposal" as const,
  };
  const role = roleOf(ctx, leader);
  const team = proposal.team.map(ctx.name).join(", ");
  const n = ctx.record.playerCount;

  if (role === "spy") {
    const spies = ctx.roles?.flatMap((r, i) => (r === "spy" ? [i] : [])) ?? [];
    const knows = !ctx.record.variants.blindSpies && spies.length === spyCount(n);
    if (!knows) return null;
    const aboard = popcount(maskOf(proposal.team) & maskOf(spies));
    const needed = failsNeeded(n, proposal.mission);
    if (aboard === 0) {
      if (situation.successes === 2) {
        return {
          ...base,
          grade: "blunder",
          hypothetical: false,
          title: "Clean team at match point",
          detail: `${team} has no spy — if approved it hands the Resistance its third success.`,
        };
      }
      return {
        ...base,
        grade: event.round === 0 ? "note" : "inaccuracy",
        hypothetical: false,
        title: "No spy aboard",
        detail: "This team can't be sabotaged. Buys trust at the cost of a mission.",
      };
    }
    if (aboard > needed) {
      return {
        ...base,
        grade: "mistake",
        hypothetical: false,
        title: "Two spies on one team",
        detail:
          "Spies can't agree at the table who plays Fail — a double fail would expose both of them.",
      };
    }
    const snap = ctx.publicAnalysis.snapshots[event.index];
    if (!snap) return null;
    const ranked = rankSpyTeams(
      ctx.publicAnalysis,
      snap,
      spies,
      [proposal.mission],
      situation,
      ctx.env,
    );
    const chosen = teamOdds(
      ctx.publicAnalysis,
      snap,
      proposal.team,
      proposal.mission,
      situation,
      ctx.env,
    );
    const best = ranked[0];
    if (!best) return null;
    const delta = best.pClean - chosen.pClean;
    return {
      ...base,
      grade: delta <= 0.05 ? "best" : delta <= 0.2 ? "good" : "inaccuracy",
      hypothetical: false,
      title: "Spy team",
      detail: `The table rates ${team} ${pct(chosen.pClean)} clean; the most trusted one-spy team was ${best.team.map(ctx.name).join(", ")} at ${pct(best.pClean)}.`,
    };
  }

  const { analysis, hypothetical } = seatAnalysis(ctx, leader);
  const snap = analysis.snapshots[event.index];
  if (!snap || snap.alive === 0) return null;
  if (hypothetical && (ctx.publicAnalysis.snapshots[event.index]?.pSpyCore[leader] ?? 0) === 1) {
    return null;
  }
  const provenSpy = proposal.team.filter((s) => snap.pSpyCore[s] === 1);
  const chosen = teamOdds(analysis, snap, proposal.team, proposal.mission, situation, ctx.env);
  const best = rankTeams(analysis, snap, [proposal.mission], situation, ctx.env, leader)[0];
  if (!best) return null;
  if (provenSpy.length > 0) {
    return {
      ...base,
      grade: "blunder",
      hypothetical,
      title: "Proven spy on the team",
      detail: `${provenSpy.map(ctx.name).join(", ")} ${provenSpy.length === 1 ? "was" : "were"} already proven a spy.`,
    };
  }
  const delta = best.pSuccess - chosen.pSuccess;
  const grade = gradeFromDelta(delta);
  return {
    ...base,
    grade,
    hypothetical,
    title: grade === "best" ? "Best team" : "Weaker team",
    detail:
      grade === "best"
        ? `${team} — ${pct(chosen.pSuccess)} to succeed, as good as any.`
        : `${team} — ${pct(chosen.pSuccess)} to succeed; ${best.team.map(ctx.name).join(", ")} had ${pct(best.pSuccess)}.`,
  };
}

function gradeVotes(ctx: Ctx, event: SolverEvent): GradedDecision[] {
  if (event.kind !== "vote") return [];
  const { proposal, situation, votes } = event;
  const out: GradedDecision[] = [];
  const hammer = situation.rejections === 4;
  const n = ctx.record.playerCount;
  const passed = isApproved(votes, n);

  votes.forEach((approve, voter) => {
    const base = {
      eventIndex: event.index,
      round: event.round,
      seat: voter,
      kind: "vote" as const,
    };
    const role = roleOf(ctx, voter);
    if (role === "spy") {
      const spies = ctx.roles?.flatMap((r, i) => (r === "spy" ? [i] : [])) ?? [];
      const knows = !ctx.record.variants.blindSpies;
      const aboard = popcount(maskOf(proposal.team) & maskOf(knows ? spies : [voter]));
      if (approve && passed && aboard === 0 && situation.successes === 2) {
        out.push({
          ...base,
          grade: "blunder",
          hypothetical: false,
          title: "Approved a clean team at match point",
          detail: "That team's success ended the game for the Resistance.",
        });
      }
      if (!approve && hammer && passed) {
        out.push({
          ...base,
          grade: "mistake",
          hypothetical: false,
          title: "Rejected the hammer",
          detail: "Only a spy rejects the fifth proposal — and it passed anyway.",
        });
      }
      return;
    }

    const { analysis, hypothetical } = seatAnalysis(ctx, voter);
    if (hypothetical && (ctx.publicAnalysis.snapshots[event.index]?.pSpyCore[voter] ?? 0) === 1) {
      return;
    }
    if (hammer && !approve) {
      out.push({
        ...base,
        grade: "blunder",
        hypothetical,
        title: "Rejected the hammer",
        detail: "A fifth rejection gives the Spies the game.",
      });
      return;
    }
    const snap = analysis.snapshots[event.index];
    if (!snap || snap.alive === 0) return;
    const provenSpy = proposal.team.filter((s) => snap.pSpyCore[s] === 1);
    if (approve && provenSpy.length > 0) {
      out.push({
        ...base,
        grade: "blunder",
        hypothetical,
        title: "Approved a proven spy",
        detail: `${provenSpy.map(ctx.name).join(", ")} ${provenSpy.length === 1 ? "was" : "were"} already proven a spy.`,
      });
      return;
    }
    const odds = teamOdds(analysis, snap, proposal.team, proposal.mission, situation, ctx.env);
    if (!approve && proposal.team.every((s) => snap.pSpyCore[s] === 0)) {
      out.push({
        ...base,
        grade: "mistake",
        hypothetical,
        title: "Rejected a proven-clean team",
        detail: "Every member was already proven Resistance.",
      });
    } else if (approve && odds.pSuccess < 0.34 && !hammer) {
      out.push({
        ...base,
        grade: "inaccuracy",
        hypothetical,
        title: "Approved a long shot",
        detail: `By this seat's own knowledge the team had only ${pct(odds.pSuccess)} to succeed.`,
      });
    }
  });
  return out;
}

function gradeCards(ctx: Ctx, event: SolverEvent): GradedDecision[] {
  if (event.kind !== "mission" || !event.cards || !ctx.roles) return [];
  const { proposal, situation } = event;
  const n = ctx.record.playerCount;
  const needed = failsNeeded(n, proposal.mission);
  const out: GradedDecision[] = [];
  for (const seat of proposal.team) {
    const card = event.cards[seat];
    if (ctx.roles[seat] !== "spy" || !card) continue;
    const base = { eventIndex: event.index, round: event.round, seat, kind: "card" as const };
    if (card === "success" && event.success && event.fails + 1 >= needed) {
      if (situation.successes === 2) {
        out.push({
          ...base,
          grade: "blunder",
          hypothetical: false,
          title: "Passed at match point",
          detail: "A Fail here would have stopped the Resistance's third success.",
        });
      } else if (situation.fails === 2) {
        out.push({
          ...base,
          grade: "blunder",
          hypothetical: false,
          title: "Passed up the win",
          detail: "A Fail here was the Spies' third failed mission.",
        });
      }
    } else if (card === "fail" && event.success) {
      out.push({
        ...base,
        grade: "mistake",
        hypothetical: false,
        title: "Wasted Fail",
        detail: `Mission ${proposal.mission + 1} needed ${needed} Fails — this one only drew suspicion.`,
      });
    } else if (card === "fail" && proposal.team.length === 2) {
      out.push({
        ...base,
        grade: "note",
        hypothetical: false,
        title: "Failed a two-player team",
        detail: "The other member now knows exactly who played it.",
      });
    }
  }
  return out;
}

export function gradeDecisions(
  record: ResistanceRecord,
  assumptions: Assumptions,
  name: SeatNamer = defaultNamer,
): GradedDecision[] {
  const env: ModelEnv = {
    playerCount: record.playerCount,
    blindSpies: record.variants.blindSpies,
    assumptions,
  };
  const ctx: Ctx = {
    record,
    roles: record.roles ?? null,
    env,
    name,
    publicAnalysis: analyze(record, assumptions),
    perSeat: new Map(),
  };
  return ctx.publicAnalysis.events.flatMap((event) => {
    if (event.kind === "proposal") {
      const graded = gradeProposal(ctx, event);
      return graded ? [graded] : [];
    }
    if (event.kind === "vote") return gradeVotes(ctx, event);
    return gradeCards(ctx, event);
  });
}
