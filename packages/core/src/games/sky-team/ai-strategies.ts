import { BRAKES_ORDER, FLAPS_ORDER, LANDING_GEAR_SLOTS } from "./scenarios";
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

// Axis + engine MUST be filled by their player every round, or the round ends
// in `loss-mandatory`. Each player owns exactly two.
const MANDATORY_BY_PLAYER: Record<PlayerIndex, readonly SlotId[]> = {
  0: ["pilot-axis", "pilot-engine"],
  1: ["copilot-axis", "copilot-engine"],
};

function emptyMandatoryForPlayer(view: SkyTeamPlayerView, player: PlayerIndex): SlotId[] {
  return MANDATORY_BY_PLAYER[player].filter((s) => view.slots[s].die == null);
}

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

// Rounds of descent remaining: the game forces a landing when altitude hits 0,
// so altitude — not `totalRounds` — is the real clock for approach pacing.
function descentRoundsLeft(view: SkyTeamPlayerView): number {
  return Math.max(1, Math.round(view.altitude.feet / view.scenario.altitudeStep));
}

// How eager to deploy gear/flaps right now. They're mandatory-green for landing
// but each deployment narrows the speed gauge, so defer while still advancing.
function gearFlapsPriority(view: SkyTeamPlayerView): number {
  const roundsLeft = descentRoundsLeft(view);
  const spacesLeft = view.approach.airportIndex - view.approach.current;
  if (roundsLeft <= 2) return 42; // must finish deploying before the landing
  if (spacesLeft <= 1) return 28; // at/near the airport — safe to deploy
  if (spacesLeft <= roundsLeft) return 14; // ahead of pace — some slack
  return 4; // behind on approach — keep dice for the engines
}

