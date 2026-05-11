import { type Rng, rollDie } from "./rng";
import {
  BRAKES_ORDER,
  COFFEE_TOKEN_CAP,
  CONCENTRATION_SLOTS,
  FLAPS_ORDER,
  getSlotDef,
  LANDING_GEAR_SLOTS,
  MANDATORY_SLOTS,
  NON_PERSISTENT_SLOTS,
  RADIO_SLOTS,
} from "./scenarios";
import type {
  Die,
  DieValue,
  PlayerIndex,
  SkyTeamAction,
  SkyTeamGameState,
  SkyTeamLogEntry,
  SlotId,
  SlotState,
} from "./types";

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActionError";
  }
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function asDieValue(n: number): DieValue {
  return clamp(Math.round(n), 1, 6) as DieValue;
}

function diceColor(player: PlayerIndex): "blue" | "orange" {
  return player === 0 ? "blue" : "orange";
}

function pushLog(state: SkyTeamGameState, entry: SkyTeamLogEntry): void {
  state.log.push(entry);
}

function setOutcome(state: SkyTeamGameState, outcome: SkyTeamGameState["outcome"]): void {
  if (state.outcome != null) return;
  state.outcome = outcome;
  state.phase = "game-over";
  if (outcome) pushLog(state, { t: "outcome", outcome });
}

export function rollDice(state: SkyTeamGameState, rng: Rng): SkyTeamGameState {
  const next = clone(state);
  next.unplacedDice = [[], []];
  for (const player of [0, 1] as PlayerIndex[]) {
    const count = next.scenario.dicePerPlayer[player];
    const values: DieValue[] = [];
    for (let i = 0; i < count; i++) {
      const v = rollDie(rng);
      const die: Die = {
        id: next.nextDieId++,
        color: diceColor(player),
        value: v,
        owner: player,
        source: "rolled",
      };
      next.unplacedDice[player].push(die);
      values.push(v);
    }
    pushLog(next, { t: "roll", player, values });
  }
  next.phase = "placement";
  next.toPlace = next.firstThisRound;
  return next;
}

export function applyReadyToRoll(state: SkyTeamGameState, player: PlayerIndex): SkyTeamGameState {
  if (state.phase !== "briefing") {
    throw new InvalidActionError(`ready-to-roll only legal in briefing, not ${state.phase}`);
  }
  if (state.readyForRoll[player]) return state;
  const next = clone(state);
  next.readyForRoll[player] = true;
  pushLog(next, { t: "ready", player });
  return next;
}

export function applyReroll(
  state: SkyTeamGameState,
  pilotDieIds: number[],
  copilotDieIds: number[],
  rng: Rng,
): SkyTeamGameState {
  if (state.phase !== "placement") {
    throw new InvalidActionError("reroll only legal during placement");
  }
  if (state.rerollTokens <= 0) {
    throw new InvalidActionError("no reroll tokens available");
  }
  if (pilotDieIds.length + copilotDieIds.length === 0) {
    throw new InvalidActionError("must select at least one die to reroll");
  }
  for (const id of pilotDieIds) {
    if (!state.unplacedDice[0].some((d) => d.id === id)) {
      throw new InvalidActionError(`die ${id} not in pilot's hand`);
    }
  }
  for (const id of copilotDieIds) {
    if (!state.unplacedDice[1].some((d) => d.id === id)) {
      throw new InvalidActionError(`die ${id} not in copilot's hand`);
    }
  }

  const next = clone(state);
  next.rerollTokens -= 1;
  for (const die of next.unplacedDice[0]) {
    if (pilotDieIds.includes(die.id)) {
      die.value = rollDie(rng);
      die.source = "rerolled";
    }
  }
  for (const die of next.unplacedDice[1]) {
    if (copilotDieIds.includes(die.id)) {
      die.value = rollDie(rng);
      die.source = "rerolled";
    }
  }
  pushLog(next, {
    t: "reroll",
    pilotIds: [...pilotDieIds],
    copilotIds: [...copilotDieIds],
    remaining: next.rerollTokens,
  });
  return next;
}

