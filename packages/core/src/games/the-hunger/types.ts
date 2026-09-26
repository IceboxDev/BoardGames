// ---------------------------------------------------------------------------
// The Hunger — content and state types.
//
// Content (cards, missions, bonus tokens, boards) is typed data in
// `content/`. Everything the engine mutates is `GameState`, a plain JSON value
// so a snapshot can be cloned, persisted and replayed.
// ---------------------------------------------------------------------------

export type Mode = "elder" | "rookie";

export type HumanCategory = "villager" | "religious" | "military" | "noble";
export const HUMAN_CATEGORIES: readonly HumanCategory[] = [
  "villager",
  "religious",
  "military",
  "noble",
];

/** The type icon in a card's lower-right corner. */
export type CardType = "human" | "starting" | "power" | "familiar" | "item";

export type Keyword =
  | "fast"
  | "slow"
  | "spicy"
  | "confuse"
  | "holy-water"
  | "gregarious"
  | "ready"
  | "permanent"
  | "unique"
  | "inspiring";

/** Step-1 effects: resolved by the player, in their chosen order, before Speed. */
export type ManipulationEffect =
  /**
   * Draw n cards, or `withHuman` if a Human is in your playing area.
   * `mandatory`: the card says "Draw" (Dee, the Starting Vampire Strength),
   * not "You may draw" — step 1 cannot end with it unresolved.
   */
  | { kind: "draw"; n: number; withHuman?: number; mandatory?: boolean }
  /** Discard 1 card to draw 1 card, up to `times` times (default once). */
  | { kind: "discard-draw"; times?: number };

/** Effects that apply while the card sits in the playing area. */
export type PassiveEffect =
  | { kind: "hunt-vp-per-human"; n: number }
  | { kind: "extra-hunt" }
  | { kind: "bat" }
  | { kind: "mist" }
  | { kind: "end-turn-vp"; n: number; when: "always" | "hunted" | "not-hunted" }
  /** Kutya / Caine: +n Speed to hunt with while on a Well. */
  | { kind: "well-speed"; n: number }
  /** Chop / Malac: n VP at the end of a turn in which you hunted a Human. */
  | { kind: "human-hunt-vp"; n: number }
  /** Chop / Malac: one more Hunt if you chose not to move. */
  | { kind: "stay-extra-hunt" }
  /** Sova / Bagoly: n VP whenever you gain a Mission. */
  | { kind: "vp-per-mission"; n: number }
  /** Wee Vlad / Patcani: +n Speed per Human in the playing area worth min..max VP. */
  | { kind: "speed-per-human-worth"; min: number; max: number; n: number }
  /** Lockjaw / Nanoosh: +speed Speed and +vp VP with atLeast Humans in the playing area. */
  | { kind: "humans-bonus"; atLeast: number; speed: number; vp: number }
  /** Nanny / Capra: vp VP per Vampire you push; each discards one of its Permanents. */
  | { kind: "push-tax"; vp: number };

/** A Permanent card's optional ability, used on your turn by discarding or digesting it. */
export type ActivatedEffect =
  /** Kutya / Caine: discard for one more Hunt, in column 1. */
  | { kind: "discard-for-col1-hunt" }
  /** Wiggles / Kaa: Digest it and 1 other card from your playing area, for vp VP. */
  | { kind: "digest-with-card"; vp: number }
  /** Ursa / Teddy: before you play, discard your hand, draw `draw`, gain vp VP, discard it. */
  | { kind: "redraw-hand"; draw: number; vp: number }
  /** Hypnosis: move 1 Hunt Track card one space up, down, left or right. */
  | { kind: "hypnosis" };

export type EndGameEffect =
  | { kind: "if-has"; other: string; vp: number }
  /** Isabel: vp VP if you have a card of this family (a Rose). */
  | { kind: "if-family"; family: string; vp: number }
  | { kind: "per-category"; category: HumanCategory; vp: number }
  | { kind: "per-family"; family: string; vp: number };

