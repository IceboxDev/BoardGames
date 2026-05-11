import { BASE_SLOT_DEFS, BRAKES_ORDER, FLAPS_ORDER, LANDING_GEAR_SLOTS } from "./scenarios";
import type { DieValue, PlayerIndex, SkyTeamAction, SkyTeamPlayerView, SlotId } from "./types";

export interface SkyTeamAIStrategy {
  id: string;
  label: string;
  description: string;
  pickAction(view: SkyTeamPlayerView, legal: SkyTeamAction[], player: PlayerIndex): SkyTeamAction;
}

/** Always picks the first legal action; useful as a placeholder. */
export const STUB_AI: SkyTeamAIStrategy = {
  id: "stub",
  label: "Stub AI",
  description: "Picks the first legal action; auto-readies; never re-rolls.",
  pickAction(view, legal, _player) {
    if (view.phase === "briefing" && !view.readyForRoll[view.viewerIndex]) {
      return { kind: "ready-to-roll" };
    }
    if (legal.length === 0) throw new Error("STUB_AI: no legal actions");
    const placement = legal.find((a) => a.kind === "place-die");
    if (placement) return placement;
    return legal[0];
  },
};

type PlaceDieAction = Extract<SkyTeamAction, { kind: "place-die" }>;

interface ScoredCandidate {
  action: PlaceDieAction;
  risk: number;
  progress: number;
  /** Lower is better when combining risk and progress. */
  cost: number;
}

function effectiveValueAt(view: SkyTeamPlayerView, slot: SlotId): DieValue | null {
  return view.slots[slot].die?.value ?? null;
}

function scoreSlot(
  view: SkyTeamPlayerView,
  player: PlayerIndex,
  slot: SlotId,
  value: DieValue,
): { risk: number; progress: number } {
  let risk = 0;
  let progress = 0;

  const totalRoundsLeft = view.scenario.totalRounds - view.round + 1;
  const turnsThisRoundForMe = view.myDice.length;

  switch (slot) {
    case "pilot-axis":
    case "copilot-axis": {
      const otherSlot: SlotId = slot === "pilot-axis" ? "copilot-axis" : "pilot-axis";
      const other = effectiveValueAt(view, otherSlot);
      if (other != null) {
        const delta = slot === "pilot-axis" ? value - other : other - value;
        const nextAxis = view.axis.position + delta;
        if (Math.abs(nextAxis) >= view.axis.spinAt) risk += 1000;
        else progress += 60 - Math.abs(nextAxis) * 12;
      } else {
        const desired = -view.axis.position;
        progress += 30 - Math.abs(value - clampToDie(desired + 3.5));
      }
      break;
    }

    case "pilot-engine":
    case "copilot-engine": {
      const otherSlot: SlotId = slot === "pilot-engine" ? "copilot-engine" : "pilot-engine";
      const other = effectiveValueAt(view, otherSlot);
      if (view.isFinalRound) {
        if (other != null) {
          const speed = value + other;
          const threshold = view.brakeTrack.pos + view.scenario.brakeThresholdOffset;
          if (speed >= threshold) risk += 1000;
          else progress += 40 - Math.abs(threshold - 1 - speed) * 5;
        } else {
          progress += 30 - Math.abs(value - 1) * 4;
        }
      } else {
        if (other != null) {
          const speed = value + other;
          const blueT = view.speedGauge.bluePos + 1;
          const orangeT = view.speedGauge.orangePos + 1;
          const advance = speed < blueT ? 0 : speed <= orangeT ? 1 : 2;
          if (advance > 0) {
            const here = view.approach.airliners[view.approach.current] ?? 0;
            const atAirport = view.approach.current === view.approach.airportIndex;
            if (here > 0) risk += 1000;
            if (atAirport) risk += 1000;
          }
          const spacesLeft = view.approach.airportIndex - view.approach.current;
          const needPerRound = spacesLeft / totalRoundsLeft;
          progress += 25 - Math.abs(advance - needPerRound) * 10;
        } else {
          progress += 12 - Math.abs(value - 4);
        }
      }
      break;
    }

    case "pilot-radio":
    case "copilot-radio-1":
    case "copilot-radio-2": {
      const target = view.approach.current + value - 1;
      const airliners = view.approach.airliners[target] ?? 0;
      if (airliners > 0) progress += 70 - (target - view.approach.current) * 3;
      else progress -= 5;
      break;
    }

    case "landing-gear-1":
    case "landing-gear-2":
    case "landing-gear-3": {
      const greenCount = LANDING_GEAR_SLOTS.filter((id) => view.slots[id].switchOn).length;
      const remaining = 3 - greenCount;
      progress += 25 + remaining * 3;
      break;
    }

    case "flaps-1":
    case "flaps-2":
    case "flaps-3": {
      const greenCount = FLAPS_ORDER.filter((id) => view.slots[id].switchOn).length;
      const remaining = 3 - greenCount;
      progress += 25 + remaining * 3;
      break;
    }

    case "brakes-2":
    case "brakes-4":
    case "brakes-6": {
      const greenCount = BRAKES_ORDER.filter((id) => view.slots[id].switchOn).length;
      const urgency = view.isFinalRound ? 30 : Math.min(view.round * 2, 15);
      progress += urgency + (3 - greenCount) * 2;
      break;
    }

    case "concentration-1":
    case "concentration-2":
    case "concentration-3": {
      if (view.coffeeTokens >= 3) progress -= 5;
      else progress += 4 + (3 - view.coffeeTokens) * 2 + (4 - Math.abs(value - 3.5));
      break;
    }
  }

  void player;
  void turnsThisRoundForMe;
  return { risk, progress };
}

