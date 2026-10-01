/**
 * Misplay detection — only once roles are known. What is a Resistance
 * misplay could be a spy's best move, so no decision is judged without the
 * decider's real role (revealed at the end, or entered from the start for a
 * post-mortem).
 *
 * Each decision is measured against the optimal play (`optimal.ts`):
 *   Resistance — the highest table-view chance of success, the leader's own
 *     knowledge only breaking ties (a team has to be argued into a vote).
 *   Spy — a team that surely fails, leaving the table most uncertain who the
 *     spies are; fewer spies exposed breaks ties.
 * Several options can be optimal at once; all of them are listed.
 *
 * A double fail from two spies is never a misplay: spies can't coordinate at
 * the table. Putting two spies on one team is — and the uncertainty measure
 * sees it (a double Fail proves both).
 */

import type { ResistanceRecord, Role } from "../record";
import { failsNeeded, isApproved, maskOf, popcount, tablePosition } from "../rules";
import type { Assumptions } from "./assumptions";
import { defaultNamer, type SeatNamer } from "./deductions";
import { Lookahead, positionAt } from "./lookahead";
import type { ModelEnv } from "./model";
import { type OptimalChoice, resistanceGameChoice, spyProposalChoice, TIE } from "./optimal";
import {
  type Analysis,
  analyze,
  type Perspective,
  type Snapshot,
  type SolverEvent,
} from "./posterior";
import { rankTeams } from "./recommend";
import { recordUpTo } from "./simulate";

export const GRADES = ["best", "good", "note", "inaccuracy", "mistake", "blunder"] as const;
export type Grade = (typeof GRADES)[number];

export interface TeamRef {
  team: number[];
  mission: number;
}

