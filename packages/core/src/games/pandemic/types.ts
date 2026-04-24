export type DiseaseColor = "blue" | "yellow" | "black" | "red";

export const DISEASE_COLORS: readonly DiseaseColor[] = ["blue", "yellow", "black", "red"] as const;

export const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4] as const;
export const MAX_OUTBREAKS = 8;
export const MAX_CUBES_PER_COLOR = 24;
export const MAX_CUBES_PER_CITY_COLOR = 3;
export const HAND_LIMIT = 7;
export const MAX_RESEARCH_STATIONS = 6;
export const ACTIONS_PER_TURN = 4;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type EventType =
  | "airlift"
  | "one_quiet_night"
  | "resilient_population"
  | "government_grant"
  | "forecast";

export interface CityCard {
  kind: "city";
  cityId: string;
  color: DiseaseColor;
}

export interface EpidemicCard {
  kind: "epidemic";
}

export interface EventCard {
  kind: "event";
  event: EventType;
}

export type PlayerCard = CityCard | EpidemicCard | EventCard;

export interface InfectionCard {
  cityId: string;
  color: DiseaseColor;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type Role =
  | "contingency_planner"
  | "dispatcher"
  | "medic"
  | "operations_expert"
  | "quarantine_specialist"
  | "scientist"
  | "researcher";

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerState {
  id: number;
  role: Role;
  hand: PlayerCard[];
  location: string;
  usedOpsExpertMove: boolean;
}

// ---------------------------------------------------------------------------
// City state
// ---------------------------------------------------------------------------

export type CubeCounts = Record<DiseaseColor, number>;

export function emptyCubeCounts(): CubeCounts {
  return { blue: 0, yellow: 0, black: 0, red: 0 };
}

// ---------------------------------------------------------------------------
// Game phases & results
// ---------------------------------------------------------------------------

export type GamePhase =
  | "setup"
  | "actions"
  | "draw"
  | "epidemic"
  | "infect"
  | "discard"
  | "forecast"
  | "game_over";

export type DiseaseStatus = "active" | "cured" | "eradicated";

export type GameResult = "win" | "loss_outbreaks" | "loss_cubes" | "loss_cards";

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------

export interface LogEntry {
  turn: number;
  player: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Full game state
// ---------------------------------------------------------------------------

export interface GameState {
  cityCubes: Record<string, CubeCounts>;
  researchStations: string[];
  diseaseCubeSupply: Record<DiseaseColor, number>;
  diseaseStatus: Record<DiseaseColor, DiseaseStatus>;

  outbreakCount: number;
  infectionRateIndex: number;

  playerDeck: PlayerCard[];
  playerDiscard: PlayerCard[];
  infectionDeck: InfectionCard[];
  infectionDiscard: InfectionCard[];

  players: PlayerState[];
  currentPlayerIndex: number;
  actionsRemaining: number;
  phase: GamePhase;

  contingencyCard: EventCard | null;
  skipNextInfect: boolean;
  pendingEpidemics: number;
  preForecastPhase: GamePhase | null;
  discardingPlayerIndex: number | null;
  preDiscardPhase: GamePhase | null;