function scoreSlot(
  view: SkyTeamPlayerView,
  player: PlayerIndex,
  slot: SlotId,
  value: DieValue,
): { risk: number; progress: number } {
  let risk = 0;
  let progress = 0;

  switch (slot) {
    case "pilot-axis":
    case "copilot-axis": {
      const otherSlot: SlotId = slot === "pilot-axis" ? "copilot-axis" : "pilot-axis";
      const other = effectiveValueAt(view, otherSlot);
      if (other != null) {
        const delta = slot === "pilot-axis" ? value - other : other - value;
        const nextAxis = view.axis.position + delta;
        if (Math.abs(nextAxis) >= view.axis.spinAt) risk += 1000;
        else {
          progress += 90 - Math.abs(nextAxis) * 30; // strongly drive toward level
          if (nextAxis === 0) progress += 25;
        }
        // The final round only lands if the axis ends exactly level.
        if (view.isFinalRound && nextAxis !== 0) risk += 1000;
      } else {
        // First placer: a moderate value leaves the partner the most room to
        // bring the axis back to level on their matching die.
        progress += 18 - Math.abs(value - 4) * 3;
      }
      break;
    }

    case "pilot-engine":
    case "copilot-engine": {
      const otherSlot: SlotId = slot === "pilot-engine" ? "copilot-engine" : "pilot-engine";
      const other = effectiveValueAt(view, otherSlot);
      if (view.isFinalRound) {
        // Land slow: total speed must stay UNDER brakeTrack + offset.
        const threshold = view.brakeTrack.pos + view.scenario.brakeThresholdOffset;
        if (other != null) {
          const speed = value + other;
          if (speed >= threshold) risk += 1000;
          else progress += 50 - Math.abs(threshold - 1 - speed) * 6;
        } else {
          // Partner unknown: keep our half low so the pair lands under threshold.
          const wantHalf = clampToDie(Math.floor((threshold - 1) / 2));
          progress += 26 - Math.abs(value - wantHalf) * 6;
        }
      } else {
        const blueT = view.speedGauge.bluePos + 1;
        const orangeT = view.speedGauge.orangePos + 1;
        const computeAdvance = (s: number) => (s < blueT ? 0 : s <= orangeT ? 1 : 2);
        const spacesLeft = view.approach.airportIndex - view.approach.current;
        // Advancing is clamped at the airport (no overshoot unless we advance
        // while already there), so bank progress: push the max advance until we
        // arrive, then idle. This avoids the slow-drip undershoot loss.
        const targetAdvance = spacesLeft <= 0 ? 0 : 2;
        if (other != null) {
          const speed = value + other;
          const advance = computeAdvance(speed);
          if (advance > 0) {
            // Engine resolution collides if an airliner sits on the CURRENT
            // space, and overshoots if already at the airport.
            if (view.approach.current === view.approach.airportIndex) risk += 1000;
            if ((view.approach.airliners[view.approach.current] ?? 0) > 0) risk += 1000;
          }
          // Falling short of the needed pace is what loses by undershoot, so
          // punish a deficit hard; mild penalty for overshooting the target.
          const deficit = Math.max(0, targetAdvance - advance);
          const surplus = Math.max(0, advance - targetAdvance);
          progress += 60 - deficit * 34 - surplus * 6;
        } else {
          // Partner unknown: pick our half to enable the target advance,
          // leaning high so the pair can actually clear the advance-2 band.
          const needSpeed = targetAdvance === 2 ? orangeT + 2 : blueT - 1;
          const wantHalf = clampToDie(Math.ceil(needSpeed / 2));
          progress += 26 - Math.abs(value - wantHalf) * 5;
        }
      }
      break;
    }

    case "pilot-radio":
    case "copilot-radio-1":
    case "copilot-radio-2": {
      const target = view.approach.current + value - 1;
      const airliners = view.approach.airliners;
      if (target < 0 || target >= airliners.length || target > view.approach.airportIndex) {
        progress -= 8; // radio aimed past the board / airport — wasted
      } else if ((airliners[target] ?? 0) > 0) {
        // Clearing the space we're sitting on unblocks advancing — top priority.
        if (target === view.approach.current) progress += 90;
        else progress += 55 - (target - view.approach.current) * 4;
      } else {
        progress -= 6;
      }
      break;
    }

    case "landing-gear-1":
    case "landing-gear-2":
    case "landing-gear-3": {
      const greenCount = LANDING_GEAR_SLOTS.filter((id) => view.slots[id].switchOn).length;
      const remaining = LANDING_GEAR_SLOTS.length - greenCount;
      progress += gearFlapsPriority(view) + remaining * 2;
      break;
    }

    case "flaps-1":
    case "flaps-2":
    case "flaps-3":
    case "flaps-4": {
      const greenCount = FLAPS_ORDER.filter((id) => view.slots[id].switchOn).length;
      const remaining = FLAPS_ORDER.length - greenCount;
      progress += gearFlapsPriority(view) + remaining * 2;
      break;
    }

    case "brakes-2":
    case "brakes-4":
    case "brakes-6": {
      const greenCount = BRAKES_ORDER.filter((id) => view.slots[id].switchOn).length;
      // Brakes raise the final-round speed threshold, so deploy them before the
      // landing — urgency climbs as the descent runs out.
      const roundsLeft = descentRoundsLeft(view);
      const urgency = view.isFinalRound || roundsLeft <= 2 ? 36 : Math.min(view.round * 3, 18);
      progress += urgency + (BRAKES_ORDER.length - greenCount) * 3;
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

  // Gentle nudge to make safe progress on mandatory slots when convenient.
  // (Hard reservation — forcing the die onto a mandatory slot when dice run
  // low — is enforced by candidate filtering in `pickAction`.)
  if (MANDATORY_BY_PLAYER[player].includes(candidate.slot)) progress += 8;

  if (candidate.coffeeAdjust !== 0) {
    progress -= Math.abs(candidate.coffeeAdjust) * 2;
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

    // Hard mandatory reservation: once every remaining die is needed to fill a
    // still-empty axis/engine slot, restrict this placement to those slots so
    // one can never be left empty (which would lose the round outright).
    const emptyMandatory = emptyMandatoryForPlayer(view, player);
    let candidates = placements;
    if (emptyMandatory.length >= view.myDice.length) {
      const mandatoryOnly = placements.filter((p) => MANDATORY_BY_PLAYER[player].includes(p.slot));
      if (mandatoryOnly.length > 0) candidates = mandatoryOnly;
    }

    const scored = candidates.map((c) => evaluateCandidate(view, player, c));
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