function eligibilityAllowsPlayer(
  eligibility: "pilot" | "copilot" | "both",
  player: PlayerIndex,
): boolean {
  if (eligibility === "both") return true;
  if (eligibility === "pilot") return player === 0;
  return player === 1;
}

function isOrderedSlotReady(state: SkyTeamGameState, slot: SlotId): boolean {
  if (FLAPS_ORDER.includes(slot)) {
    const idx = FLAPS_ORDER.indexOf(slot);
    for (let i = 0; i < idx; i++) {
      if (!state.slots[FLAPS_ORDER[i]].switchOn) return false;
    }
    return true;
  }
  if (BRAKES_ORDER.includes(slot)) {
    const idx = BRAKES_ORDER.indexOf(slot);
    for (let i = 0; i < idx; i++) {
      if (!state.slots[BRAKES_ORDER[i]].switchOn) return false;
    }
    return true;
  }
  return true;
}

export function isLegalPlacement(
  state: SkyTeamGameState,
  player: PlayerIndex,
  slot: SlotId,
  value: DieValue,
): boolean {
  const def = getSlotDef(state.scenario, slot);
  if (!eligibilityAllowsPlayer(def.eligibility, player)) return false;
  if (state.slots[slot].die != null) return false;
  if (def.allowedValues && !def.allowedValues.includes(value)) return false;
  if (def.ordered && !isOrderedSlotReady(state, slot)) return false;
  return true;
}

function applyPlaceDie(
  state: SkyTeamGameState,
  player: PlayerIndex,
  dieId: number,
  slot: SlotId,
  coffeeAdjust: number,
): SkyTeamGameState {
  if (state.phase !== "placement") {
    throw new InvalidActionError(`place-die only legal in placement, not ${state.phase}`);
  }
  if (state.toPlace !== player) {
    throw new InvalidActionError(`not ${player === 0 ? "pilot" : "copilot"}'s turn`);
  }
  const die = state.unplacedDice[player].find((d) => d.id === dieId);
  if (!die) {
    throw new InvalidActionError(`die ${dieId} not in hand`);
  }
  const coffeeNeeded = Math.abs(coffeeAdjust);
  if (coffeeNeeded > state.coffeeTokens) {
    throw new InvalidActionError(
      `coffee adjust requires ${coffeeNeeded} tokens; have ${state.coffeeTokens}`,
    );
  }
  const adjustedValue = asDieValue(die.value + coffeeAdjust);
  if (!isLegalPlacement(state, player, slot, adjustedValue)) {
    throw new InvalidActionError(
      `illegal placement of value ${adjustedValue} into ${slot} by player ${player}`,
    );
  }

  const next = clone(state);
  if (coffeeNeeded > 0) {
    next.coffeeTokens -= coffeeNeeded;
    pushLog(next, { t: "coffee-spent", amount: coffeeNeeded });
  }
  next.unplacedDice[player] = next.unplacedDice[player].filter((d) => d.id !== dieId);
  const placedDie: Die = { ...die, value: adjustedValue };
  next.slots[slot].die = placedDie;
  pushLog(next, {
    t: "place",
    player,
    dieId,
    value: adjustedValue,
    slot,
    coffeeAdjust,
  });

  runSlotEffect(next, slot);
  if (next.outcome != null) return next;

  const otherHas = next.unplacedDice[1 - player].length > 0;
  if (otherHas) next.toPlace = (1 - player) as PlayerIndex;
  return next;
}

