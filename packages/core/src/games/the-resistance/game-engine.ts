import { rngFrom, rngStateFromSeed, shuffle } from "../../lib/rng";
import type { MissionCard, Role, Variants } from "./record";
import {
  combinations,
  failsNeeded,
  isApproved,
  openProposal,
  spyCount,
  tablePosition,
  teamSize,
} from "./rules";
import type { AIStrategyId, GameState, ResistanceAction } from "./types";

export interface ResistanceSetup {
  playerCount: number;
  strategies: (AIStrategyId | null)[];
  variants: Variants;
  seed: number;
}

export function createInitialState({
  playerCount,
  strategies,
  variants,
  seed,
}: ResistanceSetup): GameState {
  const carrier = { rngState: rngStateFromSeed(seed) };
  const rng = rngFrom(carrier);
  const spies = spyCount(playerCount);
  const roles: Role[] = shuffle(
    Array.from({ length: playerCount }, (_, i): Role => (i < spies ? "spy" : "resistance")),
    rng,
  );
  const firstLeader = Math.floor(rng() * playerCount);
  return {
    rngState: carrier.rngState,
    record: {
      playerCount,
      variants,
      firstLeader,
      rounds: [{ proposals: [], result: null }],
      roles,
      winner: null,
      winReason: null,
    },
    phase: "proposing",
    pendingVotes: Array(playerCount).fill(null),
    pendingCards: Array(playerCount).fill(null),
    strategies,
  };
}

/** Everything `player` may do now. Proposals are enumerated in full (≤ 252 teams × targets). */
export function getLegalActions(state: GameState, player: number): ResistanceAction[] {
  const { record } = state;
  switch (state.phase) {
    case "proposing": {
      const pos = tablePosition(record);
      if (player !== pos.leader) return [];
      return pos.openMissions.flatMap((mission) =>
        combinations(record.playerCount, teamSize(record.playerCount, mission)).map(
          (team): ResistanceAction => ({ type: "propose", mission, team }),
        ),
      );
    }
    case "voting":
      if (state.pendingVotes[player] !== null || player < 0 || player >= record.playerCount) {
        return [];
      }
      return [
        { type: "vote", approve: true },
        { type: "vote", approve: false },
      ];
    case "mission": {
      const proposal = openProposal(record);
      if (!proposal?.team.includes(player) || state.pendingCards[player] !== null) return [];
      // Resistance operatives MUST play Success: Fail simply isn't offered.
      const cards: MissionCard[] =
        record.roles[player] === "spy" ? ["success", "fail"] : ["success"];
      return cards.map((card) => ({ type: "play", card }));
    }
    default:
      return [];
  }
}

/** The leader while proposing; `-1` during the simultaneous phases and after the game. */
export function getActivePlayer(state: GameState): number {
  return state.phase === "proposing" ? tablePosition(state.record).leader : -1;
}

/** Seats still owing a vote / a card. */
export function pendingSeats(state: GameState): number[] {
  if (state.phase === "voting") {
    return state.pendingVotes.flatMap((v, i) => (v === null ? [i] : []));
  }
  if (state.phase === "mission") {
    const team = openProposal(state.record)?.team ?? [];
    return team.filter((seat) => state.pendingCards[seat] === null);
  }
  return [];
}

/**
 * Apply one seat's action. Throws on anything illegal — the machine wraps this
 * in `safeApply`, and the validator only ever passes engine-listed actions.
 */
export function applyAction(state: GameState, player: number, action: ResistanceAction): GameState {
  const legal = getLegalActions(state, player);
  if (!legal.some((a) => sameAction(a, action))) {
    throw new Error(`Illegal Resistance action for seat ${player}: ${JSON.stringify(action)}`);
  }
  const next = structuredClone(state);
  const round = next.record.rounds.at(-1);
  if (!round) throw new Error("No round in progress");

  switch (action.type) {
    case "propose":
      round.proposals.push({
        leader: player,
        mission: action.mission,
        team: [...action.team],
        votes: null,
      });
      next.phase = "voting";
      next.pendingVotes = Array(next.record.playerCount).fill(null);
      return next;

    case "vote":
      next.pendingVotes[player] = action.approve;
      return next.pendingVotes.every((v) => v !== null) ? resolveVote(next) : next;

    case "play":
      next.pendingCards[player] = action.card;
      return pendingSeats(next).length === 0 ? resolveMission(next) : next;
  }
}

function sameAction(a: ResistanceAction, b: ResistanceAction): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "propose" && b.type === "propose") {
    return a.mission === b.mission && a.team.join() === b.team.join();
  }
  if (a.type === "vote" && b.type === "vote") return a.approve === b.approve;
  if (a.type === "play" && b.type === "play") return a.card === b.card;
  return false;
}

function resolveVote(state: GameState): GameState {
  const { record } = state;
  const proposal = record.rounds.at(-1)?.proposals.at(-1);
  if (!proposal) throw new Error("Vote without a proposal");
  proposal.votes = state.pendingVotes.map((v) => v === true);
  state.pendingVotes = Array(record.playerCount).fill(null);

  if (isApproved(proposal.votes, record.playerCount)) {
    state.phase = "mission";
    state.pendingCards = Array(record.playerCount).fill(null);
    return state;
  }
  return finishIfOver(state) ?? { ...state, phase: "proposing" };
}

function resolveMission(state: GameState): GameState {
  const { record } = state;
  const round = record.rounds.at(-1);
  const proposal = round?.proposals.at(-1);
  if (!round || !proposal) throw new Error("Mission without an approved team");
  const cards = state.pendingCards.map((c, seat) => (proposal.team.includes(seat) ? c : null));
  const fails = cards.filter((c) => c === "fail").length;
  round.result = {
    mission: proposal.mission,
    team: proposal.team,
    fails,
    success: fails < failsNeeded(record.playerCount, proposal.mission),
    cards,
  };
  state.pendingCards = Array(record.playerCount).fill(null);
  const over = finishIfOver(state);
  if (over) return over;
  record.rounds.push({ proposals: [], result: null });
  state.phase = "proposing";
  return state;
}

function finishIfOver(state: GameState): GameState | null {
  const pos = tablePosition(state.record);
  if (!pos.winner) return null;
  state.record.winner = pos.winner;
  state.record.winReason = pos.winReason;
  state.phase = "game-over";
  return state;
}
