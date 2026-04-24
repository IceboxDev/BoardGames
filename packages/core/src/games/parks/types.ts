// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** M=mountain, F=forest, S=sun, W=water, A=wildlife. */
export type ResourceType = "M" | "F" | "S" | "W" | "A";

export const RESOURCE_TYPES: ResourceType[] = ["M", "F", "S", "W", "A"];

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  M: "Mountain",
  F: "Forest",
  S: "Sun",
  W: "Water",
  A: "Wildlife",
};

export const RESOURCE_COLORS: Record<ResourceType, string> = {
  M: "#a78bfa",
  F: "#65a30d",
  S: "#f59e0b",
  W: "#38bdf8",
  A: "#f472b6",
};

export const RESOURCE_EMOJI: Record<ResourceType, string> = {
  M: "\u26F0\uFE0F",
  F: "\uD83C\uDF32",
  S: "\u2600\uFE0F",
  W: "\uD83D\uDCA7",
  A: "\uD83E\uDD8B",
};

export type ResourceBag = Record<ResourceType, number>;

export function emptyBag(): ResourceBag {
  return { M: 0, F: 0, S: 0, W: 0, A: 0 };
}

export function bagSize(bag: ResourceBag): number {
  return bag.M + bag.F + bag.S + bag.W + bag.A;
}

// ---------------------------------------------------------------------------
// Trail sites
// ---------------------------------------------------------------------------

/**
 * Site types on the trail (excluding the central Parks site).
 * Trail die face "trail-die" is rolled when landed.
 */
export type SiteType =
  | "parks"
  | "gain-2W"
  | "gain-2S"
  | "gain-1M"
  | "gain-1F"
  | "exchange-A"
  | "canteen-or-photo"
  | "trail-die"
  | "shop";

export const SITE_LABELS: Record<SiteType, string> = {
  parks: "Park Action",
  "gain-2W": "Gain 2 Water",
  "gain-2S": "Gain 2 Sun",
  "gain-1M": "Gain 1 Mountain",
  "gain-1F": "Gain 1 Forest",
  "exchange-A": "Trade for Wildlife",
  "canteen-or-photo": "Canteen or Photo",
  "trail-die": "Roll Trail Die",
  shop: "Trading Post",
};

export const SITE_DESCRIPTIONS: Record<SiteType, string> = {
  parks: "Buy a Park from the display.",
  "gain-2W": "Take 2 Water tokens.",
  "gain-2S": "Take 2 Sun tokens.",
  "gain-1M": "Take 1 Mountain token.",
  "gain-1F": "Take 1 Forest token.",
  "exchange-A": "Spend 1 resource (M/F/S/W) to gain 1 Wildlife.",
  "canteen-or-photo": "Take a canteen, OR pay 1 resource to snap a photo.",
  "trail-die": "Roll the trail die for a random reward.",
  shop: "Trading Post (currently inactive).",
};

/**
 * All non-park site types in the pool. With the trail's 8 non-park slots and
 * 8 unique types, the trail always contains exactly one of each — no duplicates.
 */
export const NON_PARK_SITE_TYPES: SiteType[] = [
  "gain-2W",
  "gain-2S",
  "gain-1M",
  "gain-1F",
  "exchange-A",
  "canteen-or-photo",
  "trail-die",
  "shop",
];

/**
 * Sites the Shutterbug token may be placed on at season setup — one per trail-die face:
 * the four resource sites, the wildlife exchange, and the canteen/photo site.
 */
export const SHUTTERBUG_ELIGIBLE_SITES: SiteType[] = [
  "gain-2W",
  "gain-2S",
  "gain-1M",
  "gain-1F",
  "exchange-A",
  "canteen-or-photo",
];

/** Trail layout: 9 site slots. trail[4] is always "parks". */
export const TRAIL_LENGTH = 9;
export const TRAIL_PARKS_INDEX = 4;
/**
 * Trail's End is split into 3 row positions after the last site. Hikers pick
 * which row to land on. Each row triggers a different action; the first hiker
 * to land on a row this season gets that row's bonus.
 *  R1 (TRAIL_END_R1) — Park Action; first occupier takes the First-Player Token.
 *  R2 (TRAIL_END_R2) — Photo Action; first occupier gains 1 Wildlife.
 *  R3 (TRAIL_END_R3) — Shop Action; first occupier gains 1 Sun.
 */
export const TRAIL_END_R1 = TRAIL_LENGTH; // 9
export const TRAIL_END_R2 = TRAIL_LENGTH + 1; // 10
export const TRAIL_END_R3 = TRAIL_LENGTH + 2; // 11
export const TRAIL_END_ROWS: number[] = [TRAIL_END_R1, TRAIL_END_R2, TRAIL_END_R3];
export const TRAIL_END_LAST = TRAIL_END_R3;
/** Back-compat alias: any legacy "at trail's end" check still resolves on R1. */
export const TRAIL_END_POSITION = TRAIL_END_R1;
export function isAtTrailEnd(position: number): boolean {
  return position >= TRAIL_END_R1 && position <= TRAIL_END_R3;
}
export const START_POSITION = -1; // before the first site

