import { z } from "zod";

export type PlayerIndex = 0 | 1;
export const PILOT: PlayerIndex = 0;
export const COPILOT: PlayerIndex = 1;

export function opponent(p: PlayerIndex): PlayerIndex {
  return (1 - p) as PlayerIndex;
}

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;
export type DieColor = "blue" | "orange";

export interface Die {
  id: number;
  color: DieColor;
  value: DieValue;
  owner: PlayerIndex;
  source: "rolled" | "rerolled";
}

export const SLOT_IDS = [
  "pilot-axis",
  "pilot-engine",
  "pilot-radio",
  "copilot-axis",
  "copilot-engine",
  "copilot-radio-1",
  "copilot-radio-2",
  "concentration-1",
  "concentration-2",
  "concentration-3",
  "landing-gear-1",
  "landing-gear-2",
  "landing-gear-3",
  "flaps-1",
  "flaps-2",
  "flaps-3",
  "brakes-2",
  "brakes-4",
  "brakes-6",
] as const;

export type SlotId = (typeof SLOT_IDS)[number];

export const SlotIdSchema = z.enum(SLOT_IDS);

export type SlotEligibility = "pilot" | "copilot" | "both";

export interface SlotDef {
  id: SlotId;
  eligibility: SlotEligibility;
  /** Allowed die values; undefined = any 1..6. */
  allowedValues?: readonly DieValue[];
  /** True if this slot must be filled by the relevant player by end of round. */
  mandatory?: boolean;
  /** True if this slot is part of an ordered chain (flaps, brakes). */
  ordered?: boolean;
}

export interface SlotState {
  id: SlotId;
  die: Die | null;
  /** For landing-gear and flaps slots only; undefined elsewhere. */
  switchOn?: boolean;
}

export interface SpeedGauge {
  bluePos: number;
  orangePos: number;
}

export interface BrakeTrack {
  pos: number;
}

export interface AxisTrack {
  position: number;
  spinAt: number;
}

export interface ApproachTrack {
  current: number;
  airportIndex: number;
  airliners: number[];
}

export interface AltitudeTrack {
  feet: number;
  rerollAt: readonly number[];
}

export type GamePhase = "idle" | "briefing" | "rolling" | "placement" | "round-end" | "game-over";

export type GameOutcome =
  | "win"
  | "loss-spin"
  | "loss-collision"
  | "loss-overshoot"
  | "loss-overrun"
  | "loss-undershoot"
  | "loss-mandatory"
  | "loss-airliners-remain"
  | "loss-gear-or-flaps"
  | "loss-axis-not-level";

export interface ScenarioConfig {
  id: string;
  name: string;
  totalRounds: number;
  approach: { airportIndex: number; airliners: number[] };
  altitudeStart: number;
  altitudeStep: number;
  rerollAt: readonly number[];
  axisSpinAt: number;
  speedGaugeStart: { bluePos: number; orangePos: number };
  brakeTrackStart: number;
  /** Brake threshold mapping: speed must be < (brakeTrack.pos + brakeThresholdOffset) in final round. */
  brakeThresholdOffset: number;
  /** Always 4/4 in base game. */
  dicePerPlayer: [number, number];
  /** Pilot starts the round in the base game. */
  firstPlacer: PlayerIndex;
  /** Per-slot constraint overrides for this scenario. Defaults from BASE_SLOT_DEFS otherwise. */
  slotOverrides?: Partial<Record<SlotId, Partial<SlotDef>>>;
}

export type SkyTeamLogEntry =
  | { t: "round-start"; round: number; first: PlayerIndex; rerollTokens: number }
  | { t: "ready"; player: PlayerIndex }
  | { t: "roll"; player: PlayerIndex; values: DieValue[] }
  | {
      t: "place";
      player: PlayerIndex;
      dieId: number;
      value: DieValue;
      slot: SlotId;
      coffeeAdjust: number;
    }
  | { t: "axis-update"; pos: number }
  | { t: "engine-resolve"; speed: number; advance: number; finalRound: boolean }
  | { t: "radio"; targetSpace: number; removed: boolean }
  | { t: "gear"; slot: SlotId; bluePos: number }
  | { t: "flaps"; slot: SlotId; orangePos: number }
  | { t: "brakes"; slot: SlotId; brakePos: number }
  | { t: "coffee-gained"; total: number }
  | { t: "coffee-spent"; amount: number }
  | { t: "reroll"; pilotIds: number[]; copilotIds: number[]; remaining: number }
  | { t: "round-end"; altitude: number; collectedReroll: boolean; isFinalNext: boolean }
  | { t: "outcome"; outcome: GameOutcome };

export interface SkyTeamGameState {
  scenario: ScenarioConfig;
  round: number;
  phase: GamePhase;
  toPlace: PlayerIndex;
  firstThisRound: PlayerIndex;
  readyForRoll: [boolean, boolean];
  unplacedDice: [Die[], Die[]];
  slots: Record<SlotId, SlotState>;
  speedGauge: SpeedGauge;
  brakeTrack: BrakeTrack;
  axis: AxisTrack;
  approach: ApproachTrack;
  altitude: AltitudeTrack;
  coffeeTokens: number;
  rerollTokens: number;
  isFinalRound: boolean;
  finalRoundSpeed: number | null;
  log: SkyTeamLogEntry[];
  outcome: GameOutcome | null;
  seed: number;
  nextDieId: number;
}

export interface SkyTeamPlayerView {
  scenario: ScenarioConfig;
  round: number;
  phase: GamePhase;
  toPlace: PlayerIndex;
  firstThisRound: PlayerIndex;
  readyForRoll: [boolean, boolean];
  myDice: Die[];
  opponentDiceCount: number;
  slots: Record<SlotId, SlotState>;
  speedGauge: SpeedGauge;
  brakeTrack: BrakeTrack;
  axis: AxisTrack;
  approach: ApproachTrack;
  altitude: AltitudeTrack;
  coffeeTokens: number;
  rerollTokens: number;
  isFinalRound: boolean;
  log: SkyTeamLogEntry[];
  outcome: GameOutcome | null;
  viewerIndex: PlayerIndex;
  isYourTurn: boolean;
}

export interface SkyTeamResult {
  outcome: GameOutcome;
  scenarioId: string;
  finalAxis: number;
  finalApproach: number;
  rounds: number;
  brakesDeployed: number;
  gearGreen: boolean;
  flapsGreen: boolean;
  airlinersRemaining: number;
}

export const SkyTeamActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("place-die"),
    dieId: z.number().int().nonnegative(),
    slot: SlotIdSchema,
    coffeeAdjust: z.number().int().min(-5).max(5).default(0),
  }),
  z.object({
    kind: z.literal("spend-reroll"),
    pilotDieIds: z.array(z.number().int().nonnegative()).default([]),
    copilotDieIds: z.array(z.number().int().nonnegative()).default([]),
  }),
  z.object({ kind: z.literal("ready-to-roll") }),
]);

export type SkyTeamAction = z.infer<typeof SkyTeamActionSchema>;

export type SkyTeamPlaceDie = Extract<SkyTeamAction, { kind: "place-die" }>;
export type SkyTeamSpendReroll = Extract<SkyTeamAction, { kind: "spend-reroll" }>;
export type SkyTeamReadyToRoll = Extract<SkyTeamAction, { kind: "ready-to-roll" }>;

export const StartConfigSchema = z.object({
  scenarioId: z.string(),
  humanPlayers: z.array(z.number().int().min(0).max(1)).optional(),
  aiStrategy: z.string().optional(),
  seed: z.number().int().optional(),
});
export type StartConfig = z.infer<typeof StartConfigSchema>;