function runSlotEffect(state: SkyTeamGameState, slot: SlotId): void {
  if (slot === "pilot-axis" || slot === "copilot-axis") {
    runAxisEffect(state);
    return;
  }
  if (slot === "pilot-engine" || slot === "copilot-engine") {
    runEngineEffect(state);
    return;
  }
  if (RADIO_SLOTS.includes(slot)) {
    const value = state.slots[slot].die?.value;
    if (value != null) runRadioEffect(state, value);
    return;
  }
  if (LANDING_GEAR_SLOTS.includes(slot)) {
    runLandingGearEffect(state, slot);
    return;
  }
  if (FLAPS_ORDER.includes(slot)) {
    runFlapsEffect(state, slot);
    return;
  }
  if (BRAKES_ORDER.includes(slot)) {
    runBrakesEffect(state, slot);
    return;
  }
  if (CONCENTRATION_SLOTS.includes(slot)) {
    runConcentrationEffect(state);
  }
}

function runAxisEffect(state: SkyTeamGameState): void {
  const pilot = state.slots["pilot-axis"].die;
  const copilot = state.slots["copilot-axis"].die;
  if (!pilot || !copilot) return;
  const delta = pilot.value - copilot.value;
  state.axis.position += delta;
  pushLog(state, { t: "axis-update", pos: state.axis.position });
  if (Math.abs(state.axis.position) >= state.axis.spinAt) {
    setOutcome(state, "loss-spin");
  }
}

function runEngineEffect(state: SkyTeamGameState): void {
  const pilot = state.slots["pilot-engine"].die;
  const copilot = state.slots["copilot-engine"].die;
  if (!pilot || !copilot) return;
  const speed = pilot.value + copilot.value;

  if (state.isFinalRound) {
    state.finalRoundSpeed = speed;
    const threshold = state.brakeTrack.pos + state.scenario.brakeThresholdOffset;
    pushLog(state, { t: "engine-resolve", speed, advance: 0, finalRound: true });
    if (speed >= threshold) {
      setOutcome(state, "loss-overrun");
    }
    return;
  }

  const blueT = state.speedGauge.bluePos + 1;
  const orangeT = state.speedGauge.orangePos + 1;
  const advance = speed < blueT ? 0 : speed <= orangeT ? 1 : 2;
  pushLog(state, { t: "engine-resolve", speed, advance, finalRound: false });

  if (advance > 0) {
    if (state.approach.current === state.approach.airportIndex) {
      setOutcome(state, "loss-overshoot");
      return;
    }
    if (
      state.approach.airliners[state.approach.current] != null &&
      state.approach.airliners[state.approach.current] > 0
    ) {
      setOutcome(state, "loss-collision");
      return;
    }
    state.approach.current = Math.min(
      state.approach.current + advance,
      state.approach.airportIndex,
    );
  }
}

function runRadioEffect(state: SkyTeamGameState, value: DieValue): void {
  const target = state.approach.current + value - 1;
  if (target >= state.approach.airliners.length) {
    pushLog(state, { t: "radio", targetSpace: target, removed: false });
    return;
  }
  if (state.approach.airliners[target] > 0) {
    state.approach.airliners[target] -= 1;
    pushLog(state, { t: "radio", targetSpace: target, removed: true });
  } else {
    pushLog(state, { t: "radio", targetSpace: target, removed: false });
  }
}

function runLandingGearEffect(state: SkyTeamGameState, slot: SlotId): void {
  state.slots[slot].switchOn = true;
  state.speedGauge.bluePos += 1;
  pushLog(state, { t: "gear", slot, bluePos: state.speedGauge.bluePos });
}

function runFlapsEffect(state: SkyTeamGameState, slot: SlotId): void {
  state.slots[slot].switchOn = true;
  state.speedGauge.orangePos += 1;
  pushLog(state, { t: "flaps", slot, orangePos: state.speedGauge.orangePos });
}

function runBrakesEffect(state: SkyTeamGameState, slot: SlotId): void {
  state.slots[slot].switchOn = true;
  state.brakeTrack.pos += 1;
  pushLog(state, { t: "brakes", slot, brakePos: state.brakeTrack.pos });
}

function runConcentrationEffect(state: SkyTeamGameState): void {
  if (state.coffeeTokens >= COFFEE_TOKEN_CAP) return;
  state.coffeeTokens += 1;
  pushLog(state, { t: "coffee-gained", total: state.coffeeTokens });
}