  difficulty: 4 | 5 | 6;
  result: GameResult | null;
  turnNumber: number;
  log: LogEntry[];
  actionLog: ActionLogEntry[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type MovementAction =
  | { kind: "drive_ferry"; to: string }
  | { kind: "direct_flight"; cardIdx: number }
  | { kind: "charter_flight"; to: string }
  | { kind: "shuttle_flight"; to: string };

export type GameAction =
  | { kind: "drive_ferry"; to: string }
  | { kind: "direct_flight"; cardIdx: number }
  | { kind: "charter_flight"; to: string }
  | { kind: "shuttle_flight"; to: string }
  | { kind: "build_station"; relocateFrom?: string }
  | { kind: "treat_disease"; color: DiseaseColor }
  | { kind: "share_give"; targetId: number; cardIdx: number }
  | { kind: "share_take"; fromId: number; cardIdx: number }
  | {
      kind: "discover_cure";
      color: DiseaseColor;
      cardIndices: number[];
    }
  | { kind: "ops_move"; to: string; cardIdx: number }
  | {
      kind: "dispatcher_move_to_pawn";
      targetId: number;
      toPlayerId: number;
    }
  | {
      kind: "dispatcher_move_as";
      targetId: number;
      moveAction: MovementAction;
    }
  | { kind: "contingency_take"; discardIdx: number }
  | { kind: "play_event"; event: EventType; params: EventParams }
  | { kind: "pass" }
  | { kind: "discard_card"; cardIdx: number }
  | { kind: "forecast_reorder"; newOrder: number[] };

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------
//
// `LegalAction` describes "actions that *could* be taken right now".  Some
// actions (drive, direct flight, share knowledge...) are fully concrete —
// their shape matches `GameAction` exactly and they can be dispatched
// directly.  Others are *open*: one or more parameters are not yet chosen
// (charter destination, cards to burn for a cure, event parameters, forecast
// ordering).  Open variants carry the metadata the UI needs to prompt for
// the missing parameters.  Callers must resolve open actions into a
// `GameAction` before dispatching.
//
// Separating these two concerns eliminates sentinel strings like "__any__"
// and gives the UI + AI a type-safe contract for what is and is not already
// a ready-to-dispatch action.

export type LegalAction =
  // --- Concrete (shape identical to the matching GameAction variant) ---
  | { kind: "drive_ferry"; to: string }
  | { kind: "direct_flight"; cardIdx: number }
  | { kind: "shuttle_flight"; to: string }
  | { kind: "build_station"; relocateFrom?: string }
  | { kind: "treat_disease"; color: DiseaseColor }
  | { kind: "share_give"; targetId: number; cardIdx: number }
  | { kind: "share_take"; fromId: number; cardIdx: number }
  | { kind: "dispatcher_move_to_pawn"; targetId: number; toPlayerId: number }
  | { kind: "dispatcher_move_as"; targetId: number; moveAction: MovementAction }
  | { kind: "contingency_take"; discardIdx: number }
  | { kind: "pass" }
  | { kind: "discard_card"; cardIdx: number }
  // --- Open (caller must supply remaining parameters before dispatching) ---
  | { kind: "charter_flight"; destinations: string[] }
  | { kind: "ops_move"; cardIdx: number; destinations: string[] }
  | {
      kind: "discover_cure";
      color: DiseaseColor;
      availableCardIndices: number[];
      needed: number;
    }
  | {
      kind: "play_event";
      event: EventType;
      source: "hand" | "contingency";
    }
  | { kind: "forecast_reorder" };

// ---------------------------------------------------------------------------
// Event params
// ---------------------------------------------------------------------------

export interface AirliftParams {
  targetPlayerId: number;
  destination: string;
}

export interface GovernmentGrantParams {
  cityId: string;
  relocateFrom?: string;
}

export interface ResilientPopulationParams {
  infectionDiscardIdx: number;
}

export interface ForecastParams {
  newOrder: number[];
}

export type EventParams =
  | AirliftParams
  | GovernmentGrantParams
  | ResilientPopulationParams
  | ForecastParams
  | Record<string, never>; // One Quiet Night has no params

// ---------------------------------------------------------------------------
// Meta actions (used by the reducer, not by the game engine)
// ---------------------------------------------------------------------------

export interface SetupConfig {
  numPlayers: 2 | 3 | 4;
  difficulty: 4 | 5 | 6;
  /**
   * Deterministic RNG seed. If omitted, the machine will pick a random
   * seed via `randomSeed()` and record it so the game is reproducible
   * from the replay log.
   */
  seed?: number;
}

export type MetaAction = { kind: "start_game"; config: SetupConfig } | { kind: "reset" };

// ---------------------------------------------------------------------------
// City data (used by city-graph)
// ---------------------------------------------------------------------------

export interface CityData {
  id: string;
  name: string;
  color: DiseaseColor;
  position: [number, number];
  neighbors: string[];
  population: number;
}

// ---------------------------------------------------------------------------
// Action Log
// ---------------------------------------------------------------------------

export type PandemicLogAction =
  | "drive"
  | "direct-flight"
  | "charter-flight"
  | "shuttle-flight"
  | "build-station"
  | "treat"
  | "share"
  | "cure"
  | "infect"
  | "epidemic"
  | "outbreak"
  | "draw-card"
  | "discard";

export interface ActionLogEntry {
  turn: number;
  playerIndex: number;
  action: PandemicLogAction;
  city?: string;
  disease?: DiseaseColor;
  detail?: string;
}