export type CardSpeed = number | { base: number; ifHuman: number };

export interface CardDef {
  /** Stable content id, e.g. `"bernard"`. */
  id: string;
  name: string;
  type: CardType;
  category?: HumanCategory;
  /** Sub-kind a card can count by, e.g. `"wolf"` (Echo), `"rose"` (Unique). */
  family?: string;
  speed: CardSpeed;
  vp: number;
  keywords: readonly Keyword[];
  manipulation?: ManipulationEffect;
  /** One effect, or several (Chop). Read through `passivesOf`. */
  passive?: PassiveEffect | readonly PassiveEffect[];
  activated?: ActivatedEffect;
  /** Bridget, Belle…: extra VP when hunted in this region. */
  huntBonus?: { region: "plains" | "forest"; vp: number };
  /** Zephania, Angus, Peter: when hunted, you may Digest 1 card (playing area or discard). */
  onHunt?: { kind: "digest-any" };
  endGame?: EndGameEffect;
  /** Rookie-mode "A" marker, on every copy. */
  rookie?: boolean;
  /** Rookie-mode "A" marker on only this many of the copies. */
  rookieCopies?: number;
  /** Short rules text shown on the card face. */
  text?: string;
  copies: number;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** The Human keywords Missions count (Confuse's icon is the tankard). */
export type HumanKeyword = Extract<Keyword, "confuse" | "spicy" | "holy-water">;

/** What a majority Mission compares: a Human type, all Humans, or Familiars. */
export type MajorityOf = HumanCategory | "humans" | "familiars";

/**
 * Standard (beige) Mission conditions, scored at the end of the game. "Hunted"
 * means every non-Starting card you own, Digested ones included; Human
 * tokens count as Humans of their type wherever a type is counted, but have
 * no printed VP and no keywords.
 */
export type MissionCondition =
  | { kind: "per-category"; category: HumanCategory; vpEach: number }
  | { kind: "majority"; of: MajorityOf }
  | { kind: "fewest-humans" }
  | { kind: "has-rose" }
  | { kind: "host"; perBeaten: number }
  | { kind: "per-bonus"; vpEach: number }
  | { kind: "per-human-worth"; min: number; max?: number; vpEach: number }
  | { kind: "none-worth"; atLeast: number }
  | { kind: "same-type"; atLeast: number }
  | { kind: "per-keyword"; keywords: readonly HumanKeyword[]; vpEach: number }
  | { kind: "per-distinct"; type: "power" | "familiar"; vpEach: number }
  | { kind: "least-type"; vpEach: number }
  | { kind: "most-type"; vpEach: number }
  | { kind: "score-rank"; rank: "highest" | "lowest" }
  | { kind: "count-humans"; atLeast: number }
  | { kind: "missionary" }
  | { kind: "sets"; vpEach: number }
  | { kind: "per-digested"; vpEach: number }
  | { kind: "first-home" };

/** Instant (gold) Missions: discarded on your turn for a one-off effect. */
export type InstantEffect =
  /** Skip your turn: Digest every Human from your hand, discard the rest. */
  | { kind: "digest-hand" }
  /** After hunting in column 3: one more Hunt Track pile, free. */
  | { kind: "free-hunt-after-col3" }
  /** After hunting a Human in `region`: one more pile in the same column, free. */
  | { kind: "free-hunt-same-column"; region: "mountains" | "plains" | "forest" }
  /** Take any Bonus token on the board. */
  | { kind: "take-bonus" }
  /** Hunt one Familiar from the Hunt Track, free, straight into your playing area. */
  | { kind: "free-familiar" }
  /** 1 VP per Vampire closer to the Castle than you. */
  | { kind: "vp-per-closer" };

export interface MissionDef {
  id: string;
  name: string;
  vp: number;
  /** Removed in 2–4 player games. */
  fivePlus?: boolean;
  /** Rookie public Missions are drawn from the white titles. */
  whiteTitle?: boolean;
  standard?: MissionCondition;
  instant?: InstantEffect;
  text: string;
}

// ---------------------------------------------------------------------------
// Bonus tokens
// ---------------------------------------------------------------------------

export type BonusKind =
  | { kind: "human"; category: HumanCategory }
  | { kind: "human-choice" }
  | { kind: "speed"; n: number }
  | { kind: "extra-hunt" }
  | { kind: "discard-draw" }
  | { kind: "draw-to-play" }
  | { kind: "mission" }
  | { kind: "parasol" }
  | { kind: "velvet" };

export interface BonusDef {
  id: string;
  name: string;
  bonus: BonusKind;
  copies: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type Region = "castle" | "cemetery" | "mountains" | "plains" | "forest";
export type PathKind = "road" | "rail" | "boat";

export type SpaceEffect =
  | "none"
  | "castle"
  | "cemetery"
  | "chest"
  | "chest-open"
  | "crypt"
  | "labyrinth"
  | "market"
  | "church"
  | "mansion"
  | "barracks"
  | "ship"
  | "tavern"
  | "well";

export type CryptRegion = "mountains" | "plains" | "forest";

export interface SpaceDef {
  id: string;
  region: Region;
  path: PathKind | null;
  effect: SpaceEffect;
  /** Rookie side: VP lost at sunrise when you end here (Mountains). */
  mountainPenalty?: number;
  /** Position in the board's viewBox. */
  x: number;
  y: number;
}

/** Which board a game is played on: a printed side, or the fixed test layout. */
export type BoardId = "A" | "B" | "test";

/**
 * One board side, as saved by the dev board editor (`/dev/hunger-board`):
 * space coordinates are pixels on the board image, `width` × `height`.
 */
export interface BoardDef {
  side: BoardId;
  width: number;
  height: number;
  /** A stand-in layout, not mapped from the real board (no image drawn under it). */
  provisional?: boolean;
  spaces: readonly SpaceDef[];
  edges: readonly (readonly [string, string])[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A physical card: `${defId}#${n}`. */
export type CardId = string;

export type AIStrategyId = "random" | "heuristic-v1";

/** AI seats, lightweight so the room config can list them without the engine. */
export const ALL_STRATEGIES: readonly { id: AIStrategyId; label: string; description: string }[] = [
  {
    id: "heuristic-v1",
    label: "Nosferatu",
    description: "Greedy hunter that budgets its Speed for the run home before sunrise.",
  },
  { id: "random", label: "Fledgling", description: "Picks any legal action at random." },
];

export interface PlayCard {
  id: CardId;
  /** Step-1 effect already activated (it may no longer be discarded). */
  resolved: boolean;
  /** Uses of a repeatable step-1 effect so far (the double Vampiric Will). */
  used?: number;
  /** A Spicy Human carried over because its Well was not reached. */
  carried?: boolean;
}

export interface BonusHolding {
  id: string;
  used: boolean;
  /** The Human type chosen for a choice token (fixed at game end). */
  chosen?: HumanCategory;
}

export interface PlayerState {
  index: number;
  type: "human" | "ai";
  aiStrategy?: AIStrategyId;
  vampire: number;
  deck: CardId[];
  hand: CardId[];
  playArea: PlayCard[];
  discard: CardId[];
  digested: CardId[];
  missions: string[];
  /** Instant Missions revealed and scored — no longer exchangeable. */
  usedMissions: string[];
  bonus: BonusHolding[];
  pos: string;
  /** Larger = placed later = higher in a stack. */
  placedAt: number;
  resting: boolean;
  vp: number;
  castleTile: number | null;
  castleOrder: number | null;
  /** Cards gained by hunting, all game (Strategist). */
  hunted: number;
  parasolTurnUsed: boolean;
}

export type TurnStep =
  | "manipulate"
  | "move"
  | "push"
  | "act"
  | "digest"
  | "missions"
  | "inspire"
  | "ready"
  | "nanny";

export interface TurnState {
  player: number;
  step: TurnStep;
  /** 1 = discard/draw effects; 2 = Speed computed (move, hunt). */
  stage: 1 | 2;
  /** Speed from +N Speed tokens spent during step 1. */
  bonusSpeed: number;
  speed: number;
  speedLeft: number;
  moved: boolean;
  spaceUsed: boolean;
  /** Hunts taken this turn. */
  hunts: number;
  /** Hunt allowances beyond the first (any column). */
  extraHunts: number;
  /** Well hunts (column 1 only), one per source. */
  col1Hunts: number;
  /** Of `hunts`, how many were paid from `col1Hunts`. */
  col1Used: number;
  /** Humans hunted this turn (The Hunger). */
  huntedHumans: { category: HumanCategory; region: Region }[];
  /** Hunt Track hunts this turn, for the free-hunt Instant Missions. */
  trackHunts: { col: number; region: Region; human: boolean }[];
  /** Any step-1 effect or token used — Digestion and Ursa must come first. */
  touched: boolean;
  /** Vampires pushed by a Nanny owner who must now choose a Permanent to discard. */
  nannyQueue: number[];
  /** Vampires on the landing space still to be pushed (top first). */
  pushQueue: number[];
  /** Ready cards awaiting top-of-deck / discard. */
  readyQueue: CardId[];
  /** Mission tiles in hand during an exchange. */
  missionPick: {
    /** The Crypt space the tiles came from; `null` at setup. */
    source: string | null;
    offered: string[];
    keep: number;
  } | null;
  /** Inspiring Humans / Mission tokens waiting for a stack choice. */
  pendingInspire: number;
  /** "When you hunt me, you may Digest 1 card" choices still to make. */
  pendingDigest: number;
  digestCategory: HumanCategory | null;
  confused: boolean;
  extraTurn: boolean;
}

export type LogEntry =
  | { t: "turn"; turn: number; order: number[] }
  | { t: "resolve"; p: number; card: string; drew: number; discarded?: string }
  | { t: "bonus"; p: number; bonus: string }
  | { t: "confuse"; p: number; to: string }
  | { t: "move"; p: number; from: string; to: string; spent: number }
  | { t: "push"; p: number; victim: number; to: string }
  | { t: "castle"; p: number; tile: number }
  | { t: "chest"; p: number; bonus: string; vp: number }
  | { t: "digest"; p: number; card: string }
  | { t: "missions"; p: number; source: string; kept: number }
  | {
      t: "hunt";
      p: number;
      source: "track" | "tavern" | "rose" | "gregarious" | "familiar";
      cards: string[];
      vp: number;
      col?: number;
    }
  | { t: "instant"; p: number; mission: string; vp: number }
  | { t: "familiar"; p: number; card: string; vp: number; target?: string }
  | { t: "nanny"; p: number; card: string }
  | { t: "hypnosis"; p: number; card: string; row: number; col: number }
  | { t: "end-turn"; p: number; vp: number }
  | { t: "sunrise"; p: number; fate: Fate; delta: number };

export type Fate = "castle" | "cemetery" | "mountains" | "ashes";

export interface GameOptions {
  mode: Mode;
  /** Rookie plays side A, Elder side B; tests use the fixed test layout. */
  board: BoardId;
  /** Elder mode house rule: beginners are safe in the Mountains. */
  beginnerSafeMountains: boolean;
}

export interface GameState {
  seed: number;
  /** Setup: each seat's two Mission tiles, one to keep. */
  setupOffers: string[][];
  rng: number;
  options: GameOptions;
  /** The Moon: 1..15, then 16 during Parasol turns. */
  turn: number;
  phase: "setup" | "play" | "game-over";
  players: PlayerState[];
  /** Seats still to play this turn, in order. */
  order: number[];
  current: TurnState | null;
  /** `track[row][col]`, col 0 = column 1 (cheapest), col 2 = column 3. */
  track: CardId[][][];
  huntDeck: CardId[];
  tavern: CardId[];
  roses: CardId[];
  chests: Record<string, string | null>;
  /** Each Crypt space's own Mission pile, face down. */
  crypts: Record<string, string[]>;
  publicMissions: string[];
  castleTiles: number[];
  castleArrivals: number;
  placeCounter: number;
  log: LogEntry[];
  result: HungerResult | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  | { type: "resolve"; card: CardId; discard?: CardId }
  | { type: "use-bonus"; token: string; discard?: CardId }
  | { type: "end-manipulation" }
  | { type: "move"; to: string; spent: number }
  | { type: "mist"; to: string }
  | { type: "stay" }
  | { type: "push"; to: string | null }
  | { type: "space" }
  | { type: "digest"; card: CardId | null }
  | { type: "keep-missions"; keep: string[] }
  /** Inspiring / Gain 1 Mission: take from this Crypt's pile. */
  | { type: "inspire"; crypt: string }
  | { type: "hunt"; row: number; col: number }
  | { type: "hunt-tavern" }
  | { type: "hunt-rose"; card: CardId }
  | { type: "ready"; card: CardId; to: "deck" | "discard" }
  | {
      type: "instant";
      mission: string;
      /** Free hunt: the pile. */
      row?: number;
      col?: number;
      /** Beast Master: the Familiar. */
      card?: CardId;
      /** Treasure Chest: the Chest space. */
      space?: string;
    }
  | { type: "familiar"; card: CardId; target?: CardId }
  /** Hypnosis: move `pick` from its Hunt Track pile to the pile at row/col. */
  | { type: "hypnosis"; card: CardId; pick: CardId; row: number; col: number }
  | { type: "discard-permanent"; card: CardId }
  | { type: "end-turn" }
  /** Take back the last undoable action (offered by the machine, never the engine). */
  | { type: "undo" };

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface SeatBreakdown {
  duringPlay: number;
  cardBonuses: number;
  publicMissions: number;
  personalMissions: number;
  sunrise: number;
  fate: Fate;
  total: number;
  /** Every Mission that counted for the seat, Public ones included; spent Instants are `used`. */
  missions: { id: string; vp: number; public: boolean; used?: boolean }[];
  /** Every End-of-the-Game card the seat owns and what it scored. */
  cards: { card: string; vp: number }[];
}

export interface HungerResult {
  scores: number[];
  winner: number | null;
  winners: number[];
  placements: number[];
  breakdown: SeatBreakdown[];
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

export interface PlayerSummary {
  index: number;
  type: "human" | "ai";
  aiStrategy?: AIStrategyId;
  vampire: number;
  pos: string;
  placedAt: number;
  resting: boolean;
  vp: number;
  castleTile: number | null;
  deckCount: number;
  handCount: number;
  discard: CardId[];
  digested: CardId[];
  playArea: PlayCard[];
  missionCount: number;
  usedMissions: string[];
  bonus: BonusHolding[];
  hunted: number;
  /** Cards owned by category — Hunt-track cards only, plus Human tokens. */
  humans: Record<HumanCategory, number>;
}

export interface HungerPlayerView {
  me: number;
  options: GameOptions;
  turn: number;
  phase: GameState["phase"];
  players: PlayerSummary[];
  order: number[];
  current: TurnState | null;
  hand: CardId[];
  deckCount: number;
  missions: string[];
  track: CardId[][][];
  huntDeckCount: number;
  tavernCount: number;
  roses: CardId[];
  /** Face-up bonus id, `"hidden"` for a face-down one, `null` for an empty chest. */
  chests: Record<string, string | null>;
  /** Tiles left in each Crypt space's pile. */
  crypts: Record<string, number>;
  publicMissions: string[];
  castleTiles: number[];
  log: LogEntry[];
  result: HungerResult | null;
}