export function applyEndRound(state: SkyTeamGameState): SkyTeamGameState {
  if (state.outcome != null) return state;
  const next = clone(state);

  for (const id of MANDATORY_SLOTS) {
    if (!next.slots[id].die) {
      setOutcome(next, "loss-mandatory");
      return next;
    }
  }

  if (next.isFinalRound) {
    runFinalRoundCheck(next);
    return next;
  }

  next.altitude.feet -= next.scenario.altitudeStep;
  const collectedReroll = next.altitude.rerollAt.includes(next.altitude.feet);
  if (collectedReroll) next.rerollTokens += 1;

  for (const id of NON_PERSISTENT_SLOTS) {
    next.slots[id].die = null;
  }

  const altitudeBottomed = next.altitude.feet <= 0;
  const atAirport = next.approach.current === next.approach.airportIndex;

  if (altitudeBottomed && !atAirport) {
    pushLog(next, {
      t: "round-end",
      altitude: next.altitude.feet,
      collectedReroll,
      isFinalNext: false,
    });
    setOutcome(next, "loss-undershoot");
    return next;
  }

  const isFinalNext = altitudeBottomed && atAirport;
  if (isFinalNext) next.isFinalRound = true;

  next.round += 1;
  next.firstThisRound = next.scenario.firstPlacer;
  next.toPlace = next.firstThisRound;
  next.readyForRoll = [false, false];
  next.unplacedDice = [[], []];
  next.phase = "briefing";
  next.finalRoundSpeed = null;

  pushLog(next, {
    t: "round-end",
    altitude: next.altitude.feet,
    collectedReroll,
    isFinalNext,
  });
  pushLog(next, {
    t: "round-start",
    round: next.round,
    first: next.firstThisRound,
    rerollTokens: next.rerollTokens,
  });
  return next;
}

function runFinalRoundCheck(state: SkyTeamGameState): void {
  const airliners = state.approach.airliners.reduce((a, b) => a + b, 0);
  if (airliners > 0) {
    setOutcome(state, "loss-airliners-remain");
    return;
  }
  const gearGreen = LANDING_GEAR_SLOTS.every((id) => state.slots[id].switchOn === true);
  const flapsGreen = FLAPS_ORDER.every((id) => state.slots[id].switchOn === true);
  if (!gearGreen || !flapsGreen) {
    setOutcome(state, "loss-gear-or-flaps");
    return;
  }
  if (state.axis.position !== 0) {
    setOutcome(state, "loss-axis-not-level");
    return;
  }
  setOutcome(state, "win");
}

export interface ApplyActionContext {
  rng: Rng;
}

export function applyAction(
  state: SkyTeamGameState,
  player: PlayerIndex,
  action: SkyTeamAction,
  ctx: ApplyActionContext,
): SkyTeamGameState {
  if (state.outcome != null) {
    throw new InvalidActionError("game already over");
  }
  switch (action.kind) {
    case "ready-to-roll":
      return applyReadyToRoll(state, player);
    case "spend-reroll":
      return applyReroll(state, action.pilotDieIds, action.copilotDieIds, ctx.rng);
    case "place-die":
      return applyPlaceDie(state, player, action.dieId, action.slot, action.coffeeAdjust);
  }
}

export function shouldRollDice(state: SkyTeamGameState): boolean {
  return (
    state.phase === "briefing" &&
    state.readyForRoll[0] &&
    state.readyForRoll[1] &&
    state.unplacedDice[0].length === 0 &&
    state.unplacedDice[1].length === 0
  );
}

export function placementsExhausted(state: SkyTeamGameState): boolean {
  return (
    state.phase === "placement" &&
    state.unplacedDice[0].length === 0 &&
    state.unplacedDice[1].length === 0
  );
}

export function getSlotsForPlayer(state: SkyTeamGameState, player: PlayerIndex): SlotState[] {
  return Object.values(state.slots).filter((s) => {
    const def = getSlotDef(state.scenario, s.id);
    return eligibilityAllowsPlayer(def.eligibility, player);
  });
}