// ---------------------------------------------------------------------------
// Trail die
// ---------------------------------------------------------------------------

export type TrailDieFace = "2W" | "2S" | "1M" | "1F" | "1C" | "1A";

export const TRAIL_DIE_FACES: TrailDieFace[] = ["2W", "2S", "1M", "1F", "1C", "1A"];

export const TRAIL_DIE_LABELS: Record<TrailDieFace, string> = {
  "2W": "2 Water",
  "2S": "2 Sun",
  "1M": "1 Mountain",
  "1F": "1 Forest",
  "1C": "1 Canteen",
  "1A": "1 Wildlife",
};

// ---------------------------------------------------------------------------
// Canteen tokens
// ---------------------------------------------------------------------------

export type CanteenEffect = "2W" | "2S" | "1M" | "1F" | "exchange-A" | "photo" | "park-action";

export const CANTEEN_EFFECTS: CanteenEffect[] = [
  "2W",
  "2S",
  "1M",
  "1F",
  "exchange-A",
  "photo",
  "park-action",
];

export const CANTEEN_LABELS: Record<CanteenEffect, string> = {
  "2W": "2 Water",
  "2S": "2 Sun",
  "1M": "1 Mountain",
  "1F": "1 Forest",
  "exchange-A": "Trade for Wildlife",
  photo: "Snap Photo",
  "park-action": "Park Action",
};

export interface Canteen {
  /** Stable per-player id used for action targeting. */
  id: number;
  effect: CanteenEffect;
  /** Position in the player's 6-slot canteen board (0..5; row pairs (0,1), (2,3), (4,5)). */
  slot: number;
  /** True after the player has used it; refilled at season-end. */
  used: boolean;
}

/**
 * Indices of water-token gaps on the canteen board. Three rows of two slots,
 * one water gap per row:
 *  row 0: slot0 — gap0 — slot1
 *  row 1: slot2 — gap1 — slot3
 *  row 2: slot4 — gap2 — slot5
 * A row is "activated" when its gap holds a water token.
 */
