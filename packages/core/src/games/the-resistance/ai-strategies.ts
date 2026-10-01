/**
 * The bots. Each decides from ITS OWN player view — the same projection a
 * person's browser gets — so a bot never sees a role or a card it shouldn't.
 *
 * `analyst` plays what the Solver recommends. Its spies follow the Solver's
 * default assumptions (one spy per team, fail at match point, hesitate on
 * two-player teams…) and decide their cards independently, exactly as the
 * model assumes — spies can't coordinate at the table.
 */

import type { Rng } from "../../lib/rng";
import { failsNeeded, maskOf, popcount, spyCount, tablePosition } from "./rules";
import { defaultAssumptions } from "./solver/assumptions";
import { type ModelEnv, type Situation, spyFailChance } from "./solver/model";
import { analyze, type Perspective } from "./solver/posterior";
import { rankSpyTeams, rankTeams, type TeamOdds, teamOdds } from "./solver/recommend";
import { BOT_SPY_FAIL_RATE } from "./solver/simulate";
import type { AIStrategyId, ResistanceAction, ResistancePlayerView } from "./types";

function pick<T>(items: readonly T[], rng: Rng): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("Nothing to pick from");
  return item;
}

function seatPerspective(view: ResistancePlayerView): Perspective {
  if (view.role === null) return { kind: "public" };
  return { kind: "seat", seat: view.seat, role: view.role, knownSpies: view.knownSpies };
}

function envOf(view: ResistancePlayerView): ModelEnv {
  return {
    playerCount: view.playerCount,
    blindSpies: view.variants.blindSpies,
    assumptions: defaultAssumptions(),
  };
}

/** One of the near-best options, so a bot isn't perfectly predictable. */
function nearBest(ranked: readonly TeamOdds[], rng: Rng, key: "pSuccess" | "pClean"): TeamOdds {
  const best = ranked[0];
  if (!best) throw new Error("No team to propose");
  const close = ranked.filter((t) => t[key] >= best[key] - 0.01).slice(0, 6);
  return pick(close, rng);
}

function analystProposal(view: ResistancePlayerView, rng: Rng): ResistanceAction {
  const env = envOf(view);
  const pos = tablePosition(view.record);
  const situation = { successes: pos.successes, fails: pos.fails, rejections: pos.rejections };
  const spiesKnown = view.knownSpies.length === spyCount(view.playerCount);

  if (view.role === "spy" && spiesKnown) {
    const pub = analyze(view.record, env.assumptions);
    const snap = pub.snapshots.at(-1);
    if (snap) {
      const ranked = rankSpyTeams(pub, snap, view.knownSpies, pos.openMissions, situation, env);
      // Leaders usually sit on their own team; a spy leader who doesn't stands out.
      const withSelf = ranked.filter((t) => t.team.includes(view.seat));
      const pool = withSelf.length > 0 ? withSelf : ranked;
      if (pool.length > 0) {
        const choice = nearBest(pool, rng, "pClean");
        return { type: "propose", mission: choice.mission, team: choice.team };
      }
    }
  }

  const analysis = analyze(view.record, env.assumptions, seatPerspective(view));
  const snap = analysis.snapshots.at(-1);
  if (!snap) throw new Error("Analysis without a snapshot");
  let ranked = rankTeams(analysis, snap, pos.openMissions, situation, env, view.seat);
  // A blind spy knows only itself; it still wants to be aboard to sabotage.
  if (view.role === "spy") ranked = ranked.filter((t) => t.team.includes(view.seat));
  const choice = nearBest(ranked, rng, "pSuccess");
  return { type: "propose", mission: choice.mission, team: choice.team };
}

function analystVote(view: ResistancePlayerView, rng: Rng): boolean {
  const proposal = view.record.rounds.at(-1)?.proposals.at(-1);
  if (!proposal) return true;
  const pos = tablePosition(view.record);
  const hammer = pos.rejections === 4;
  const env = envOf(view);
  const situation = { successes: pos.successes, fails: pos.fails, rejections: pos.rejections };

  if (view.role === "spy") {
    const spiesAboard = popcount(maskOf(proposal.team) & maskOf(view.knownSpies));
    if (hammer) return true; // A lone "no" on the hammer outs a spy for nothing.
    if (pos.successes === 2 && spiesAboard === 0) return false; // A clean team now wins it.
    // Otherwise vote like the Resistance would, with only a nudge towards spy
    // teams — backing them heavily is a tell the Solver reads.
    const disguise = resistanceVote(view, proposal, situation, env, {
      kind: "seat",
      seat: view.seat,
      role: "resistance",
      knownSpies: [],
    });
    return disguise || (spiesAboard > 0 && rng() < 0.35);
  }

  if (hammer) return true;
  return resistanceVote(view, proposal, situation, env, seatPerspective(view));
}

/** Approve a team whose odds are close to the best this mission could get. */
function resistanceVote(
  view: ResistancePlayerView,
  proposal: { team: number[]; mission: number },
  situation: Situation,
  env: ModelEnv,
  perspective: Perspective,
): boolean {
  const analysis = analyze(view.record, env.assumptions, perspective);
  const snap = analysis.snapshots.at(-1);
  if (!snap || snap.alive === 0) return true;
  const odds = teamOdds(analysis, snap, proposal.team, proposal.mission, situation, env);
  const best = rankTeams(analysis, snap, [proposal.mission], situation, env)[0];
  if (!best) return true;
  return odds.pSuccess >= 0.95 || odds.pSuccess >= best.pSuccess - 0.1;
}

function analystCard(view: ResistancePlayerView, rng: Rng): "success" | "fail" {
  if (view.role !== "spy") return "success";
  const proposal = view.record.rounds.at(-1)?.proposals.at(-1);
  if (!proposal) return "success";
  const pos = tablePosition(view.record);
  const spiesOnTeam = Math.max(1, popcount(maskOf(proposal.team) & maskOf(view.knownSpies)));
  const { chance } = spyFailChance(
    {
      mission: proposal.mission,
      teamSize: proposal.team.length,
      spiesOnTeam,
      situation: { successes: pos.successes, fails: pos.fails, rejections: pos.rejections },
    },
    { ...envOf(view), assumptions: { ...defaultAssumptions(), baseFailRate: BOT_SPY_FAIL_RATE } },
  );
  // A spy who can't reach the fails needed on its own (and knows it) keeps its cover.
  if (!view.variants.blindSpies && spiesOnTeam < failsNeeded(view.playerCount, proposal.mission)) {
    return "success";
  }
  return rng() < chance ? "fail" : "success";
}

/** The bot's move from its own view and its legal actions. */
export function decideAction(
  strategy: AIStrategyId,
  view: ResistancePlayerView,
  legal: readonly ResistanceAction[],
  rng: Rng,
): ResistanceAction {
  if (legal.length === 0) throw new Error("Bot has no legal action");
  if (strategy === "random") return pick(legal, rng);

  const kind = legal[0]?.type;
  if (kind === "propose") return analystProposal(view, rng);
  if (kind === "vote") return { type: "vote", approve: analystVote(view, rng) };
  const card = analystCard(view, rng);
  return legal.some((a) => a.type === "play" && a.card === card)
    ? { type: "play", card }
    : { type: "play", card: "success" };
}