function clampToDie(n: number): number {
  return Math.max(1, Math.min(6, n));
}

function evaluateCandidate(
  view: SkyTeamPlayerView,
  player: PlayerIndex,
  candidate: PlaceDieAction,
): ScoredCandidate {
  const die = view.myDice.find((d) => d.id === candidate.dieId);
  if (!die) return { action: candidate, risk: 1000, progress: -1000, cost: 1_000_000 };
  const value = clampToDie(die.value + candidate.coffeeAdjust) as DieValue;
  let { risk, progress } = scoreSlot(view, player, candidate.slot, value);

  if (BASE_SLOT_DEFS[candidate.slot].mandatory) {
    const def = BASE_SLOT_DEFS[candidate.slot];
    const matchesMe =
      (def.eligibility === "pilot" && player === 0) ||
      (def.eligibility === "copilot" && player === 1);
    if (matchesMe && view.myDice.length === 1) progress += 250;
  }

  if (candidate.coffeeAdjust !== 0) {
    progress -= Math.abs(candidate.coffeeAdjust) * 4;
  }

  const cost = risk * 1000 - progress;
  return { action: candidate, risk, progress, cost };
}

export const HEURISTIC_V1: SkyTeamAIStrategy = {
  id: "heuristic-v1",
  label: "Heuristic",
  description:
    "Rule-based AI: prefers safe placements (no axis spin, no collision), advances tracks under pressure, spends coffee only to avoid crashes.",
  pickAction(view, legal, player) {
    if (view.phase === "briefing" && !view.readyForRoll[view.viewerIndex]) {
      return { kind: "ready-to-roll" };
    }
    if (legal.length === 0) throw new Error("HEURISTIC_V1: no legal actions");
    const placements = legal.filter((a): a is PlaceDieAction => a.kind === "place-die");
    if (placements.length === 0) return legal[0];

    const scored = placements.map((c) => evaluateCandidate(view, player, c));
    scored.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      const aValue = view.myDice.find((d) => d.id === a.action.dieId)?.value ?? 6;
      const bValue = view.myDice.find((d) => d.id === b.action.dieId)?.value ?? 6;
      return aValue - bValue;
    });
    return scored[0].action;
  },
};

const REGISTRY: Record<string, SkyTeamAIStrategy> = {
  stub: STUB_AI,
  "heuristic-v1": HEURISTIC_V1,
};

export function getStrategy(id: string): SkyTeamAIStrategy {
  const s = REGISTRY[id];
  if (!s) throw new Error(`Unknown Sky Team AI strategy: ${id}`);
  return s;
}

export function registerStrategy(strategy: SkyTeamAIStrategy): void {
  REGISTRY[strategy.id] = strategy;
}

export const ALL_STRATEGIES: SkyTeamAIStrategy[] = [HEURISTIC_V1, STUB_AI];

export const SKY_TEAM_STRATEGIES_FOR_UI: { id: string; label: string }[] = [
  { id: "heuristic-v1", label: "Heuristic" },
];