export const CANTEEN_BOARD_SLOTS = 6;
export const CANTEEN_BOARD_WATER_GAPS = 3;
export type WaterGapIndex = 0 | 1 | 2;
export const WATER_GAP_TO_ROW: Record<WaterGapIndex, 0 | 1 | 2> = { 0: 0, 1: 1, 2: 2 };
export function slotRow(slot: number): 0 | 1 | 2 {
  return slot < 2 ? 0 : slot < 4 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Gear cards
// ---------------------------------------------------------------------------

/**
 * 13 gear kinds, 37 cards total. A gear's `triggers` lists which game events
 * make it activatable (must occur on the same turn). `effect` describes what
 * happens when activated. Each gear can be activated at most once per turn.
 */
export type GearKind =
  | "wide-angle-lens"
  | "telephoto-lens"
  | "camp-mug"
  | "journal"
  | "flint-tinder"
  | "compass"
  | "hiking-boots"
  | "sunscreen"
  | "rain-gear"
  | "binoculars"
  | "mystery-cache"
  | "sleeping-bag"
  | "field-guide";

export const GEAR_KINDS: GearKind[] = [
  "wide-angle-lens",
  "telephoto-lens",
  "camp-mug",
  "journal",
  "flint-tinder",
  "compass",
  "hiking-boots",
  "sunscreen",
  "rain-gear",
  "binoculars",
  "mystery-cache",
  "sleeping-bag",
  "field-guide",
];

/**
 * Trigger events a gear card listens for. A gear is activatable on a turn
 * after at least one of its triggers has fired during that turn.
 *
 *  - tile-f / tile-w / tile-m / tile-s — landing on a resource site
 *  - reserve   — when a park is reserved
 *  - trail-die — when the trail die is rolled (site, mission, mystery cache)
 *  - exchange-A — when a resource is exchanged for a wildlife
 *  - take-photo — when a photo is taken (site, canteen, gear)
 */
export type GearTrigger =
  | "tile-f"
  | "tile-w"
  | "tile-m"
  | "tile-s"
  | "reserve"
  | "trail-die"
  | "exchange-A"
  | "take-photo";

export interface GearCard {
  /** Stable per-game id used for action targeting. */
  id: number;
  kind: GearKind;
  /**
   * The ONE specific trigger this card listens for. Per the rulebook each
   * physical copy of a gear is bound to a single trigger from the kind's
   * trigger list (e.g. 2 sunscreens = one bound to take-photo, one to
   * exchange-A; activating each gives +1 sun on its trigger). Sleeping bag
   * copies also encode different effects per trigger (F: +2 sun, M: relight).
   */
  trigger: GearTrigger;
}

export const GEAR_LABELS: Record<GearKind, string> = {
  "wide-angle-lens": "Wide Angle Lens",
  "telephoto-lens": "Telephoto Lens",
  "camp-mug": "Camp Mug",
  journal: "Journal",
  "flint-tinder": "Flint & Tinder",
  compass: "Compass",
  "hiking-boots": "Hiking Boots",
  sunscreen: "Sunscreen",
  "rain-gear": "Rain Gear",
  binoculars: "Binoculars",
  "mystery-cache": "Mystery Cache",
  "sleeping-bag": "Sleeping Bag",
  "field-guide": "Field Guide",
};

/**
 * Per-kind base description. Each physical card is bound to ONE trigger from
 * the kind's list; the per-card trigger icon shown on the card narrows the
 * description down to the specific event that activates it.
 */
export const GEAR_DESCRIPTIONS: Record<GearKind, string> = {
  "wide-angle-lens": "On its trigger, spend 1 resource to take a Photo.",
  "telephoto-lens": "On its trigger, spend 1 resource to take a Photo.",
  "camp-mug": "On its trigger, take a Canteen.",
  journal: "On its trigger, Reserve a Park.",
  "flint-tinder": "On its trigger, relight your Campfire.",
  compass: "On its trigger, Reserve a Park.",
  "hiking-boots": "On its trigger, gain 1 Forest.",
  sunscreen: "On its trigger, gain 1 Sun.",
  "rain-gear": "On its trigger, gain 1 Water.",
  binoculars: "On its trigger, gain 1 Mountain.",
  "mystery-cache": "On its trigger, roll the Trail Die again.",
  "sleeping-bag":
    "On Forest tile: gain 2 Sun. On Mountain tile: relight Campfire. (One effect per card.)",
  "field-guide": "On its trigger, gain 1 Wildlife.",
};

export const GEAR_COSTS: Record<GearKind, number> = {
  "wide-angle-lens": 1,
  "telephoto-lens": 1,
  "camp-mug": 1,
  journal: 1,
  "flint-tinder": 1,
  compass: 1,
  "hiking-boots": 2,
  sunscreen: 2,
  "rain-gear": 2,
  binoculars: 2,
  "mystery-cache": 3,
  "sleeping-bag": 3,
  "field-guide": 3,
};

export const GEAR_COPIES: Record<GearKind, number> = {
  "wide-angle-lens": 4,
  "telephoto-lens": 3,
  "camp-mug": 2,
  journal: 4,
  "flint-tinder": 4,
  compass: 2,
  "hiking-boots": 3,
  sunscreen: 2,
  "rain-gear": 2,
  binoculars: 3,
  "mystery-cache": 2,
  "sleeping-bag": 2,
  "field-guide": 4,
};

/**
 * Trigger sequence per gear kind. The length equals `GEAR_COPIES[kind]` —
 * each entry is the trigger bound to the i-th copy of that kind. So this
 * doubles as both the activation-eligibility map AND the deck construction
 * recipe.
 */
export const GEAR_TRIGGERS: Record<GearKind, GearTrigger[]> = {
  "wide-angle-lens": ["tile-f", "tile-w", "tile-m", "tile-s"],
  "telephoto-lens": ["reserve", "trail-die", "exchange-A"],
  "camp-mug": ["exchange-A", "reserve"],
  journal: ["tile-f", "tile-w", "tile-m", "tile-s"],
  "flint-tinder": ["tile-f", "tile-w", "tile-m", "tile-s"],
  compass: ["trail-die", "exchange-A"],
  "hiking-boots": ["tile-w", "tile-f", "reserve"],
  sunscreen: ["take-photo", "exchange-A"],
  "rain-gear": ["take-photo", "exchange-A"],
  binoculars: ["tile-s", "tile-m", "reserve"],
  "mystery-cache": ["trail-die", "take-photo"],
  "sleeping-bag": ["tile-f", "tile-m"],
  "field-guide": ["tile-f", "tile-w", "tile-m", "tile-s"],
};

export const GEAR_TRIGGER_LABELS: Record<GearTrigger, string> = {
  "tile-f": "On Forest tile",
  "tile-w": "On Water tile",
  "tile-m": "On Mountain tile",
  "tile-s": "On Sun tile",
  reserve: "On Reserve",
  "trail-die": "On Trail Die roll",
  "exchange-A": "On Wildlife Exchange",
  "take-photo": "On Photo",
};

export const GEAR_TRIGGER_ICONS: Record<GearTrigger, string> = {
  "tile-f": "\uD83C\uDF32",
  "tile-w": "\uD83D\uDCA7",
  "tile-m": "\u26F0\uFE0F",
  "tile-s": "\u2600\uFE0F",
  reserve: "\uD83D\uDD16",
  "trail-die": "\uD83C\uDFB2",
  "exchange-A": "\uD83D\uDD04",
  "take-photo": "\uD83D\uDCF8",
};

/** Flat 2-Sun cost to buy the top of the gear deck face-down. */
export const GEAR_BLIND_COST = 2;
/** Always 3 visible gear slots (refilled after each turn). */
export const GEAR_DISPLAY_SIZE = 3;

// ---------------------------------------------------------------------------
// Parks
// ---------------------------------------------------------------------------

export interface Park {
  /** Stable id assigned at deck construction (1..63). */
  id: number;
  name: string;
  /** Point value when scored at game end. */
  pt: number;
  /** Cost: multiset of resources required to claim. A acts as a wild for any other. */
  cost: ResourceBag;
  /** Negcost: resources granted immediately upon claiming. */
  refund: ResourceBag;
  /**
   * Scoring sub-bonus for the special `(mfacssww)/6` cards (Grand Teton, Olympic,
   * Pinnacles, Hawaii Volcanoes). Encoded as the bag of letters that the divisor
   * applies to. Score adds floor(unique_visited_resource_letters / divisor).
   * For our simplified implementation we model it as "+0/1 bonus PT at end".
   */
  endGameDividedBonus?: { letters: ResourceBag; divisor: number };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** Each photo is worth 1 PT at game end. */
export interface Photo {
  id: number;
}

// ---------------------------------------------------------------------------
// Passion cards
// ---------------------------------------------------------------------------

/**
 * 10 passion cards from Parks. Each card has a Goal (mid-game achievement that
 * unlocks a Gear Effect) and an End Game Bonus (scored at game end). We deal 2
 * unique cards per player from the shuffled deck so no two players see overlap.
 *
 * Note: this implementation scores the End Game Bonus only. Mid-game Gear
 * Effects (e.g. discounted park costs after meeting the goal) are not yet
 * wired into the engine — see `scorePassion` for what currently counts.
 *
 * "Forests/Mountains/Water on Parks" map to the park's cost icons of that
 * resource (each unit of cost = one icon on the park art, in our model).
 * "Instant Action" parks are approximated as parks with a `refund` (something
 * granted immediately on visit). "Gear" maps to canteens, our analog of the
 * collectible mid-game effect cards.
 */
export type PassionId =
  | "adventure"
  | "birdwatching"
  | "botany"
  | "collecting"
  | "forestry"
  | "kayaking"
  | "mountaineering"
  | "rock-climbing"
  | "swimming"
  | "wildlife";

export const PASSION_IDS: PassionId[] = [
  "adventure",
  "birdwatching",
  "botany",
  "collecting",
  "forestry",
  "kayaking",
  "mountaineering",
  "rock-climbing",
  "swimming",
  "wildlife",
];

export const PASSION_LABELS: Record<PassionId, string> = {
  adventure: "Adventure",
  birdwatching: "Birdwatching",
  botany: "Botany",
  collecting: "Collecting",
  forestry: "Forestry",
  kayaking: "Kayaking",
  mountaineering: "Mountaineering",
  "rock-climbing": "Rock Climbing",
  swimming: "Swimming",
  wildlife: "Wildlife",
};

export const PASSION_DESCRIPTIONS: Record<PassionId, string> = {
  adventure:
    "Goal: visit 2 Parks with Instant Actions. End: +1 PT per Instant-Action Park visited.",
  birdwatching:
    "Goal: visit 2 Parks with at least 1 Sun in their cost. End: +1 PT per visited Park with a Sun cost.",
  botany:
    "Goal: visit 3 Forests on Parks. End: +1 PT per 2 Forests on your visited Parks (sum of Forest costs ÷ 2, rounded down).",
  collecting: "Goal: own 2 Gear Cards. End: +1 PT per Gear Card you own at game end.",
  forestry:
    "Goal: visit 3 Parks with at least 1 Forest in their cost. End: +1 PT per visited Park with a Forest cost.",
  kayaking:
    "Goal: visit 2 Parks with at least 1 Water in their cost. End: +1 PT per visited Park with a Water cost.",
  mountaineering:
    "Goal: visit 3 Parks with at least 1 Mountain in their cost. End: +1 PT per visited Park with a Mountain cost.",
  "rock-climbing":
    "Goal: visit 3 Mountains on Parks. End: +1 PT per 2 Mountains on your visited Parks (sum of Mountain costs ÷ 2, rounded down).",
  swimming:
    "Goal: visit 3 Water on Parks. End: +1 PT per 2 Water on your visited Parks (sum of Water costs ÷ 2, rounded down).",
  wildlife:
    "Goal: spend a Wildlife to take a Photo. End: +1 PT per 3 Photos you've taken (in addition to the +1 each photo already gives).",
};

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export type Season = "spring" | "summer" | "fall";

export const SEASONS: Season[] = ["spring", "summer", "fall"];

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** Season-start bonus: gives each player one resource. */
export const SEASON_BONUS: Record<Season, ResourceType> = {
  spring: "F",
  summer: "S",
  fall: "M",
};

// ---------------------------------------------------------------------------
// Season missions
// ---------------------------------------------------------------------------

/**
 * At the end of each season, season missions are evaluated and a reward is
 * given to the player with the strict majority on the chosen metric. Ties
 * award no one. All missions compare PER-SEASON values (reset each season).
 */
export type SeasonMission =
  // Spring — reward varies per mission.
  | "spring-most-f"
  | "spring-most-m"
  | "spring-most-w"
  | "spring-most-s"
  // Summer — every mission's reward is "roll the trail die ×2".
  | "summer-most-cost"
  | "summer-most-instant-parks"
  | "summer-most-a"
  | "summer-most-canteens"
  // Fall — every mission's reward is "+3 PT (flat)".
  | "fall-most-s"
  | "fall-most-f"
  | "fall-most-m"
  | "fall-most-w";

export const SEASON_MISSIONS: Record<Season, SeasonMission[]> = {
  spring: ["spring-most-f", "spring-most-m", "spring-most-w", "spring-most-s"],
  summer: [
    "summer-most-cost",
    "summer-most-instant-parks",
    "summer-most-a",
    "summer-most-canteens",
  ],
  fall: ["fall-most-s", "fall-most-f", "fall-most-m", "fall-most-w"],
};

export const SEASON_MISSION_LABELS: Record<SeasonMission, string> = {
  "spring-most-f": "Most Forest gathered",
  "spring-most-m": "Most Mountain gathered",
  "spring-most-w": "Most Water gathered",
  "spring-most-s": "Most Sun gathered",
  "summer-most-cost": "Highest total cost on owned canteens",
  "summer-most-instant-parks": "Most Instant-Reward parks visited (this season)",
  "summer-most-a": "Most Wildlife gathered",
  "summer-most-canteens": "Most canteens taken (this season)",
  "fall-most-s": "Most Sun on visited parks",
  "fall-most-f": "Most Forest on visited parks",
  "fall-most-m": "Most Mountain on visited parks",
  "fall-most-w": "Most Water on visited parks",
};

export const SEASON_MISSION_REWARDS: Record<SeasonMission, string> = {
  "spring-most-f": "Reserve a park (stubbed: +2 Wildlife)",
  "spring-most-m": "Free photo",
  "spring-most-w": "Free water-token (auto-placed in first empty gap)",
  "spring-most-s": "Free canteen (drawn from top of pile)",
  "summer-most-cost": "Roll trail die ×2",
  "summer-most-instant-parks": "Roll trail die ×2",
  "summer-most-a": "Roll trail die ×2",
  "summer-most-canteens": "Roll trail die ×2",
  "fall-most-s": "+3 PT",
  "fall-most-f": "+3 PT",
  "fall-most-m": "+3 PT",
  "fall-most-w": "+3 PT",
};

/** Result of evaluating one season mission at season end. */
export interface SeasonMissionResult {
  mission: SeasonMission;
  /** Player index who won the mission, or -1 if no clear winner (tie or all 0). */
  winner: number;
}

// ---------------------------------------------------------------------------
// Per-season tracking
// ---------------------------------------------------------------------------

/** Season-scoped counters. Reset when advancing seasons. */
export interface SeasonStats {
  /** Resources gained this season (M/F/S/W/A — counts every grant). */
  resourcesGained: ResourceBag;
  /** Canteens acquired this season (display draws + pile draws + park extras). */
  canteensTaken: number;
  /** Parks visited this season. */
  parksVisited: number;
  /** Parks with a non-empty refund visited this season ("instant reward" parks). */
  parksWithInstantRewardVisited: number;
}

export function emptySeasonStats(): SeasonStats {
  return {
    resourcesGained: emptyBag(),
    canteensTaken: 0,
    parksVisited: 0,
    parksWithInstantRewardVisited: 0,
  };
}

// ---------------------------------------------------------------------------
// Passion mode (Goal -> pick gear effect OR end-game bonus)
// ---------------------------------------------------------------------------

/**
 * When a player meets their passion's Goal, they pick ONE: activate the
 * ongoing Gear Effect mid-game OR lock in the End-Game Bonus. Each player
 * can pick exactly one path per game.
 */
export type PassionMode = "gear" | "end-bonus";

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export type PlayerType = "human" | "ai";

export type AIStrategyId = "random";

export const AI_STRATEGY_LABELS: Record<AIStrategyId, string> = {
  random: "Random",
};

export const AI_STRATEGY_DESCRIPTIONS: Record<AIStrategyId, string> = {
  random: "Plays random legal moves.",
};

export interface Hiker {
  /** Either 0 or 1, identifying which of the player's two hikers. */
  id: 0 | 1;
  /**
   * Position on the trail.
   *  -1 = at start (before the trail)
   *   0..TRAIL_LENGTH-1 = on trail[i]
   *   TRAIL_LENGTH (= 9) = at Trail's End
   */
  position: number;
}

export interface PlayerState {
  index: number;
  type: PlayerType;
  aiStrategy?: AIStrategyId;
  hikers: [Hiker, Hiker];
  resources: ResourceBag;
  canteens: Canteen[];
  /** Water tokens placed in the canteen-board gaps (length 3). Reset every season. */
  waterTokens: boolean[];
  photos: Photo[];
  parks: Park[];
  /** Gear cards the player owns. Persists across seasons. */
  gear: GearCard[];
  /**
   * Parks reserved by this player (via Journal/Compass gear). Only this player
   * may buy them. Stays in this list until bought; survives season transitions.
   */
  reservedParks: Park[];
  /**
   * Campfire token. In 2-player setup it begins extinguished. Allows moving
   * onto an occupied trail tile (extinguishes after such a move). Relit at the
   * start of each new season and by Flint & Tinder / Sleeping Bag gear.
   */
  campfireLit: boolean;
  /**
   * Triggers that have fired for this player on the current turn. Cleared at
   * the start of each new turn. Drives gear-activation eligibility.
   */
  triggeredThisTurn: GearTrigger[];
  /** Gear card ids that the player has activated this turn (max once each). */
  usedGearThisTurn: number[];
  /** Chosen passion (null while still in awaiting-passion-choice phase). */
  passion: PassionId | null;
  /** Two passion options dealt at game start; cleared once a choice is made. */
  passionOptions: PassionId[];
  /** Has the player's passion goal been met? (locked true once met). */
  passionGoalMet: boolean;
  /** Picked when goal first met. null until then. */
  passionMode: PassionMode | null;
  /** Track distinct resource types ever obtained (legacy/historical). */
  resourceTypesEverHeld: Set<ResourceType>;
  /** Total canteens used (across the whole game). */
  canteensUsedCount: number;
  /** Per-season counters — reset at advanceSeason. */
  seasonStats: SeasonStats;
  /** End-game point bonuses awarded by season missions (e.g. Fall +3 each). */
  bonusPT: number;
  /** Has finished all hiker movement for the season — passes their turn. */
  doneForSeason: boolean;
}

// ---------------------------------------------------------------------------
// Phase / global state
// ---------------------------------------------------------------------------

export type GamePhase =
  | "awaiting-passion-choice"
  | "awaiting-passion-mode-choice"
  | "playing"
  | "awaiting-landing-choice"
  | "awaiting-canteen-draw"
  | "awaiting-canteen-row-choice"
  | "awaiting-exchange"
  | "awaiting-canteen-or-photo"
  | "awaiting-canteen-exchange"
  | "awaiting-canteen-photo"
  | "awaiting-water-placement"
  | "awaiting-gear-or-end"
  | "awaiting-gear-photo-payment"
  | "awaiting-reserve-source"
  | "awaiting-park-action"
  | "awaiting-shutterbug-photo"
  | "awaiting-resource-discard"
  | "season-end"
  | "game-over";

/** Weather tokens grant a free resource to the first hiker to land on the spot. */
export type WeatherToken = "S" | "W";

export interface GameState {
  phase: GamePhase;
  players: [PlayerState, PlayerState];
  /** Indexes of trail[] are 0..TRAIL_LENGTH-1; trail[TRAIL_PARKS_INDEX] is always "parks". */
  trail: SiteType[];
  /**
   * Weather token at each trail position (length = TRAIL_LENGTH). Position 0 has
   * no token; positions 1..TRAIL_LENGTH-1 alternate sun/water. `null` once claimed.
   */
  weatherTokens: (WeatherToken | null)[];
  /** Active player whose turn it is. */
  activePlayer: number;
  season: Season;
  /** Display of face-up parks that can be purchased. */
  parksDisplay: Park[];
  /** Parks deck — drawn into display when a slot empties. */
  parksDeck: Park[];
  /** Pool of unused canteens — shuffled, drawn from the top when "pile" is chosen. */
  canteenPool: CanteenEffect[];
  /** Three face-up canteens players can take from instead of drawing blind. */
  canteenDisplay: CanteenEffect[];
  /**
   * Gear market: visible[] is the face-up display (max GEAR_DISPLAY_SIZE), oldest
   * card at the rightmost end. Buying any visible card removes it; cards left of
   * it shift right; deck top draws into position 0. After every turn, the
   * rightmost visible card is discarded and the same shift+refill happens.
   * `deck` is the face-down draw pile (top = index 0). `discard` accumulates.
   */
  gearMarket: { visible: GearCard[]; deck: GearCard[]; discard: GearCard[] };
  /** Counter for gear card ids assigned at deck construction. */
  nextGearId: number;
  /** Counter for canteen ids assigned per player. */
  nextCanteenId: number;
  /** Counter for photo ids. */
  nextPhotoId: number;
  /** Pending site-resolution context (used while in awaiting-* phases). */
  pendingSiteContext: PendingSiteContext | null;
  /**
   * Active gear card mid-resolution. Set when a gear that needs a follow-up
   * choice (Wide Angle / Telephoto Lens → photo payment, Journal / Compass →
   * reserve source) is activated. Cleared when the follow-up resolves.
   */
  pendingGearActivation: { gearId: number; kind: GearKind } | null;
  /** When a hiker lands on a tile with a weather token, the player picks the order: claim weather first or trigger site first. */
  pendingLanding: PendingLanding | null;
  /** Weather claim queued when player chose "site first" on a landing-choice and the site flow is still resolving. */
  pendingWeatherClaim: PendingWeatherClaim | null;
  /**
   * Number of water units the active player must still place (per gained Water).
   * Each unit is placed on a useful gap (empty gap on a row with at least one
   * canteen) or kept in the backpack as a +1 W resource. When this is > 0 and
   * useful gaps exist, phase enters "awaiting-water-placement"; if no useful
   * gaps remain, the remaining count auto-dumps into resources.W.
   */
  pendingWaterPlacements: number;
  /**
   * A canteen effect waiting for the player to pick which canteen-board row to
   * place it on. Set when the player draws a canteen (via display or pile);
   * cleared when they pick a row via `place-canteen-row`. Within the row, the
   * leftmost empty slot is used automatically.
   */
  pendingCanteenEffect: CanteenEffect | null;
  /**
   * Shutterbug token: trail position (0..TRAIL_LENGTH-1) where the token
   * currently sits, or null once a player has claimed it. Re-rolled to a new
   * eligible position at the start of each season.
   */
  shutterbugTilePosition: number | null;
  /** Player index holding the Shutterbug token, or null if still on the trail. */
  shutterbugHolder: number | null;
  /**
   * First-Player Token holder. Granted to a random player at game start, then
   * stolen by the first hiker to land on Trail's End row 1 each season. The
   * holder takes their first turn first in each new season and gets +1 PT at
   * game end.
   */
  firstPlayerToken: number;
  /**
   * For each Trail's End row (R1/R2/R3), the player index that first landed
   * there this season — or null if not yet claimed. Reset on season advance.
   */
  trailEndRowFirstOccupier: (number | null)[];
  /**
   * Pre-picked single mission per season for this game (chosen at setup). Only
   * this mission is visible/resolved for that season; the other 3 in the pool
   * are dormant for this game.
   */
  selectedSeasonMissions: Record<Season, SeasonMission>;
  /** Per-season mission results in order; one entry pushed each time a season ends. */
  seasonMissionResults: { season: Season; results: SeasonMissionResult[] }[];
  actionLog: ActionLogEntry[];
  /** Total turn counter (across seasons). */
  turnCount: number;
}

/**
 * Captured when a player triggers a site/canteen choice. After the choice is
 * resolved the phase returns to "playing" and the active player's turn ends.
 */
export interface PendingSiteContext {
  playerIndex: number;
  /** Source of the pending choice: trail site, canteen, or a Trail's End row. */
  source: "site" | "canteen" | "trail-end";
  /** Canteen id if source === "canteen". */
  canteenId?: number;
  /** Which Trail's End row triggered the choice (when source === "trail-end"). */
  trailEndRow?: 0 | 1 | 2;
}

/** Hiker has just landed on a position with both a weather token and a site effect. */
export interface PendingLanding {
  playerIndex: number;
  hikerId: 0 | 1;
  position: number;
  weather: WeatherToken;
  site: SiteType;
}

/** Weather claim deferred until the active site-flow resolves. */
export interface PendingWeatherClaim {
  position: number;
  weather: WeatherToken;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  | { type: "choose-passion"; passionId: PassionId }
  | { type: "passion-mode-choice"; mode: PassionMode }
  | { type: "move"; hikerId: 0 | 1; targetPosition: number }
  | { type: "landing-choice"; first: "weather" | "site" }
  | { type: "draw-canteen"; source: "display"; displayIndex: number }
  | { type: "draw-canteen"; source: "pile" }
  | { type: "place-canteen-row"; row: 0 | 1 | 2 }
  | { type: "place-or-keep-water"; placement: WaterGapIndex | "keep" }
  | { type: "use-canteen"; canteenId: number }
  | { type: "buy-park"; parkId: number; pay: ResourceBag }
  | { type: "buy-park-reserved"; parkId: number; pay: ResourceBag }
  | { type: "exchange-resource"; resource: Exclude<ResourceType, "A"> }
  | { type: "canteen-or-photo-choice"; choice: "canteen" } // take a canteen
  | { type: "canteen-or-photo-choice"; choice: "photo"; payWith: Exclude<ResourceType, "A"> | "A" }
  | { type: "skip-park-action" } // when on Parks site or after using park-action canteen
  | { type: "buy-gear"; source: "display"; index: number }
  | { type: "buy-gear"; source: "deck-blind" }
  | { type: "activate-gear"; gearId: number }
  | { type: "gear-photo-payment"; payWith: ResourceType }
  | { type: "reserve-park"; source: "display"; parkId: number }
  | { type: "reserve-park"; source: "deck-top" }
  | { type: "shutterbug-photo-pay"; payWith: ResourceType }
  | { type: "discard-resource"; resource: ResourceType }
  | { type: "pass" };

// ---------------------------------------------------------------------------
// Player view (no hidden info — Parks has open information)
// ---------------------------------------------------------------------------

export interface ParksPlayerView {
  phase: GamePhase;
  season: Season;
  trail: SiteType[];
  weatherTokens: (WeatherToken | null)[];
  activePlayer: number;
  parksDisplay: Park[];
  parksDeckCount: number;
  canteenPoolCount: number;
  canteenDisplay: CanteenEffect[];
  /** Visible gear cards for purchase. */
  gearMarketVisible: GearCard[];
  /** Cards remaining in the gear deck (for the face-down blind purchase option). */
  gearDeckCount: number;
  pendingSiteContext: PendingSiteContext | null;
  pendingGearActivation: { gearId: number; kind: GearKind } | null;
  pendingLanding: PendingLanding | null;
  pendingWaterPlacements: number;
  /** Effect waiting for the active player to assign to a canteen-board row. */
  pendingCanteenEffect: CanteenEffect | null;
  players: {
    index: number;
    type: PlayerType;
    aiStrategy?: AIStrategyId;
    hikers: [Hiker, Hiker];
    resources: ResourceBag;
    canteens: Canteen[];
    waterTokens: boolean[];
    photoCount: number;
    parks: Park[];
    gear: GearCard[];
    reservedParks: Park[];
    campfireLit: boolean;
    triggeredThisTurn: GearTrigger[];
    usedGearThisTurn: number[];
    passion: PassionId | null;
    /** Two passion options to choose from at game start (only your own — opponent's stays hidden). */
    passionOptions: PassionId[];
    passionGoalMet: boolean;
    passionMode: PassionMode | null;
    canteensUsedCount: number;
    seasonStats: SeasonStats;
    bonusPT: number;
    doneForSeason: boolean;
  }[];
  /** Shutterbug token: trail position, or null if claimed by a player. */
  shutterbugTilePosition: number | null;
  /** Player index holding the Shutterbug token. */
  shutterbugHolder: number | null;
  /** First-Player Token holder. */
  firstPlayerToken: number;
  /** Per-Trail's-End-row first-occupier (this season). */
  trailEndRowFirstOccupier: (number | null)[];
  /** Pre-picked single mission per season for this game. */
  selectedSeasonMissions: Record<Season, SeasonMission>;
  /** Most recent season-mission resolution result (one per season completed). */
  seasonMissionResults: { season: Season; results: SeasonMissionResult[] }[];
  actionLog: ActionLogEntry[];
  turnCount: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  parks: number;
  photos: number;
  passion: number;
  bonusPT: number;
  total: number;
}

export interface ParksResult {
  scores: number[];
  breakdowns: ScoreBreakdown[];
  winner: number;
  isDraw: boolean;
}

// ---------------------------------------------------------------------------
// Action log
// ---------------------------------------------------------------------------

export type ActionLogAction =
  | "choose-passion"
  | "passion-mode"
  | "passion-goal-met"
  | "move"
  | "site-effect"
  | "weather-token"
  | "use-canteen"
  | "place-water"
  | "buy-park"
  | "reserve-park"
  | "exchange"
  | "take-canteen"
  | "snap-photo"
  | "trail-die"
  | "skip-park"
  | "buy-gear"
  | "activate-gear"
  | "campfire-lit"
  | "campfire-extinguished"
  | "shutterbug-placed"
  | "shutterbug-taken"
  | "first-player-token"
  | "trail-end-bonus"
  | "discard-resource"
  | "pass"
  | "season-mission"
  | "season-end"
  | "game-end";

export interface ActionLogEntry {
  turn: number;
  season: Season;
  playerIndex: number;
  action: ActionLogAction;
  hikerId?: 0 | 1;
  fromPosition?: number;
  toPosition?: number;
  site?: SiteType;
  canteenEffect?: CanteenEffect;
  parkName?: string;
  parkId?: number;
  parkPt?: number;
  passionId?: PassionId;
  passionMode?: PassionMode;
  resource?: ResourceType;
  trailDieFace?: TrailDieFace;
  waterGap?: number;
  /** Gear kind when the entry concerns a gear card (buy-gear, activate-gear). */
  gearKind?: GearKind;
  /** Sun cost paid when buying gear (`GEAR_BLIND_COST` for the deck-blind buy). */
  gearCost?: number;
  /** Where a buy-gear or reserve-park took the card from. */
  source?: "display" | "deck";
  /** Set on "season-mission" entries — describes which mission was won. */
  seasonMission?: SeasonMission;
  scores?: number[];
  breakdowns?: ScoreBreakdown[];
}