export interface GradedDecision {
  eventIndex: number;
  round: number;
  seat: number;
  role: Role;
  kind: "proposal" | "vote" | "card";
  grade: Grade;
  title: string;
  detail: string;
  /** The argument, step by step, in plain words — what the explanation shows. */
  reasoning: string[];
  /** The team this decision was about, and the table's best alternative. */
  team?: TeamRef;
  best?: TeamRef;
  /** A proposal's scored options (optimal ones flagged) — the explanation's table. */
  choice?: OptimalChoice;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const pts = (d: number) => `${Math.round(d * 100)} points`;
const bits = (b: number) => `${b.toFixed(2)} bits`;

/** Resistance proposals: grade by the table-view P(success) gap to the optimal team. */
export const PROPOSAL_SCALE = [
  { max: 0.08, grade: "good" },
  { max: 0.2, grade: "inaccuracy" },
  { max: 0.4, grade: "mistake" },
  { max: Number.POSITIVE_INFINITY, grade: "blunder" },
] as const satisfies readonly { max: number; grade: Grade }[];

/** Spy proposals: grade by the uncertainty (bits) given away versus the optimal team. */
export const SPY_SCALE = [
  { max: 0.15, grade: "good" },
  { max: 0.6, grade: "inaccuracy" },
  { max: 1.2, grade: "mistake" },
  { max: Number.POSITIVE_INFINITY, grade: "blunder" },
] as const satisfies readonly { max: number; grade: Grade }[];

function scaled(scale: readonly { max: number; grade: Grade }[], gap: number): Grade {
  return scale.find((s) => gap <= s.max)?.grade ?? "blunder";
}

interface Ctx {
  record: ResistanceRecord;
  roles: readonly Role[];
  env: ModelEnv;
  name: SeatNamer;
  table: Analysis;
  assumptions: Assumptions;
  perSeat: Map<number, Analysis>;
  look: Lookahead;
}

function spiesOf(ctx: Ctx): number[] {
  return ctx.roles.flatMap((r, i) => (r === "spy" ? [i] : []));
}

/** The spies this seat knew: all of them, only itself (Blind Spies), none (Resistance). */
function knownTo(ctx: Ctx, seat: number): number[] {
  if (ctx.roles[seat] !== "spy") return [];
  return ctx.record.variants.blindSpies ? [seat] : spiesOf(ctx);
}

function ownAnalysis(ctx: Ctx, seat: number): Analysis {
  let a = ctx.perSeat.get(seat);
  if (!a) {
    const perspective: Perspective = {
      kind: "seat",
      seat,
      role: ctx.roles[seat] ?? "resistance",
      knownSpies: knownTo(ctx, seat),
    };
    a = analyze(ctx.record, ctx.assumptions, perspective);
    ctx.perSeat.set(seat, a);
  }
  return a;
}

function teamText(ctx: Ctx, team: readonly number[]): string {
  return team.map(ctx.name).join(", ");
}

function provenSpies(snap: Snapshot, team: readonly number[]): number[] {
  return team.filter((s) => snap.pSpyCore[s] === 1);
}

function missionsAt(ctx: Ctx, event: SolverEvent): number[] {
  if (!ctx.record.variants.targeting) return [event.proposal.mission];
  return tablePosition(recordUpTo(ctx.record, ctx.table.events, event.index)).openMissions;
}

function optimalText(ctx: Ctx, choice: OptimalChoice): string {
  const optimal = choice.options.filter((o) => o.optimal);
  const list = optimal
    .slice(0, 4)
    .map(
      (o) =>
        `${teamText(ctx, o.team)}${ctx.record.variants.targeting ? ` (M${o.mission + 1})` : ""}`,
    )
    .join("; ");
  const more = optimal.length > 4 ? ` and ${optimal.length - 4} more` : "";
  return optimal.length === 1 ? list : `${optimal.length} equally optimal teams: ${list}${more}`;
}

function gradeProposal(ctx: Ctx, event: SolverEvent): GradedDecision | null {
  const { proposal, situation } = event;
  const leader = proposal.leader;
  const role = ctx.roles[leader];
  const snap = ctx.table.snapshots[event.index];
  if (!snap || snap.alive === 0 || !role) return null;
  const n = ctx.record.playerCount;
  const team = teamText(ctx, proposal.team);
  const base = {
    eventIndex: event.index,
    round: event.round,
    seat: leader,
    role,
    kind: "proposal" as const,
    team: { team: [...proposal.team], mission: proposal.mission },
  };
  const missions = missionsAt(ctx, event);

  if (role === "spy") {
    const spies = knownTo(ctx, leader);
    const choice = spyProposalChoice(
      ctx.table,
      snap,
      leader,
      spies,
      missions,
      situation,
      ctx.env,
      proposal,
    );
    const top = choice.options.find((o) => o.optimal);
    const needed = failsNeeded(n, proposal.mission);
    const aboard = popcount(maskOf(proposal.team) & maskOf(spies));
    const why = [
      `${ctx.name(leader)} was a spy${spies.length > 1 ? " who knew the other spies" : ctx.record.variants.blindSpies ? " (Blind Spies: knowing only themself)" : ""}. A spy's optimal team is one that fails for certain — enough spies aboard, each playing Fail — and, among those, the one that leaves the table most uncertain who the spies are once the Fail is revealed.`,
      top
        ? `Optimal: ${optimalText(ctx, choice)} — the table would be left with ${bits(top.primary)} of uncertainty.`
        : "No team could fail for certain.",
    ];
    if (!choice.chosenCanFail) {
      const matchPoint = situation.successes === 2;
      return {
        ...base,
        best: top ? { team: top.team, mission: top.mission } : undefined,
        choice,
        grade: matchPoint ? "blunder" : "mistake",
        title: aboard === 0 ? "No spy aboard" : "Too few spies to fail",
        detail:
          aboard === 0
            ? `${team} has no spy — it can't be sabotaged${matchPoint ? ", and a success here ends the game" : ""}.`
            : `${team} carries ${aboard} spy where mission ${proposal.mission + 1} needs ${needed} Fails.`,
        reasoning: [
          ...why,
          `${team} had ${aboard} spy${aboard === 1 ? "" : "s"} aboard where ${needed} Fail${needed > 1 ? "s were" : " was"} needed, so it couldn't fail for certain${matchPoint ? " — and the Resistance was one success from winning" : ""}.`,
        ],
      };
    }
    const gap = (top?.primary ?? choice.chosen.primary) - choice.chosen.primary;
    const grade: Grade = choice.chosen.optimal
      ? "best"
      : gap <= TIE
        ? "good"
        : scaled(SPY_SCALE, gap);
    const doubled = aboard > needed;
    return {
      ...base,
      best: top ? { team: top.team, mission: top.mission } : undefined,
      choice,
      grade,
      title: choice.chosen.optimal
        ? "Optimal spy team"
        : doubled
          ? "Two spies on one team"
          : "Gave away more than needed",
      detail: choice.chosen.optimal
        ? `${team} fails for certain and leaves the table ${bits(choice.chosen.primary)} of doubt — as much as any team could.`
        : `${team} leaves ${bits(choice.chosen.primary)} of doubt; ${top ? teamText(ctx, top.team) : "the optimal team"} would leave ${bits(top?.primary ?? 0)}.`,
      reasoning: [
        ...why,
        `${team} fails for certain and would leave ${bits(choice.chosen.primary)}${doubled ? ` — with ${aboard} spies aboard and no way to agree who plays Fail, the extra Fail narrows the table's search` : ""}.`,
        choice.chosen.optimal
          ? "It is among the optimal teams."
          : gap <= TIE
            ? `It tied on uncertainty but put more spies at risk (${aboard} aboard) — the tie-break.`
            : `It gave away ${bits(gap)} more than the optimal team → ${grade}. Scale: Good ≤ 0.15, Inaccuracy ≤ 0.6, Mistake ≤ 1.2, Blunder above.`,
      ],
    };
  }

  const own = ownAnalysis(ctx, leader);
  const ownSnap = own.snapshots[event.index];
  if (!ownSnap) return null;
  const position = positionAt(snap.weights, resultsAt(ctx, event.index), `p${event.index}`);
  const candidates = candidateTeams(ctx, snap, ownSnap, own, missions, situation, proposal);
  const choice = resistanceGameChoice(
    ctx.look,
    position,
    ownSnap.weights,
    snap.weights,
    candidates,
    proposal,
  );
  const top = choice.options.find((o) => o.optimal);
  const chosen = choice.chosen;
  const proven = provenSpies(snap, proposal.team);
  const why = [
    `${ctx.name(leader)} was Resistance. Every team is played forward to the end of the game: the mission runs with it (each spy aboard failing with the usual chance), and afterwards the table keeps running the team it rates best. A team's worth is how often that ends in a Resistance win — over the seatings ${ctx.name(leader)} considered possible (their own knowledge), with the table's view breaking ties.`,
    `Optimal: ${optimalText(ctx, choice)} — the Resistance wins ${pct(top?.primary ?? 0)} by ${ctx.name(leader)}'s knowledge (${pct(top?.secondary ?? 0)} by the table's).`,
    `${team}: ${pct(chosen.primary)} by ${ctx.name(leader)}'s knowledge, ${pct(chosen.secondary)} by the table's.`,
  ];
  if (proven.length > 0) {
    return {
      ...base,
      best: top ? { team: top.team, mission: top.mission } : undefined,
      choice,
      grade: "blunder",
      title: "Proposed a proven spy",
      detail: `The table had already proven ${teamText(ctx, proven)} a spy.`,
      reasoning: [
        ...why,
        `Every spy set still possible contains ${teamText(ctx, proven)} — a certainty anyone at the table could check.`,
      ],
    };
  }
  const gap = (top?.primary ?? chosen.primary) - chosen.primary;
  // Tied on what the leader knew: arguability (the table's view) decides.
  const tied = !chosen.optimal && gap <= TIE;
  const tableGap = (top?.secondary ?? chosen.secondary) - chosen.secondary;
  const grade: Grade = chosen.optimal
    ? "best"
    : tied
      ? scaled(PROPOSAL_SCALE, tableGap)
      : scaled(PROPOSAL_SCALE, gap);
  return {
    ...base,
    best: top ? { team: top.team, mission: top.mission } : undefined,
    choice,
    grade,
    title: chosen.optimal ? "Optimal team" : tied ? "Harder to argue for" : "Weaker team",
    detail: chosen.optimal
      ? `${team} — the Resistance wins ${pct(chosen.primary)} from here by ${ctx.name(leader)}'s knowledge, as well as any team.`
      : tied
        ? `${team} — as good by ${ctx.name(leader)}'s knowledge, but the table rated ${top ? teamText(ctx, top.team) : "another team"} higher: ${pct(top?.secondary ?? 0)} vs ${pct(chosen.secondary)}.`
        : `${team} — wins ${pct(chosen.primary)} from here by ${ctx.name(leader)}'s knowledge; ${top ? teamText(ctx, top.team) : "the optimal team"} wins ${pct(top?.primary ?? 0)}.`,
    reasoning: [
      ...why,
      chosen.optimal
        ? "It is among the optimal teams."
        : tied
          ? `Equal by ${ctx.name(leader)}'s knowledge, so the table's view decides: ${pct(top?.secondary ?? 0)} vs ${pct(chosen.secondary)} — a gap of ${pts(tableGap)} → ${grade}.`
          : `Gap ${pts(gap)} in the chance to win the game → ${grade}. Scale: Good ≤ 8, Inaccuracy ≤ 20, Mistake ≤ 40, Blunder above.`,
    ],
  };
}

/** Mission results as they stood before event `index`. */
function resultsAt(ctx: Ctx, index: number): (boolean | null)[] {
  return tablePosition(recordUpTo(ctx.record, ctx.table.events, index)).missionResults;
}

/**
 * The teams worth playing forward: all of them at small tables; at large ones
 * the best by the leader's knowledge and by the table's view, plus the chosen.
 */
function candidateTeams(
  ctx: Ctx,
  snap: Snapshot,
  ownSnap: Snapshot,
  own: Analysis,
  missions: readonly number[],
  situation: SolverEvent["situation"],
  chosen: { team: readonly number[]; mission: number },
): { team: number[]; mission: number }[] {
  const byTable = rankTeams(ctx.table, snap, missions, situation, ctx.env);
  const key = (t: { team: readonly number[]; mission: number }) => `${t.mission}:${t.team.join()}`;
  if (byTable.length <= 40) return byTable.map(({ team, mission }) => ({ team, mission }));
  const byOwn = rankTeams(own, ownSnap, missions, situation, ctx.env);
  const picked = new Map<string, { team: number[]; mission: number }>();
  for (const t of [...byOwn.slice(0, 12), ...byTable.slice(0, 12)]) {
    picked.set(key(t), { team: t.team, mission: t.mission });
  }
  picked.set(key(chosen), { team: [...chosen.team], mission: chosen.mission });
  return [...picked.values()];
}

function gradeVotes(ctx: Ctx, event: SolverEvent): GradedDecision[] {
  if (event.kind !== "vote") return [];
  const { proposal, situation, votes } = event;
  const snap = ctx.table.snapshots[event.index];
  if (!snap || snap.alive === 0) return [];
  const n = ctx.record.playerCount;
  const needed = failsNeeded(n, proposal.mission);
  const hammer = situation.rejections === 4;
  const passed = isApproved(votes, n);
  const yes = votes.filter(Boolean).length;
  const team = teamText(ctx, proposal.team);
  const top = rankTeams(ctx.table, snap, [proposal.mission], situation, ctx.env)[0];
  const position = positionAt(snap.weights, resultsAt(ctx, event.index), `v${event.index}`);
  const asChoice = { mission: proposal.mission, mask: maskOf(proposal.team) };
  const proven = provenSpies(snap, proposal.team);
  const out: GradedDecision[] = [];

  votes.forEach((approve, voter) => {
    const role = ctx.roles[voter];
    if (!role) return;
    const base = {
      eventIndex: event.index,
      round: event.round,
      seat: voter,
      role,
      kind: "vote" as const,
      team: { team: [...proposal.team], mission: proposal.mission },
      ...(top ? { best: { team: top.team, mission: top.mission } } : {}),
    };

    if (role === "spy") {
      const aboard = popcount(maskOf(proposal.team) & maskOf(knownTo(ctx, voter)));
      const sureFail = aboard >= needed;
      const why = `${ctx.name(voter)} was a spy. A spy's best vote backs a team that fails for certain and stops one that can't fail when it matters.`;
      if (approve && passed && aboard === 0 && situation.successes === 2) {
        out.push({
          ...base,
          grade: "blunder",
          title: "Approved a clean team at match point",
          detail: "That team's success ended the game for the Resistance.",
          reasoning: [
            why,
            "The team had no spy aboard and the Resistance had two successes: rejecting cost nothing, approving let them win.",
          ],
        });
      } else if (!approve && sureFail && !passed && (yes + 1) * 2 > n) {
        out.push({
          ...base,
          grade: "mistake",
          title: "Voted down a sure sabotage",
          detail: `${team} had ${aboard} spy${aboard === 1 ? "" : "s"} aboard — this vote was the one that sank it.`,
          reasoning: [
            why,
            `With ${ctx.name(voter)}'s Approve the vote would have passed (${yes + 1} of ${n}), and the mission would have failed for certain.`,
          ],
        });
      } else if (!approve && hammer && passed) {
        out.push({
          ...base,
          grade: "mistake",
          title: "Rejected the hammer",
          detail: "Only a spy rejects the fifth proposal — and it passed anyway.",
          reasoning: [
            why,
            "A fifth rejection gives the Spies the game, so no Resistance player rejects the fifth proposal. It passed regardless: the rejection bought nothing and marked the voter.",
          ],
        });
      }
      return;
    }

    // Approve vs reject, each played forward to the end of the game over the
    // seatings this voter considered possible: approving runs this team;
    // rejecting hands the mission to the table's favourite (or, on a fifth
    // rejection, the game to the Spies).
    const own = ownAnalysis(ctx, voter).snapshots[event.index];
    if (!own) return;
    const approveValue = ctx.look.expect(own.weights, (w) =>
      ctx.look.valueOf(position, asChoice, w),
    );
    const rejectValue = hammer
      ? 0
      : ctx.look.expect(own.weights, (w) => ctx.look.value(position, w));
    const tableApprove = ctx.look.expect(snap.weights, (w) =>
      ctx.look.valueOf(position, asChoice, w),
    );
    const tableReject = hammer
      ? 0
      : ctx.look.expect(snap.weights, (w) => ctx.look.value(position, w));
    const why = [
      `${ctx.name(voter)} was Resistance. Both votes are played forward to the end of the game: approving runs ${team} (each spy aboard failing with the usual chance); rejecting leaves the mission to the team the table rates best${hammer ? " — except that this was the fifth proposal, and a fifth rejection hands the Spies the game" : ""}.`,
      `By ${ctx.name(voter)}'s knowledge the Resistance wins ${pct(approveValue)} after approving, ${pct(rejectValue)} after rejecting (by the table's view: ${pct(tableApprove)} vs ${pct(tableReject)}).`,
    ];

    if (hammer && !approve) {
      out.push({
        ...base,
        grade: "blunder",
        title: "Rejected the hammer",
        detail: "A fifth rejection gives the Spies the game.",
        reasoning: [
          "This was the fifth proposal of the round: rejecting it ends the game in the Spies' favour, whatever the team.",
        ],
      });
      return;
    }
    if (approve && proven.length > 0) {
      out.push({
        ...base,
        grade: "blunder",
        title: "Approved a proven spy",
        detail: `The table had already proven ${teamText(ctx, proven)} a spy.`,
        reasoning: [
          ...why,
          `Every spy set still possible contains ${teamText(ctx, proven)} — the proof was public.`,
        ],
      });
      return;
    }
    const chosenValue = approve ? approveValue : rejectValue;
    const otherValue = approve ? rejectValue : approveValue;
    let gap = otherValue - chosenValue;
    let basis = "their own knowledge";
    if (Math.abs(gap) <= TIE) {
      // Equal by what they knew: the table's view (what can be argued) decides.
      gap = approve ? tableReject - tableApprove : tableApprove - tableReject;
      basis = "the table's view (equal by their own knowledge)";
    }
    if (gap <= TIE) return;
    const grade = scaled(PROPOSAL_SCALE, gap);
    if (grade === "good") return;
    out.push({
      ...base,
      grade,
      title: approve ? "Approved a losing team" : "Rejected a winning team",
      detail: approve
        ? `Approving ${team} left the Resistance ${pts(gap)} worse off than rejecting.`
        : `Rejecting ${team} left the Resistance ${pts(gap)} worse off than approving.`,
      reasoning: [
        ...why,
        `By ${basis}, ${approve ? "rejecting" : "approving"} was ${pts(gap)} better → ${grade}. Scale: Good ≤ 8, Inaccuracy ≤ 20, Mistake ≤ 40, Blunder above.`,
      ],
    });
  });
  return out;
}

function gradeCards(ctx: Ctx, event: SolverEvent): GradedDecision[] {
  // The table never sees individual cards; judging a spy's card uses the
  // real ones from the record (a finished game with roles).
  const cards = ctx.record.rounds[event.round]?.result?.cards;
  if (event.kind !== "mission" || !cards) return [];
  const { proposal, situation } = event;
  const needed = failsNeeded(ctx.record.playerCount, proposal.mission);
  const out: GradedDecision[] = [];
  for (const seat of proposal.team) {
    const card = cards[seat];
    if (ctx.roles[seat] !== "spy" || !card) continue;
    const base = {
      eventIndex: event.index,
      round: event.round,
      seat,
      role: "spy" as const,
      kind: "card" as const,
    };
    const tally = `The mission drew ${event.fails} Fail${event.fails === 1 ? "" : "s"}; ${needed} ${needed === 1 ? "was" : "were"} needed to sink it.`;
    if (card === "success" && event.success && event.fails + 1 >= needed) {
      if (situation.successes === 2) {
        out.push({
          ...base,
          grade: "blunder",
          title: "Passed at match point",
          detail: "A Fail here would have stopped the Resistance's third success.",
          reasoning: [
            tally,
            "The Resistance had two successes: this success ended the game, and this spy's Fail would have prevented it.",
          ],
        });
      } else if (situation.fails === 2) {
        out.push({
          ...base,
          grade: "blunder",
          title: "Passed up the win",
          detail: "A Fail here was the Spies' third failed mission.",
          reasoning: [
            tally,
            "The Spies had two failed missions: this spy's Fail would have won the game.",
          ],
        });
      }
    } else if (card === "fail" && event.success) {
      out.push({
        ...base,
        grade: "mistake",
        title: "Wasted Fail",
        detail: `Mission ${proposal.mission + 1} needed ${needed} Fails — this one only drew suspicion.`,
        reasoning: [
          tally,
          "The Fail couldn't change the result, but it told the table a spy was aboard.",
        ],
      });
    } else if (card === "fail" && proposal.team.length === 2) {
      out.push({
        ...base,
        grade: "note",
        title: "Failed a two-player team",
        detail: "The other member now knows exactly who played it.",
        reasoning: [
          tally,
          "On a team of two, the other member knows their own card — so they know who played the Fail, even if the table can't be sure.",
        ],
      });
    }
  }
  return out;
}

/**
 * Every decision graded against the optimal play — only when every role is
 * known (a finished game, or a tabletop record with roles entered). Without
 * roles there is nothing to grade: the same move can be a Resistance error and
 * a spy's best play.
 */
export function gradeDecisions(
  record: ResistanceRecord,
  assumptions: Assumptions,
  name: SeatNamer = defaultNamer,
): GradedDecision[] {
  const roles = record.roles;
  if (!roles || roles.length !== record.playerCount) return [];
  const env: ModelEnv = {
    playerCount: record.playerCount,
    blindSpies: record.variants.blindSpies,
    assumptions,
  };
  const table = analyze(record, assumptions);
  const ctx: Ctx = {
    record,
    roles,
    env,
    name,
    table,
    assumptions,
    perSeat: new Map(),
    look: new Lookahead(table, record, env),
  };
  return ctx.table.events.flatMap((event) => {
    if (event.kind === "proposal") {
      const graded = gradeProposal(ctx, event);
      return graded ? [graded] : [];
    }
    if (event.kind === "vote") return gradeVotes(ctx, event);
    return gradeCards(ctx, event);
  });
}
