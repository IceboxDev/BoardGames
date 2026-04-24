import { buildGearDeck } from "./gear-data";
import { ALL_PARKS, getParkExtras } from "./parks-data";
import {
  bothHikersAtEnd,
  canteenIsActivated,
  effectivePark,
  getUsefulWaterGaps,
  legalMoveTargets,
} from "./rules";
import type {
  Action,
  AIStrategyId,
  Canteen,
  CanteenEffect,
  GameState,
  GearCard,
  GearTrigger,
  Park,
  PassionId,
  PassionMode,
  PendingLanding,
  PendingWeatherClaim,
  PlayerState,
  ResourceBag,
  ResourceType,
  Season,
  SeasonMission,
  SeasonMissionResult,
  SiteType,
  TrailDieFace,
  WaterGapIndex,
  WeatherToken,
} from "./types";
import {
  bagSize,
  CANTEEN_BOARD_SLOTS,
  CANTEEN_BOARD_WATER_GAPS,
  CANTEEN_EFFECTS,
  emptyBag,
  emptySeasonStats,
  GEAR_BLIND_COST,
  GEAR_COSTS,
  GEAR_DISPLAY_SIZE,
  isAtTrailEnd,
  NON_PARK_SITE_TYPES,
  PASSION_IDS,
  SEASON_BONUS,
  SEASON_MISSIONS,
  SEASONS,
  SHUTTERBUG_ELIGIBLE_SITES,
  START_POSITION,
  TRAIL_DIE_FACES,
  TRAIL_END_R1,
  TRAIL_END_R2,
  TRAIL_LENGTH,
  TRAIL_PARKS_INDEX,
} from "./types";

// ---------------------------------------------------------------------------
// PARKS_DISPLAY_SIZE — how many face-up parks at a time
// ---------------------------------------------------------------------------

const PARKS_DISPLAY_SIZE = 3;

/** Maximum resources a player may end their turn with — excess is discarded. */
const RESOURCE_CAP = 12;

/** Number of face-up canteens always on offer (the "shop"). */
const CANTEEN_DISPLAY_SIZE = 3;

/** Per-effect counts in the canteen pool: 5 of each resource canteen, 3 of each special. */
const CANTEEN_POOL_COUNTS: Record<CanteenEffect, number> = {
  "2W": 5,
  "2S": 5,
  "1M": 5,
  "1F": 5,
  "exchange-A": 3,
  photo: 3,
  "park-action": 3,
};

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Build trail
// ---------------------------------------------------------------------------

function buildTrail(): SiteType[] {
  // 8 non-Park slots + 1 Parks slot at index 4. NON_PARK_SITE_TYPES has exactly
  // 8 entries, so each appears once with no duplicates.
  const sites: SiteType[] = [...NON_PARK_SITE_TYPES];
  shuffleInPlace(sites);
  const trail: SiteType[] = [];
  let pool = 0;
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    if (i === TRAIL_PARKS_INDEX) {
      trail.push("parks");
    } else {
      trail.push(sites[pool++]);
    }
  }
  return trail;
}

/**
 * Weather tokens: positions 1..TRAIL_LENGTH-1 alternate Sun/Water; position 0
 * (Start) and beyond have none. First hiker to land claims it.
 */
function buildWeatherTokens(): (WeatherToken | null)[] {
  const tokens: (WeatherToken | null)[] = [];
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    if (i === 0) {
      tokens.push(null);
    } else {
      tokens.push(i % 2 === 1 ? "S" : "W");
    }
  }
  return tokens;
}

/**
 * Pick a random trail position whose site is one of the six trail-die-faced
 * sites. Returns null if (somehow) no eligible site exists.
 */
function pickShutterbugPosition(trail: SiteType[]): number | null {
  const candidates: number[] = [];
  for (let i = 0; i < trail.length; i++) {
    if (SHUTTERBUG_ELIGIBLE_SITES.includes(trail[i])) candidates.push(i);
  }
  if (candidates.length === 0) return null;
  return randomChoice(candidates);
}

function buildCanteenPool(): CanteenEffect[] {
  const pool: CanteenEffect[] = [];
  for (const eff of CANTEEN_EFFECTS) {
    const count = CANTEEN_POOL_COUNTS[eff] ?? 0;
    for (let i = 0; i < count; i++) pool.push(eff);
  }
  shuffleInPlace(pool);
  return pool;
}

function refillCanteenDisplay(state: GameState): void {
  while (state.canteenDisplay.length < CANTEEN_DISPLAY_SIZE && state.canteenPool.length > 0) {
    const top = state.canteenPool.shift();
    if (top) state.canteenDisplay.push(top);
  }
}

function buildParksDeck(): Park[] {
  const deck = ALL_PARKS.map((p) => ({
    ...p,
    cost: { ...p.cost },
    refund: { ...p.refund },
  }));
  shuffleInPlace(deck);
  return deck;
}

function buildInitialPlayer(
  index: number,
  type: PlayerState["type"],
  aiStrategy: AIStrategyId | undefined,
  passionOptions: PassionId[],
  startingCanteen: CanteenEffect,
  canteenIdStart: number,
): PlayerState {
  return {
    index,
    type,
    aiStrategy,
    hikers: [
      { id: 0, position: START_POSITION },
      { id: 1, position: START_POSITION },
    ],
    resources: emptyBag(),
    canteens: [{ id: canteenIdStart, effect: startingCanteen, slot: 0, used: false }],
    waterTokens: new Array(CANTEEN_BOARD_WATER_GAPS).fill(false),
    photos: [],
    parks: [],
    gear: [],
    reservedParks: [],
    // 2-player setup: campfire begins extinguished. Relit at each new season.
    campfireLit: false,
    triggeredThisTurn: [],
    usedGearThisTurn: [],
    passion: null,
    passionOptions,
    passionGoalMet: false,
    passionMode: null,
    resourceTypesEverHeld: new Set<ResourceType>(),
    canteensUsedCount: 0,
    seasonStats: emptySeasonStats(),
    bonusPT: 0,
    doneForSeason: false,
  };
}

function firstEmptyCanteenSlot(player: PlayerState): number | null {
  const used = new Set(player.canteens.map((c) => c.slot));
  for (let s = 0; s < CANTEEN_BOARD_SLOTS; s++) {
    if (!used.has(s)) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gear helpers
// ---------------------------------------------------------------------------

function fireTrigger(state: GameState, trigger: GearTrigger): void {
  const player = state.players[state.activePlayer];
  if (!player.triggeredThisTurn.includes(trigger)) {
    player.triggeredThisTurn.push(trigger);
  }
}

function gearCanBeActivated(player: PlayerState, gear: GearCard): boolean {
  if (player.usedGearThisTurn.includes(gear.id)) return false;
  // Wide-angle / Telephoto consume a resource for a photo — gate by availability.
  if (gear.kind === "wide-angle-lens" || gear.kind === "telephoto-lens") {
    if (!anyResource(player)) return false;
  }
  // Each card is bound to ONE specific trigger.
  return player.triggeredThisTurn.includes(gear.trigger);
}

function canActivateAnyGear(state: GameState, player: PlayerState): boolean {
  return player.gear.some((g) => {
    if (!gearCanBeActivated(player, g)) return false;
    if (g.kind === "journal" || g.kind === "compass") {
      if (state.parksDisplay.length === 0 && state.parksDeck.length === 0) return false;
    }
    return true;
  });
}

function refillGearMarket(state: GameState): void {
  while (state.gearMarket.visible.length < GEAR_DISPLAY_SIZE) {
    if (state.gearMarket.deck.length === 0) {
      if (state.gearMarket.discard.length === 0) return;
      state.gearMarket.deck = [...state.gearMarket.discard];
      shuffleInPlace(state.gearMarket.deck);
      state.gearMarket.discard = [];
    }
    const top = state.gearMarket.deck.shift();
    if (!top) return;
    state.gearMarket.visible.unshift(top);
  }
}

function endOfTurnGearDiscard(state: GameState): void {
  // The rightmost visible (oldest) gear is discarded each turn; remaining
  // cards "shift right" as a fresh card slides in at the leftmost slot.
  const oldest = state.gearMarket.visible.pop();
  if (oldest) state.gearMarket.discard.push(oldest);
  refillGearMarket(state);
}

function maybeEndTurn(state: GameState): void {
  // Resolve any pending water placements first — gear activation should happen
  // only after the player has decided where to put freshly granted water.
  if (state.pendingWaterPlacements > 0) {
    if (maybeEnterWaterPlacement(state)) return;
  }
  const player = state.players[state.activePlayer];
  if (canActivateAnyGear(state, player)) {
    state.phase = "awaiting-gear-or-end";
    return;
  }
  endActionTurn(state);
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialState(strategies: (AIStrategyId | null)[]): GameState {
  if (strategies.length !== 2) throw new Error("Parks requires exactly 2 players");

  const trail = buildTrail();
  const canteenPool = buildCanteenPool();
  const parksDeck = buildParksDeck();
  const parksDisplay: Park[] = [];
  for (let i = 0; i < PARKS_DISPLAY_SIZE; i++) {
    const p = parksDeck.shift();
    if (p) parksDisplay.push(p);
  }

  // Deal 2 distinct passion cards to each player (4 unique total)
  const passionPool = [...PASSION_IDS];
  shuffleInPlace(passionPool);
  const passionsA: PassionId[] = [passionPool[0], passionPool[1]];
  const passionsB: PassionId[] = [passionPool[2], passionPool[3]];

  // Starting canteens — drawn from the top of the pile
  const startC1 = canteenPool.shift();
  const startC2 = canteenPool.shift();
  if (!startC1 || !startC2) throw new Error("Canteen pool empty during setup");

  // Build the face-up display ("shop")
  const canteenDisplay: CanteenEffect[] = [];
  for (let i = 0; i < CANTEEN_DISPLAY_SIZE; i++) {
    const c = canteenPool.shift();
    if (c) canteenDisplay.push(c);
  }

  const players: [PlayerState, PlayerState] = [
    buildInitialPlayer(
      0,
      strategies[0] === null ? "human" : "ai",
      strategies[0] ?? undefined,
      passionsA,
      startC1,
      0,
    ),
    buildInitialPlayer(
      1,
      strategies[1] === null ? "human" : "ai",
      strategies[1] ?? undefined,
      passionsB,
      startC2,
      1,
    ),
  ];

  // Pick one season mission per season for this game.
  const selectedSeasonMissions: Record<Season, SeasonMission> = {
    spring: randomChoice(SEASON_MISSIONS.spring),
    summer: randomChoice(SEASON_MISSIONS.summer),
    fall: randomChoice(SEASON_MISSIONS.fall),
  };

  // Build & shuffle the gear deck, then deal GEAR_DISPLAY_SIZE to the visible row.
  const { cards: gearCards, nextId: nextGearId } = buildGearDeck(0);
  shuffleInPlace(gearCards);
  const gearVisible: GearCard[] = [];
  for (let i = 0; i < GEAR_DISPLAY_SIZE; i++) {
    const top = gearCards.shift();
    if (top) gearVisible.push(top);
  }

  const state: GameState = {
    phase: "awaiting-passion-choice",
    players,
    trail,
    weatherTokens: buildWeatherTokens(),
    activePlayer: 0,
    season: "spring",
    parksDisplay,
    parksDeck,
    canteenPool,
    canteenDisplay,
    gearMarket: { visible: gearVisible, deck: gearCards, discard: [] },
    nextGearId,
    nextCanteenId: 2,
    nextPhotoId: 0,
    pendingSiteContext: null,
    pendingGearActivation: null,
    pendingLanding: null,
    pendingWeatherClaim: null,
    pendingWaterPlacements: 0,
    pendingCanteenEffect: null,
    shutterbugTilePosition: pickShutterbugPosition(trail),
    shutterbugHolder: null,
    firstPlayerToken: Math.random() < 0.5 ? 0 : 1,
    trailEndRowFirstOccupier: [null, null, null],
    selectedSeasonMissions,
    seasonMissionResults: [],
    actionLog: [],
    turnCount: 0,
  };
  state.activePlayer = state.firstPlayerToken;
  state.actionLog.push({
    turn: 0,
    season: state.season,
    playerIndex: state.firstPlayerToken,
    action: "first-player-token",
  });

  if (state.shutterbugTilePosition !== null) {
    state.actionLog.push({
      turn: 0,
      season: state.season,
      playerIndex: -1,
      action: "shutterbug-placed",
      toPosition: state.shutterbugTilePosition,
    });
  }

  // Spring bonus is deferred until both players have chosen a passion
  return state;
}

// ---------------------------------------------------------------------------
// Season start bonus
// ---------------------------------------------------------------------------

function applySeasonStartBonus(state: GameState, season: Season): void {
  const r = SEASON_BONUS[season];
  for (const p of state.players) {
    grantResource(p, r, 1);
  }
}

// ---------------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------------

function grantResource(player: PlayerState, r: ResourceType, count: number): void {
  if (count <= 0) return;
  // Botany/Rock Climbing gear effect: swap Forest/Mountain for Wildlife.
  let target: ResourceType = r;
  if (player.passionMode === "gear" && player.passion) {
    if (player.passion === "botany" && r === "F") target = "A";
    else if (player.passion === "rock-climbing" && r === "M") target = "A";
  }
  player.resources[target] += count;
  player.resourceTypesEverHeld.add(target);
  player.seasonStats.resourcesGained[target] += count;
}

/**
 * Grant Water to the active player. Each unit must be placed (per the player's
 * choice) onto a useful canteen-row gap or kept in the backpack as a +1 W
 * resource. We just queue the units here; the choice flow runs in
 * endActionTurn / handlePlaceOrKeepWater.
 */
function grantWater(state: GameState, player: PlayerState, count: number): void {
  if (count <= 0) return;
  // Track resource gain (counts toward season missions like spring-most-w
  // regardless of whether the unit is placed on a row or kept).
  player.seasonStats.resourcesGained.W += count;
  player.resourceTypesEverHeld.add("W");
  state.pendingWaterPlacements += count;
}

/**
 * If pending water placements exist and useful gaps are available, transition
 * the active player into "awaiting-water-placement" and return true. If no
 * useful gaps remain, dump the remaining count into resources.W and return
 * false. Returns false (and does nothing) if there's nothing pending or if the
 * phase isn't currently "playing".
 */
function maybeEnterWaterPlacement(state: GameState): boolean {
  if (state.pendingWaterPlacements <= 0) return false;
  if (state.phase !== "playing") return false;
  const player = state.players[state.activePlayer];
  const useful = getUsefulWaterGaps(player);
  if (useful.length === 0) {
    player.resources.W += state.pendingWaterPlacements;
    state.pendingWaterPlacements = 0;
    return false;
  }
  state.phase = "awaiting-water-placement";
  return true;
}

function grantCanteen(
  state: GameState,
  player: PlayerState,
  effect: CanteenEffect,
): Canteen | null {
  const slot = firstEmptyCanteenSlot(player);
  if (slot === null) return null; // no room — discard the canteen
  const c: Canteen = { id: state.nextCanteenId++, effect, slot, used: false };
  player.canteens.push(c);
  player.seasonStats.canteensTaken += 1;
  return c;
}

function grantPhoto(state: GameState, player: PlayerState): void {
  player.photos.push({ id: state.nextPhotoId++ });
}

/**
 * Award `baseCount` photos to the player. Shutterbug bonus is offered
 * separately via `maybeOfferShutterbugBonus` after the photo action resolves
 * (the player must choose to spend an additional resource for each bonus).
 */
function takePhoto(state: GameState, player: PlayerState, baseCount = 1): void {
  for (let i = 0; i < baseCount; i++) grantPhoto(state, player);
}

/**
 * If the active player holds the Shutterbug token and has resources to spend,
 * transition into `awaiting-shutterbug-photo` to let them pay for an extra
 * photo. Returns true if the prompt was shown (caller should NOT proceed to
 * `maybeEndTurn`).
 */
function maybeOfferShutterbugBonus(state: GameState): boolean {
  const player = state.players[state.activePlayer];
  if (state.shutterbugHolder !== state.activePlayer) return false;
  if (!anyResource(player)) return false;
  state.phase = "awaiting-shutterbug-photo";
  return true;
}

// ---------------------------------------------------------------------------
// Apply action (immutable)
// ---------------------------------------------------------------------------

export function applyActionPure(state: GameState, action: Action): GameState {
  const next = cloneState(state);
  applyAction(next, action);
  return next;
}

function cloneState(state: GameState): GameState {
  // structuredClone doesn't preserve Set, so we do a focused deep-copy.
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hikers: [{ ...p.hikers[0] }, { ...p.hikers[1] }] as [
        PlayerState["hikers"][0],
        PlayerState["hikers"][1],
      ],
      resources: { ...p.resources },
      canteens: p.canteens.map((c) => ({ ...c })),
      waterTokens: [...p.waterTokens],
      photos: p.photos.map((ph) => ({ ...ph })),
      parks: p.parks.map((park) => ({
        ...park,
        cost: { ...park.cost },
        refund: { ...park.refund },
      })),
      gear: p.gear.map((g) => ({ ...g })),
      reservedParks: p.reservedParks.map((park) => ({
        ...park,
        cost: { ...park.cost },
        refund: { ...park.refund },
      })),
      triggeredThisTurn: [...p.triggeredThisTurn],
      usedGearThisTurn: [...p.usedGearThisTurn],
      resourceTypesEverHeld: new Set(p.resourceTypesEverHeld),
      seasonStats: {
        resourcesGained: { ...p.seasonStats.resourcesGained },
        canteensTaken: p.seasonStats.canteensTaken,
        parksVisited: p.seasonStats.parksVisited,
        parksWithInstantRewardVisited: p.seasonStats.parksWithInstantRewardVisited,
      },
    })) as [PlayerState, PlayerState],
    trail: [...state.trail],
    weatherTokens: [...state.weatherTokens],
    parksDisplay: state.parksDisplay.map((p) => ({
      ...p,
      cost: { ...p.cost },
      refund: { ...p.refund },
    })),
    parksDeck: state.parksDeck.map((p) => ({
      ...p,
      cost: { ...p.cost },
      refund: { ...p.refund },
    })),
    canteenPool: [...state.canteenPool],
    canteenDisplay: [...state.canteenDisplay],
    gearMarket: {
      visible: state.gearMarket.visible.map((g) => ({ ...g })),
      deck: state.gearMarket.deck.map((g) => ({ ...g })),
      discard: state.gearMarket.discard.map((g) => ({ ...g })),
    },
    pendingSiteContext: state.pendingSiteContext ? { ...state.pendingSiteContext } : null,
    pendingGearActivation: state.pendingGearActivation ? { ...state.pendingGearActivation } : null,
    pendingLanding: state.pendingLanding ? { ...state.pendingLanding } : null,
    pendingWeatherClaim: state.pendingWeatherClaim ? { ...state.pendingWeatherClaim } : null,
    selectedSeasonMissions: { ...state.selectedSeasonMissions },
    seasonMissionResults: state.seasonMissionResults.map((entry) => ({
      season: entry.season,
      results: entry.results.map((r) => ({ ...r })),
    })),
    trailEndRowFirstOccupier: [...state.trailEndRowFirstOccupier],
    actionLog: [...state.actionLog],
  };
}

// ---------------------------------------------------------------------------
// Apply action (mutating)
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): void {
  switch (action.type) {
    case "choose-passion":
      handleChoosePassion(state, action.passionId);
      break;
    case "passion-mode-choice":
      handlePassionModeChoice(state, action.mode);
      break;
    case "move":
      handleMove(state, action.hikerId, action.targetPosition);
      break;
    case "landing-choice":
      handleLandingChoice(state, action.first);
      break;
    case "draw-canteen":
      if (action.source === "display") handleDrawCanteen(state, "display", action.displayIndex);
      else handleDrawCanteen(state, "pile");
      break;
    case "place-canteen-row":
      handlePlaceCanteenRow(state, action.row);
      break;
    case "place-or-keep-water":
      handlePlaceOrKeepWater(state, action.placement);
      break;
    case "use-canteen":
      handleUseCanteen(state, action.canteenId);
      break;
    case "buy-park":
      handleBuyPark(state, action.parkId, action.pay, "display");
      // Park Action chain-buy: stay in awaiting-park-action so the player can
      // keep buying with newly-refunded resources, reserve one, or pass.
      if (state.phase === "playing" || state.phase === "awaiting-park-action") {
        state.phase = "awaiting-park-action";
        if (!state.pendingSiteContext) {
          state.pendingSiteContext = {
            playerIndex: state.activePlayer,
            source: "site",
          };
        }
      }
      break;
    case "buy-park-reserved":
      handleBuyPark(state, action.parkId, action.pay, "reserved");
      if (state.phase === "playing" || state.phase === "awaiting-park-action") {
        state.phase = "awaiting-park-action";
        if (!state.pendingSiteContext) {
          state.pendingSiteContext = {
            playerIndex: state.activePlayer,
            source: "site",
          };
        }
      }
      break;
    case "exchange-resource":
      handleExchange(state, action.resource);
      break;
    case "canteen-or-photo-choice":
      if (action.choice === "canteen") handleCanteenChoiceCanteen(state);
      else handleCanteenChoicePhoto(state, action.payWith);
      break;
    case "skip-park-action":
      // Just end turn after a Parks-site landing without buying.
      maybeEndTurn(state);
      break;
    case "buy-gear":
      if (action.source === "display") handleBuyGear(state, "display", action.index);
      else handleBuyGear(state, "deck-blind");
      break;
    case "activate-gear":
      handleActivateGear(state, action.gearId);
      break;
    case "gear-photo-payment":
      handleGearPhotoPayment(state, action.payWith);
      break;
    case "reserve-park":
      if (action.source === "display") handleReservePark(state, "display", action.parkId);
      else handleReservePark(state, "deck-top");
      break;
    case "shutterbug-photo-pay":
      handleShutterbugPhotoPay(state, action.payWith);
      break;
    case "discard-resource":
      handleDiscardResource(state, action.resource);
      break;
    case "pass":
      handlePass(state);
      break;
  }
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Choose passion (game start)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Passion goal evaluation + mode pick
// ---------------------------------------------------------------------------

/** Returns true if the player's passion goal is currently satisfied. */
function isPassionGoalMet(player: PlayerState): boolean {
  if (!player.passion) return false;
  switch (player.passion) {
    case "adventure":
      // Visit 2 parks with Instant Actions (refund).
      return player.parks.filter(parkHasInstantReward).length >= 2;
    case "birdwatching":
      // Visit 2 parks with at least 1 Sun in cost.
      return player.parks.filter((p) => p.cost.S > 0).length >= 2;
    case "botany":
      // 3 Forests on visited parks (sum of forest cost).
      return player.parks.reduce((acc, p) => acc + p.cost.F, 0) >= 3;
    case "collecting":
      // Own at least 2 Gear Cards.
      return player.gear.length >= 2;
    case "forestry":
      return player.parks.filter((p) => p.cost.F > 0).length >= 3;
    case "kayaking":
      return player.parks.filter((p) => p.cost.W > 0).length >= 2;
    case "mountaineering":
      return player.parks.filter((p) => p.cost.M > 0).length >= 3;
    case "rock-climbing":
      return player.parks.reduce((acc, p) => acc + p.cost.M, 0) >= 3;
    case "swimming":
      return player.parks.reduce((acc, p) => acc + p.cost.W, 0) >= 3;
    case "wildlife":
      // Spend a Wildlife to take a Photo at least once. We track this implicitly:
      // any photo paid with A counts. Easiest approach: look at the action log.
      // A specific photo entry with resource === "A" indicates a wildlife-paid photo.
      // Note: this is a one-time goal; once met it stays met.
      // (We allow goalMet to flip on once detected.)
      return false; // detection happens in handleCanteenChoicePhoto via direct flag set
  }
}

/** If the player has an unmet goal that just turned true, enter awaiting-passion-mode-choice. */
function maybeOfferPassionMode(state: GameState): void {
  const player = state.players[state.activePlayer];
  if (player.passionGoalMet) return;
  if (!player.passion) return;
  if (!isPassionGoalMet(player)) return;
  player.passionGoalMet = true;
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "passion-goal-met",
    passionId: player.passion,
  });
  state.phase = "awaiting-passion-mode-choice";
}

function handlePassionModeChoice(state: GameState, mode: PassionMode): void {
  const player = state.players[state.activePlayer];
  if (!player.passion) throw new Error("No passion to mode-choose");
  if (player.passionMode !== null) throw new Error("Passion mode already chosen");
  if (!player.passionGoalMet) throw new Error("Goal not yet met");
  player.passionMode = mode;
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "passion-mode",
    passionId: player.passion,
    passionMode: mode,
  });
  // Resume normal play (do NOT end the turn — player still has their action).
  state.phase = "playing";
  // If the action that triggered the goal also queued water, resolve that next.
  maybeEnterWaterPlacement(state);
}

function handleChoosePassion(state: GameState, passionId: PassionId): void {
  const player = state.players[state.activePlayer];
  if (!player.passionOptions.includes(passionId)) {
    throw new Error(`Passion ${passionId} not in player's options`);
  }
  player.passion = passionId;
  player.passionOptions = [];

  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "choose-passion",
    passionId,
  });

  // If anyone still hasn't chosen, swap to them
  const nextIdx = state.players.findIndex((p) => p.passion === null);
  if (nextIdx !== -1) {
    state.activePlayer = nextIdx;
    return;
  }

  // Everyone chose — start the game proper. No spring start bonus: players
  // begin the game with zero resources. Summer/fall transitions still grant
  // their respective season bonus.
  state.phase = "playing";
  state.activePlayer = 0;
}

function handleMove(state: GameState, hikerId: 0 | 1, targetPosition: number): void {
  const player = state.players[state.activePlayer];
  const hiker = player.hikers[hikerId];
  const targets = legalMoveTargets(state, state.activePlayer, hikerId);
  if (!targets.includes(targetPosition)) {
    throw new Error(`Illegal move: hiker ${hikerId} → ${targetPosition}`);
  }
  const fromPos = hiker.position;
  hiker.position = targetPosition;

  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "move",
    hikerId,
    fromPosition: fromPos,
    toPosition: targetPosition,
  });

  // Trail's End — pick a row's action (Park / Photo / Shop) and grant first-occupier bonus.
  if (isAtTrailEnd(targetPosition)) {
    resolveTrailEndArrival(state, targetPosition);
    return;
  }

  // Off-trail (defensive — shouldn't normally happen)
  if (targetPosition < 0 || targetPosition >= TRAIL_LENGTH) {
    maybeEndTurn(state);
    return;
  }

  // If we landed on a tile occupied by another hiker, the campfire is consumed.
  // (Trail's End is exempt — it allows stacking — and was handled above.)
  const otherHikerHere = state.players.some((p) =>
    p.hikers.some((h) => {
      if (p.index === state.activePlayer && h.id === hikerId) return false;
      return h.position === targetPosition;
    }),
  );
  if (otherHikerHere && player.campfireLit) {
    player.campfireLit = false;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "campfire-extinguished",
    });
  }

  // Shutterbug: any hiker landing on the marked tile takes the token, stealing
  // it from a previous holder. The token stays on the tile all season — it can
  // change hands repeatedly.
  if (
    state.shutterbugTilePosition === targetPosition &&
    state.shutterbugHolder !== state.activePlayer
  ) {
    state.shutterbugHolder = state.activePlayer;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "shutterbug-taken",
    });
  }

  const token = state.weatherTokens[targetPosition];
  const site = state.trail[targetPosition];

  // Both weather + site → ask player which to do first
  if (token !== null) {
    const landing: PendingLanding = {
      playerIndex: state.activePlayer,
      hikerId,
      position: targetPosition,
      weather: token,
      site,
    };
    state.pendingLanding = landing;
    state.phase = "awaiting-landing-choice";
    return;
  }

  // No weather → resolve site directly
  resolveSite(state, site);
}

/**
 * Resolve a hiker arriving at one of the three Trail's End rows. Grants the
 * first-occupier bonus (if not yet claimed) and triggers the row's action
 * (Park / Photo / Shop). The R1 row's bonus is the First-Player Token, which
 * may be stolen from another player.
 */
function resolveTrailEndArrival(state: GameState, position: number): void {
  const player = state.players[state.activePlayer];
  const row: 0 | 1 | 2 = position === TRAIL_END_R1 ? 0 : position === TRAIL_END_R2 ? 1 : 2;

  // Grant the row bonus to the first occupier (per season).
  if (state.trailEndRowFirstOccupier[row] === null) {
    state.trailEndRowFirstOccupier[row] = state.activePlayer;
    if (row === 0) {
      // First-Player Token: stolen if held by anyone else.
      if (state.firstPlayerToken !== state.activePlayer) {
        state.firstPlayerToken = state.activePlayer;
        state.actionLog.push({
          turn: state.turnCount,
          season: state.season,
          playerIndex: state.activePlayer,
          action: "first-player-token",
        });
      }
    } else if (row === 1) {
      grantResource(player, "A", 1);
      state.actionLog.push({
        turn: state.turnCount,
        season: state.season,
        playerIndex: state.activePlayer,
        action: "trail-end-bonus",
        resource: "A",
      });
    } else {
      grantResource(player, "S", 1);
      state.actionLog.push({
        turn: state.turnCount,
        season: state.season,
        playerIndex: state.activePlayer,
        action: "trail-end-bonus",
        resource: "S",
      });
    }
  }

  // Trigger the row's action.
  if (row === 0) {
    // Park Action — same prompt as the canteen "park-action" effect.
    const hasAnyPark =
      state.parksDisplay.length > 0 ||
      state.parksDeck.length > 0 ||
      player.reservedParks.length > 0;
    if (!hasAnyPark) {
      maybeEndTurn(state);
      return;
    }
    state.phase = "awaiting-park-action";
    state.pendingSiteContext = {
      playerIndex: state.activePlayer,
      source: "trail-end",
      trailEndRow: 0,
    };
    return;
  }
  if (row === 1) {
    // Photo Action — pick a resource to spend (or skip).
    if (anyResource(player)) {
      state.phase = "awaiting-canteen-photo";
      state.pendingSiteContext = {
        playerIndex: state.activePlayer,
        source: "trail-end",
        trailEndRow: 1,
      };
    } else {
      maybeEndTurn(state);
    }
    return;
  }
  // R3 — Shop access (gear market).
  state.phase = "awaiting-gear-or-end";
  state.pendingSiteContext = {
    playerIndex: state.activePlayer,
    source: "trail-end",
    trailEndRow: 2,
  };
}

// ---------------------------------------------------------------------------
// Landing-choice
// ---------------------------------------------------------------------------

function handleLandingChoice(state: GameState, first: "weather" | "site"): void {
  const pl = state.pendingLanding;
  if (!pl) throw new Error("No pending landing");
  state.pendingLanding = null;
  state.phase = "playing";

  if (first === "weather") {
    claimWeatherToken(state, pl.position, pl.weather);
    resolveSite(state, pl.site);
    return;
  }

  // first === "site": defer the weather claim until the site flow ends
  const claim: PendingWeatherClaim = { position: pl.position, weather: pl.weather };
  state.pendingWeatherClaim = claim;
  resolveSite(state, pl.site);
}

function claimWeatherToken(state: GameState, position: number, weather: WeatherToken): void {
  const player = state.players[state.activePlayer];
  // Defensive: only claim if still present
  if (state.weatherTokens[position] === null) return;
  state.weatherTokens[position] = null;
  if (weather === "W") {
    grantWater(state, player, 1);
  } else {
    grantResource(player, weather, 1);
  }
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "weather-token",
    resource: weather,
  });
}

// ---------------------------------------------------------------------------
// Site resolution
// ---------------------------------------------------------------------------

function resolveSite(state: GameState, site: SiteType): void {
  const player = state.players[state.activePlayer];

  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "site-effect",
    site,
  });

  switch (site) {
    case "gain-2W":
      grantWater(state, player, 2);
      fireTrigger(state, "tile-w");
      maybeEndTurn(state);
      return;
    case "gain-2S":
      grantResource(player, "S", 2);
      fireTrigger(state, "tile-s");
      maybeEndTurn(state);
      return;
    case "gain-1M":
      grantResource(player, "M", 1);
      fireTrigger(state, "tile-m");
      maybeEndTurn(state);
      return;
    case "gain-1F":
      grantResource(player, "F", 1);
      fireTrigger(state, "tile-f");
      maybeEndTurn(state);
      return;
    case "trail-die": {
      const face = randomChoice(TRAIL_DIE_FACES);
      applyTrailDie(state, face);
      // applyTrailDie may set awaiting-canteen-draw (face "1C"); only end turn here if it didn't.
      if (state.phase === "playing") maybeEndTurn(state);
      return;
    }
    case "exchange-A":
      // Only request a choice if the player can actually exchange.
      if (canExchange(player)) {
        state.phase = "awaiting-exchange";
        state.pendingSiteContext = { playerIndex: state.activePlayer, source: "site" };
      } else {
        // No legal exchange — turn ends.
        maybeEndTurn(state);
      }
      return;
    case "canteen-or-photo":
      state.phase = "awaiting-canteen-or-photo";
      state.pendingSiteContext = { playerIndex: state.activePlayer, source: "site" };
      return;
    case "parks": {
      // Park Action: player may buy any number of affordable parks (and/or
      // reserve one). Pass when done. No trigger fires from the Parks tile.
      const hasAnyPark =
        state.parksDisplay.length > 0 ||
        state.parksDeck.length > 0 ||
        player.reservedParks.length > 0;
      if (!hasAnyPark) {
        maybeEndTurn(state);
        return;
      }
      state.phase = "awaiting-park-action";
      state.pendingSiteContext = { playerIndex: state.activePlayer, source: "site" };
      return;
    }
    case "shop":
      // Trading Post — let player buy gear from the market or pass.
      state.phase = "awaiting-gear-or-end";
      state.pendingSiteContext = { playerIndex: state.activePlayer, source: "site" };
      return;
  }
}

function applyTrailDie(state: GameState, face: TrailDieFace): void {
  const player = state.players[state.activePlayer];
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "trail-die",
    trailDieFace: face,
  });
  fireTrigger(state, "trail-die");
  switch (face) {
    case "2W":
      grantWater(state, player, 2);
      return;
    case "2S":
      grantResource(player, "S", 2);
      return;
    case "1M":
      grantResource(player, "M", 1);
      return;
    case "1F":
      grantResource(player, "F", 1);
      return;
    case "1A":
      grantResource(player, "A", 1);
      return;
    case "1C": {
      offerCanteenDraw(state);
      return;
    }
  }
}

/**
 * Offer the active player a canteen draw choice (face-up display vs hidden pile).
 * If no canteens are available anywhere, ends the action turn instead.
 */
function offerCanteenDraw(state: GameState): void {
  if (state.canteenDisplay.length === 0 && state.canteenPool.length === 0) {
    maybeEndTurn(state);
    return;
  }
  state.phase = "awaiting-canteen-draw";
}

function handleDrawCanteen(
  state: GameState,
  source: "display" | "pile",
  displayIndex?: number,
): void {
  const player = state.players[state.activePlayer];
  let effect: CanteenEffect | undefined;
  if (source === "display") {
    if (displayIndex === undefined) throw new Error("displayIndex required for display draw");
    effect = state.canteenDisplay[displayIndex];
    if (!effect) throw new Error(`No canteen at display index ${displayIndex}`);
    state.canteenDisplay.splice(displayIndex, 1);
    refillCanteenDisplay(state);
  } else {
    effect = state.canteenPool.shift();
    if (!effect && state.canteenDisplay.length > 0) {
      // Edge: no pile but display has cards — let player take from display next time
      // For now, treat as no draw
    }
  }

  if (!effect) {
    // No canteen actually drawn (e.g. empty pile + empty display) — just end turn.
    state.phase = "playing";
    state.pendingSiteContext = null;
    maybeEndTurn(state);
    return;
  }

  // If the player already has a canteen in every slot, the canteen is discarded.
  if (firstEmptyCanteenSlot(player) === null) {
    state.phase = "playing";
    state.pendingSiteContext = null;
    maybeOfferPassionMode(state);
    if (state.phase !== "playing") return;
    maybeEndTurn(state);
    return;
  }

  // If only one row has any free slots, auto-place there (no choice to make).
  const rowsWithSpace = availableCanteenRows(player);
  if (rowsWithSpace.length === 1) {
    placeCanteenInRow(state, player, effect, rowsWithSpace[0]);
    state.phase = "playing";
    state.pendingSiteContext = null;
    maybeOfferPassionMode(state);
    if (state.phase !== "playing") return;
    maybeEndTurn(state);
    return;
  }

  // Multiple rows available — let the player pick.
  state.pendingCanteenEffect = effect;
  state.phase = "awaiting-canteen-row-choice";
}

/** Place a freshly drawn canteen into the leftmost empty slot of the chosen row. */
function placeCanteenInRow(
  state: GameState,
  player: PlayerState,
  effect: CanteenEffect,
  row: 0 | 1 | 2,
): void {
  const slot0 = row * 2;
  const slot1 = row * 2 + 1;
  const used = new Set(player.canteens.map((c) => c.slot));
  const slot = !used.has(slot0) ? slot0 : !used.has(slot1) ? slot1 : null;
  if (slot === null) throw new Error(`No empty slot in row ${row}`);
  const c: Canteen = { id: state.nextCanteenId++, effect, slot, used: false };
  player.canteens.push(c);
  player.seasonStats.canteensTaken += 1;
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "take-canteen",
    canteenEffect: c.effect,
  });
}

/** Rows (0|1|2) that have at least one empty canteen slot. */
function availableCanteenRows(player: PlayerState): (0 | 1 | 2)[] {
  const used = new Set(player.canteens.map((c) => c.slot));
  const rows: (0 | 1 | 2)[] = [];
  for (const row of [0, 1, 2] as const) {
    if (!used.has(row * 2) || !used.has(row * 2 + 1)) rows.push(row);
  }
  return rows;
}

function handlePlaceCanteenRow(state: GameState, row: 0 | 1 | 2): void {
  const effect = state.pendingCanteenEffect;
  if (!effect) throw new Error("No pending canteen effect to place");
  const player = state.players[state.activePlayer];
  placeCanteenInRow(state, player, effect, row);
  state.pendingCanteenEffect = null;
  state.phase = "playing";
  state.pendingSiteContext = null;
  maybeOfferPassionMode(state);
  if (state.phase !== "playing") return;
  maybeEndTurn(state);
}

// ---------------------------------------------------------------------------
// Canteen usage
// ---------------------------------------------------------------------------

function handlePlaceOrKeepWater(state: GameState, placement: WaterGapIndex | "keep"): void {
  const player = state.players[state.activePlayer];
  if (state.pendingWaterPlacements <= 0) throw new Error("No pending water to place");

  let placedOnGap = false;
  if (placement === "keep") {
    player.resources.W += 1;
  } else {
    if (placement < 0 || placement >= CANTEEN_BOARD_WATER_GAPS) {
      throw new Error(`Invalid gap ${placement}`);
    }
    if (player.waterTokens[placement]) {
      throw new Error(`Water token already at gap ${placement}`);
    }
    player.waterTokens[placement] = true;
    placedOnGap = true;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "place-water",
      waterGap: placement,
    });
  }
  state.pendingWaterPlacements -= 1;

  // Swimming gear: roll the trail die when filling a canteen row (not when keeping).
  if (placedOnGap && player.passionMode === "gear" && player.passion === "swimming") {
    const face = randomChoice(TRAIL_DIE_FACES);
    applyTrailDie(state, face);
    // Trail die may open awaiting-canteen-draw; if so, leave that to resolve first.
    if (state.phase === "awaiting-canteen-draw") return;
  }

  // More water still queued? Re-evaluate placement options.
  if (state.pendingWaterPlacements > 0) {
    const useful = getUsefulWaterGaps(player);
    if (useful.length === 0) {
      player.resources.W += state.pendingWaterPlacements;
      state.pendingWaterPlacements = 0;
    } else {
      state.phase = "awaiting-water-placement";
      return;
    }
  }

  state.phase = "playing";
  maybeEndTurn(state);
}

function handleUseCanteen(state: GameState, canteenId: number): void {
  const player = state.players[state.activePlayer];
  const c = player.canteens.find((x) => x.id === canteenId);
  if (!c) throw new Error(`Canteen ${canteenId} not found`);
  if (c.used) throw new Error(`Canteen ${canteenId} already used`);
  if (!canteenIsActivated(player, c.slot)) {
    throw new Error(`Canteen ${canteenId} row not activated — place a water token first`);
  }
  c.used = true;
  player.canteensUsedCount += 1;

  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "use-canteen",
    canteenEffect: c.effect,
  });

  switch (c.effect) {
    case "2W":
      grantWater(state, player, 2);
      maybeEndTurn(state);
      return;
    case "2S":
      grantResource(player, "S", 2);
      maybeEndTurn(state);
      return;
    case "1M":
      grantResource(player, "M", 1);
      maybeEndTurn(state);
      return;
    case "1F":
      grantResource(player, "F", 1);
      maybeEndTurn(state);
      return;
    case "exchange-A":
      if (canExchange(player)) {
        state.phase = "awaiting-canteen-exchange";
        state.pendingSiteContext = {
          playerIndex: state.activePlayer,
          source: "canteen",
          canteenId,
        };
      } else {
        maybeEndTurn(state);
      }
      return;
    case "photo":
      // Need to pick a resource to spend; if none, end turn.
      if (anyResource(player)) {
        state.phase = "awaiting-canteen-photo";
        state.pendingSiteContext = {
          playerIndex: state.activePlayer,
          source: "canteen",
          canteenId,
        };
      } else {
        maybeEndTurn(state);
      }
      return;
    case "park-action": {
      // Prompt the player to buy or reserve a park. Nothing to do if the market
      // is fully empty and the deck is out — bail to normal turn-end.
      const deckHasPark = state.parksDeck.length > 0;
      const hasAnyPark =
        state.parksDisplay.length > 0 || deckHasPark || player.reservedParks.length > 0;
      if (!hasAnyPark) {
        maybeEndTurn(state);
        return;
      }
      state.phase = "awaiting-park-action";
      state.pendingSiteContext = {
        playerIndex: state.activePlayer,
        source: "canteen",
        canteenId,
      };
      return;
    }
  }
}

function canExchange(player: PlayerState): boolean {
  return (
    player.resources.M > 0 ||
    player.resources.F > 0 ||
    player.resources.S > 0 ||
    player.resources.W > 0
  );
}

function anyResource(player: PlayerState): boolean {
  return (
    player.resources.M > 0 ||
    player.resources.F > 0 ||
    player.resources.S > 0 ||
    player.resources.W > 0 ||
    player.resources.A > 0
  );
}

// ---------------------------------------------------------------------------
// Buy park
// ---------------------------------------------------------------------------

function handleBuyPark(
  state: GameState,
  parkId: number,
  pay: ResourceBag,
  source: "display" | "reserved",
): void {
  const player = state.players[state.activePlayer];
  let park: Park;
  let removeFromDisplay = false;
  let displayIdx = -1;
  if (source === "display") {
    displayIdx = state.parksDisplay.findIndex((p) => p.id === parkId);
    if (displayIdx < 0) throw new Error(`Park ${parkId} not in display`);
    park = state.parksDisplay[displayIdx];
    removeFromDisplay = true;
  } else {
    const reservedIdx = player.reservedParks.findIndex((p) => p.id === parkId);
    if (reservedIdx < 0) throw new Error(`Park ${parkId} not in reserved`);
    park = player.reservedParks[reservedIdx];
    player.reservedParks.splice(reservedIdx, 1);
  }
  const eff = effectivePark(park, player);

  // Verify pay is valid against the (possibly discounted) effective cost
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    if (pay[r] < 0 || pay[r] > player.resources[r]) {
      throw new Error(`Invalid payment for park ${parkId}`);
    }
  }
  const totalPay = pay.M + pay.F + pay.S + pay.W + pay.A;
  const totalCost = eff.cost.M + eff.cost.F + eff.cost.S + eff.cost.W + eff.cost.A;
  if (totalPay !== totalCost) throw new Error("Payment total does not match park cost");

  // Spend
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    player.resources[r] -= pay[r];
  }

  // Apply refund (immediate gains)
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    if (park.refund[r] <= 0) continue;
    if (r === "W") grantWater(state, player, park.refund[r]);
    else grantResource(player, r, park.refund[r]);
  }
  // Apply extras (canteens / photos)
  const extras = getParkExtras(park.id);
  for (let i = 0; i < extras.canteens; i++) {
    const ce = state.canteenPool.shift();
    if (ce) grantCanteen(state, player, ce);
  }
  for (let i = 0; i < extras.photos; i++) {
    grantPhoto(state, player);
  }

  // Move park to player tableau
  player.parks.push(park);
  if (removeFromDisplay) {
    state.parksDisplay.splice(displayIdx, 1);
    // Refill display from deck if available
    const replacement = state.parksDeck.shift();
    if (replacement) state.parksDisplay.push(replacement);
  }

  // Per-season stats
  player.seasonStats.parksVisited += 1;
  if (parkHasInstantReward(park)) player.seasonStats.parksWithInstantRewardVisited += 1;

  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "buy-park",
    parkId: park.id,
    parkName: park.name,
    parkPt: park.pt,
  });

  // Adventure gear: rolling the trail die when visiting an Instant-Reward park.
  if (
    player.passionMode === "gear" &&
    player.passion === "adventure" &&
    parkHasInstantReward(park)
  ) {
    const face = randomChoice(TRAIL_DIE_FACES);
    applyTrailDie(state, face);
  }

  // Passion goal may now be met.
  maybeOfferPassionMode(state);
}

function parkHasInstantReward(park: Park): boolean {
  return park.refund.M + park.refund.F + park.refund.S + park.refund.W + park.refund.A > 0;
}

// ---------------------------------------------------------------------------
// Gear: buy / activate / reserve / photo-payment
// ---------------------------------------------------------------------------

function handleBuyGear(state: GameState, source: "display" | "deck-blind", index?: number): void {
  const player = state.players[state.activePlayer];
  let card: GearCard;
  let cost: number;
  if (source === "display") {
    if (index === undefined) throw new Error("index required for display gear buy");
    if (index < 0 || index >= state.gearMarket.visible.length) {
      throw new Error(`Invalid gear index ${index}`);
    }
    card = state.gearMarket.visible[index];
    cost = GEAR_COSTS[card.kind];
    if (player.resources.S < cost) throw new Error(`Not enough Sun for ${card.kind}`);
    player.resources.S -= cost;
    state.gearMarket.visible.splice(index, 1);
    refillGearMarket(state);
  } else {
    if (state.gearMarket.deck.length === 0) {
      if (state.gearMarket.discard.length === 0) throw new Error("Gear deck empty");
      state.gearMarket.deck = [...state.gearMarket.discard];
      shuffleInPlace(state.gearMarket.deck);
      state.gearMarket.discard = [];
    }
    cost = GEAR_BLIND_COST;
    if (player.resources.S < cost) throw new Error("Not enough Sun for blind gear buy");
    player.resources.S -= cost;
    const top = state.gearMarket.deck.shift();
    if (!top) throw new Error("Gear deck unexpectedly empty");
    card = top;
  }
  player.gear.push(card);
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "buy-gear",
    gearKind: card.kind,
    gearCost: cost,
    source: source === "display" ? "display" : "deck",
  });
  state.pendingSiteContext = null;
  state.phase = "playing";
  // Buying gear may complete the Collecting passion's goal.
  maybeOfferPassionMode(state);
  if (state.phase !== "playing") return;
  maybeEndTurn(state);
}

function handleActivateGear(state: GameState, gearId: number): void {
  const player = state.players[state.activePlayer];
  const gear = player.gear.find((g) => g.id === gearId);
  if (!gear) throw new Error(`Gear ${gearId} not owned`);
  if (!gearCanBeActivated(player, gear)) {
    throw new Error(`Gear ${gear.kind} cannot be activated this turn`);
  }
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "activate-gear",
    gearKind: gear.kind,
  });
  // Mark used immediately so chained triggers cannot re-activate this gear.
  player.usedGearThisTurn.push(gearId);
  // Clear any shop-landing context — activating gear ends that interaction.
  state.pendingSiteContext = null;

  switch (gear.kind) {
    case "wide-angle-lens":
    case "telephoto-lens": {
      if (!anyResource(player)) {
        throw new Error(`No resources to pay for ${gear.kind} photo`);
      }
      state.pendingGearActivation = { gearId, kind: gear.kind };
      state.phase = "awaiting-gear-photo-payment";
      return;
    }
    case "camp-mug": {
      // Take a canteen — reuse the standard draw flow.
      offerCanteenDraw(state);
      return;
    }
    case "journal":
    case "compass": {
      const canDisplay = state.parksDisplay.length > 0;
      const canDeck = state.parksDeck.length > 0;
      if (!canDisplay && !canDeck) {
        throw new Error("No parks available to reserve");
      }
      state.pendingGearActivation = { gearId, kind: gear.kind };
      state.phase = "awaiting-reserve-source";
      return;
    }
    case "flint-tinder": {
      if (!player.campfireLit) {
        player.campfireLit = true;
        state.actionLog.push({
          turn: state.turnCount,
          season: state.season,
          playerIndex: state.activePlayer,
          action: "campfire-lit",
        });
      }
      maybeEndTurn(state);
      return;
    }
    case "hiking-boots": {
      grantResource(player, "F", 1);
      maybeEndTurn(state);
      return;
    }
    case "binoculars": {
      grantResource(player, "M", 1);
      maybeEndTurn(state);
      return;
    }
    case "sunscreen": {
      grantResource(player, "S", 1);
      maybeEndTurn(state);
      return;
    }
    case "rain-gear": {
      grantWater(state, player, 1);
      if (maybeEnterWaterPlacement(state)) return;
      maybeEndTurn(state);
      return;
    }
    case "field-guide": {
      grantResource(player, "A", 1);
      maybeEndTurn(state);
      return;
    }
    case "sleeping-bag": {
      // Each card binds to one trigger; F gives +2 Sun, M relights campfire.
      if (gear.trigger === "tile-f") {
        grantResource(player, "S", 2);
      } else if (gear.trigger === "tile-m") {
        if (!player.campfireLit) {
          player.campfireLit = true;
          state.actionLog.push({
            turn: state.turnCount,
            season: state.season,
            playerIndex: state.activePlayer,
            action: "campfire-lit",
          });
        }
      }
      maybeEndTurn(state);
      return;
    }
    case "mystery-cache": {
      const face = randomChoice(TRAIL_DIE_FACES);
      applyTrailDie(state, face);
      // applyTrailDie may set awaiting-canteen-draw (face "1C"); if it did, defer end-turn.
      if (state.phase === "playing") {
        if (maybeEnterWaterPlacement(state)) return;
        maybeEndTurn(state);
      }
      return;
    }
  }
}

function handleGearPhotoPayment(state: GameState, payWith: ResourceType): void {
  const player = state.players[state.activePlayer];
  const pending = state.pendingGearActivation;
  if (!pending) throw new Error("No pending gear activation");
  if (pending.kind !== "wide-angle-lens" && pending.kind !== "telephoto-lens") {
    throw new Error(`${pending.kind} is not a photo-payment gear`);
  }
  if (player.resources[payWith] < 1) throw new Error(`Not enough ${payWith}`);
  player.resources[payWith] -= 1;
  takePhoto(state, player);
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "snap-photo",
    resource: payWith,
  });
  // Wildlife passion goal: any photo paid with Wildlife meets the goal.
  if (payWith === "A" && player.passion === "wildlife" && !player.passionGoalMet) {
    player.passionGoalMet = true;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "passion-goal-met",
      passionId: player.passion,
    });
  }
  state.pendingGearActivation = null;
  state.phase = "playing";
  fireTrigger(state, "take-photo");
  if (player.passionGoalMet && player.passionMode === null) {
    state.phase = "awaiting-passion-mode-choice";
    return;
  }
  if (maybeOfferShutterbugBonus(state)) return;
  maybeEndTurn(state);
}

function handleReservePark(
  state: GameState,
  source: "display" | "deck-top",
  parkId?: number,
): void {
  const player = state.players[state.activePlayer];
  let park: Park;
  if (source === "display") {
    if (parkId === undefined) throw new Error("parkId required for display reserve");
    const idx = state.parksDisplay.findIndex((p) => p.id === parkId);
    if (idx < 0) throw new Error(`Park ${parkId} not in display`);
    park = state.parksDisplay[idx];
    state.parksDisplay.splice(idx, 1);
    const replacement = state.parksDeck.shift();
    if (replacement) state.parksDisplay.push(replacement);
  } else {
    const top = state.parksDeck.shift();
    if (!top) throw new Error("Park deck empty");
    park = top;
  }
  player.reservedParks.push(park);
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "reserve-park",
    parkId: park.id,
    parkName: park.name,
    parkPt: park.pt,
    source: source === "display" ? "display" : "deck",
  });
  state.pendingGearActivation = null;
  state.phase = "playing";
  fireTrigger(state, "reserve");
  maybeEndTurn(state);
}

// ---------------------------------------------------------------------------
// Exchange / canteen-or-photo choices
// ---------------------------------------------------------------------------

function handleExchange(state: GameState, resource: ResourceType): void {
  const player = state.players[state.activePlayer];
  if (resource === "A") throw new Error("Cannot exchange A for A");
  if (player.resources[resource] < 1) throw new Error(`Not enough ${resource} to exchange`);
  player.resources[resource] -= 1;
  grantResource(player, "A", 1);
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "exchange",
    resource,
  });
  state.phase = "playing";
  state.pendingSiteContext = null;
  fireTrigger(state, "exchange-A");
  maybeEndTurn(state);
}

function handleCanteenChoiceCanteen(state: GameState): void {
  state.phase = "playing";
  state.pendingSiteContext = null;
  offerCanteenDraw(state);
}

function handleCanteenChoicePhoto(state: GameState, payWith: ResourceType): void {
  const player = state.players[state.activePlayer];
  if (player.resources[payWith] < 1) throw new Error(`Not enough ${payWith} to snap photo`);
  player.resources[payWith] -= 1;
  // Wildlife gear: trading 1 Wildlife yields 2 photos instead of 1.
  const wildlifeBonus =
    payWith === "A" && player.passionMode === "gear" && player.passion === "wildlife" ? 1 : 0;
  takePhoto(state, player, 1 + wildlifeBonus);
  // Wildlife passion goal: any photo paid with Wildlife meets the goal.
  if (payWith === "A" && player.passion === "wildlife" && !player.passionGoalMet) {
    player.passionGoalMet = true;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "passion-goal-met",
      passionId: player.passion,
    });
  }
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "snap-photo",
    resource: payWith,
  });
  state.phase = "playing";
  state.pendingSiteContext = null;
  fireTrigger(state, "take-photo");
  // If goal just turned met for wildlife (handled inline above), enter mode-choice.
  if (player.passionGoalMet && player.passionMode === null) {
    state.phase = "awaiting-passion-mode-choice";
    return;
  }
  if (maybeOfferShutterbugBonus(state)) return;
  maybeEndTurn(state);
}

// ---------------------------------------------------------------------------
// Shutterbug bonus photo
// ---------------------------------------------------------------------------

function handleShutterbugPhotoPay(state: GameState, payWith: ResourceType): void {
  if (state.phase !== "awaiting-shutterbug-photo") {
    throw new Error("Shutterbug bonus photo only valid in awaiting-shutterbug-photo phase");
  }
  const player = state.players[state.activePlayer];
  if (player.resources[payWith] < 1) throw new Error(`Not enough ${payWith}`);
  player.resources[payWith] -= 1;
  grantPhoto(state, player);
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "snap-photo",
    resource: payWith,
  });
  // Wildlife passion goal can still be met on a shutterbug photo paid with Wildlife.
  if (payWith === "A" && player.passion === "wildlife" && !player.passionGoalMet) {
    player.passionGoalMet = true;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "passion-goal-met",
      passionId: player.passion,
    });
  }
  state.phase = "playing";
  fireTrigger(state, "take-photo");
  if (player.passionGoalMet && player.passionMode === null) {
    state.phase = "awaiting-passion-mode-choice";
    return;
  }
  maybeEndTurn(state);
}

// ---------------------------------------------------------------------------
// Resource discard (end-of-turn cap at 12)
// ---------------------------------------------------------------------------

function handleDiscardResource(state: GameState, resource: ResourceType): void {
  if (state.phase !== "awaiting-resource-discard") {
    throw new Error("Discard only valid in awaiting-resource-discard phase");
  }
  const player = state.players[state.activePlayer];
  if (player.resources[resource] < 1) throw new Error(`No ${resource} to discard`);
  player.resources[resource] -= 1;
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "discard-resource",
    resource,
  });
  if (bagSize(player.resources) <= RESOURCE_CAP) {
    state.phase = "playing";
    finalizeTurnEnd(state);
  }
}

// ---------------------------------------------------------------------------
// Pass / turn-end
// ---------------------------------------------------------------------------

function handlePass(state: GameState): void {
  const player = state.players[state.activePlayer];

  // Special case: in awaiting-exchange or awaiting-canteen-photo, "pass" means skip the choice.
  if (
    state.phase === "awaiting-exchange" ||
    state.phase === "awaiting-canteen-exchange" ||
    state.phase === "awaiting-canteen-photo" ||
    state.phase === "awaiting-park-action" ||
    state.phase === "awaiting-shutterbug-photo"
  ) {
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "pass",
    });
    state.phase = "playing";
    state.pendingSiteContext = null;
    endActionTurn(state);
    return;
  }

  // In awaiting-gear-or-end, "pass" finalizes the turn (skip remaining gear / shop buy).
  if (state.phase === "awaiting-gear-or-end") {
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "pass",
    });
    state.phase = "playing";
    state.pendingSiteContext = null;
    endActionTurn(state);
    return;
  }

  // Normal pass — only legal when no other option (both hikers at end).
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: state.activePlayer,
    action: "pass",
  });
  if (bothHikersAtEnd(player)) {
    player.doneForSeason = true;
  }
  endActionTurn(state);
}

function endActionTurn(state: GameState): void {
  // Honor any deferred weather claim (player chose "site first" on landing-choice)
  if (state.pendingWeatherClaim) {
    const pwc = state.pendingWeatherClaim;
    state.pendingWeatherClaim = null;
    claimWeatherToken(state, pwc.position, pwc.weather);
  }
  // If the action queued water placements, resolve those before swapping turn.
  if (state.pendingWaterPlacements > 0) {
    state.phase = "playing";
    if (maybeEnterWaterPlacement(state)) return;
  }
  // End-of-turn resource cap: must discard down to RESOURCE_CAP before swapping.
  const player = state.players[state.activePlayer];
  if (bagSize(player.resources) > RESOURCE_CAP) {
    state.phase = "awaiting-resource-discard";
    return;
  }
  finalizeTurnEnd(state);
}

function finalizeTurnEnd(state: GameState): void {
  // Per-turn cleanup: clear gear triggers/uses for the outgoing player and age the gear market.
  state.players[state.activePlayer].triggeredThisTurn = [];
  state.players[state.activePlayer].usedGearThisTurn = [];
  state.pendingGearActivation = null;
  endOfTurnGearDiscard(state);

  state.turnCount += 1;
  // After each action, check if the season is complete.
  if (state.players.every((p) => p.doneForSeason || bothHikersAtEnd(p))) {
    // Mark anyone who hasn't been marked done yet
    for (const p of state.players) {
      if (bothHikersAtEnd(p)) p.doneForSeason = true;
    }
    if (state.players.every((p) => p.doneForSeason)) {
      // Advance the season
      advanceSeason(state);
      return;
    }
  }
  // Swap to next player who isn't done. If both are done, season ends.
  const nextIdx = nextActivePlayer(state);
  if (nextIdx === -1) {
    advanceSeason(state);
    return;
  }
  state.activePlayer = nextIdx;
}

function nextActivePlayer(state: GameState): number {
  const start = (state.activePlayer + 1) % 2;
  if (!state.players[start].doneForSeason) return start;
  if (!state.players[state.activePlayer].doneForSeason) return state.activePlayer;
  return -1;
}

// ---------------------------------------------------------------------------
// Season advance / game over
// ---------------------------------------------------------------------------

function advanceSeason(state: GameState): void {
  const seasonIdx = SEASONS.indexOf(state.season);
  state.actionLog.push({
    turn: state.turnCount,
    season: state.season,
    playerIndex: -1,
    action: "season-end",
  });

  // Resolve season missions BEFORE advancing season / resetting stats.
  resolveSeasonMissions(state);

  if (seasonIdx === SEASONS.length - 1) {
    // End of game — First-Player Token holder gets +1 PT.
    state.players[state.firstPlayerToken].bonusPT += 1;
    state.phase = "game-over";
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: -1,
      action: "game-end",
    });
    return;
  }

  const next = SEASONS[seasonIdx + 1];
  state.season = next;
  // Reset hikers to start, refill canteens, clear water tokens, reset doneForSeason + season stats
  for (const p of state.players) {
    p.hikers[0].position = START_POSITION;
    p.hikers[1].position = START_POSITION;
    p.doneForSeason = false;
    for (const c of p.canteens) c.used = false;
    p.waterTokens = new Array(CANTEEN_BOARD_WATER_GAPS).fill(false);
    p.seasonStats = emptySeasonStats();
    // Per-turn gear bookkeeping resets at every season boundary.
    p.triggeredThisTurn = [];
    p.usedGearThisTurn = [];
    // Campfires relight at each new season start (in 2P play).
    if (!p.campfireLit) {
      p.campfireLit = true;
      state.actionLog.push({
        turn: state.turnCount,
        season: next,
        playerIndex: p.index,
        action: "campfire-lit",
      });
    }
  }
  state.pendingGearActivation = null;
  // Generate a fresh trail and weather tokens for the new season
  state.trail = buildTrail();
  state.weatherTokens = buildWeatherTokens();
  // Re-place the Shutterbug token (cleared from any prior holder).
  state.shutterbugHolder = null;
  state.shutterbugTilePosition = pickShutterbugPosition(state.trail);
  if (state.shutterbugTilePosition !== null) {
    state.actionLog.push({
      turn: state.turnCount,
      season: next,
      playerIndex: -1,
      action: "shutterbug-placed",
      toPosition: state.shutterbugTilePosition,
    });
  }
  // Reset Trail's End row bonuses for the new season
  state.trailEndRowFirstOccupier = [null, null, null];
  // Apply season bonus
  applySeasonStartBonus(state, next);
  state.phase = "playing";
  // First-Player Token sets who plays first this season
  state.activePlayer = state.firstPlayerToken;
}

// ---------------------------------------------------------------------------
// Season missions
// ---------------------------------------------------------------------------

function missionMetric(player: PlayerState, mission: SeasonMission): number {
  switch (mission) {
    case "spring-most-f":
      return player.seasonStats.resourcesGained.F;
    case "spring-most-m":
      return player.seasonStats.resourcesGained.M;
    case "spring-most-w":
      return player.seasonStats.resourcesGained.W;
    case "spring-most-s":
      return player.seasonStats.resourcesGained.S;
    case "summer-most-cost":
      // Total resource-cost of the player's canteens (each "2W" = 2, "1F" = 1, etc).
      return player.canteens.reduce((acc, c) => acc + canteenCostWeight(c.effect), 0);
    case "summer-most-instant-parks":
      return player.seasonStats.parksWithInstantRewardVisited;
    case "summer-most-a":
      return player.seasonStats.resourcesGained.A;
    case "summer-most-canteens":
      return player.seasonStats.canteensTaken;
    case "fall-most-s":
      return player.parks.reduce((a, p) => a + p.cost.S, 0);
    case "fall-most-f":
      return player.parks.reduce((a, p) => a + p.cost.F, 0);
    case "fall-most-m":
      return player.parks.reduce((a, p) => a + p.cost.M, 0);
    case "fall-most-w":
      return player.parks.reduce((a, p) => a + p.cost.W, 0);
  }
}

function canteenCostWeight(effect: CanteenEffect): number {
  switch (effect) {
    case "2W":
    case "2S":
      return 2;
    case "1M":
    case "1F":
      return 1;
    case "exchange-A":
    case "photo":
    case "park-action":
      return 1;
  }
}

function resolveSeasonMissions(state: GameState): void {
  // Only the pre-selected mission for this season is in play.
  const mission = state.selectedSeasonMissions[state.season];
  const results: SeasonMissionResult[] = [];
  const winner = pickMissionWinner(state, mission);
  results.push({ mission, winner });
  if (winner !== -1) {
    // Bring the winner-perspective active player forward so that grant helpers
    // bookkeep into the right player's state.
    const savedActive = state.activePlayer;
    state.activePlayer = winner;
    applyMissionReward(state, mission, winner);
    state.activePlayer = savedActive;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: winner,
      action: "season-mission",
      seasonMission: mission,
    });
  }
  state.seasonMissionResults.push({ season: state.season, results });
}

function pickMissionWinner(state: GameState, mission: SeasonMission): number {
  let best = -1;
  let bestVal = 0;
  let tieAtBest = false;
  for (let i = 0; i < state.players.length; i++) {
    const v = missionMetric(state.players[i], mission);
    if (v <= 0) continue;
    if (v > bestVal) {
      best = i;
      bestVal = v;
      tieAtBest = false;
    } else if (v === bestVal) {
      tieAtBest = true;
    }
  }
  if (tieAtBest) return -1;
  return best;
}

function applyMissionReward(state: GameState, mission: SeasonMission, winnerIdx: number): void {
  const player = state.players[winnerIdx];
  switch (mission) {
    case "spring-most-f":
      // Reserve a park (stub: +2 Wildlife — full reservation system not implemented).
      grantResource(player, "A", 2);
      return;
    case "spring-most-m":
      // Free photo.
      grantPhoto(state, player);
      return;
    case "spring-most-w": {
      // Free water-token placement (auto first empty gap).
      for (let g = 0; g < CANTEEN_BOARD_WATER_GAPS; g++) {
        if (!player.waterTokens[g]) {
          player.waterTokens[g] = true;
          break;
        }
      }
      return;
    }
    case "spring-most-s": {
      // Free canteen — top of the pile (display draws would require a UI prompt).
      const eff = state.canteenPool.shift();
      if (eff) grantCanteen(state, player, eff);
      return;
    }
    case "summer-most-cost":
    case "summer-most-instant-parks":
    case "summer-most-a":
    case "summer-most-canteens": {
      // Roll the trail die ×2 — applied immediately. Both rolls go to the winner.
      const f1 = randomChoice(TRAIL_DIE_FACES);
      applyTrailDie(state, f1);
      // applyTrailDie may queue canteen draws or water placements; auto-resolve
      // both before continuing — we cannot stop and ask in the middle of season-end.
      autoCompleteCanteenDrawIfPending(state);
      autoResolveWaterPlacementsIfPending(state);
      const f2 = randomChoice(TRAIL_DIE_FACES);
      applyTrailDie(state, f2);
      autoCompleteCanteenDrawIfPending(state);
      autoResolveWaterPlacementsIfPending(state);
      return;
    }
    case "fall-most-s":
    case "fall-most-f":
    case "fall-most-m":
    case "fall-most-w":
      player.bonusPT += 3;
      return;
  }
}

/** When a season-end reward queues water placements, auto-place into useful gaps. */
function autoResolveWaterPlacementsIfPending(state: GameState): void {
  if (state.pendingWaterPlacements <= 0) return;
  const player = state.players[state.activePlayer];
  while (state.pendingWaterPlacements > 0) {
    const useful = getUsefulWaterGaps(player);
    if (useful.length === 0) {
      player.resources.W += state.pendingWaterPlacements;
      state.pendingWaterPlacements = 0;
      return;
    }
    const gap = useful[0];
    player.waterTokens[gap] = true;
    state.pendingWaterPlacements -= 1;
    state.actionLog.push({
      turn: state.turnCount,
      season: state.season,
      playerIndex: state.activePlayer,
      action: "place-water",
      waterGap: gap,
    });
  }
}

/** When a season-end reward triggers a trail-die canteen draw, auto-resolve it. */
function autoCompleteCanteenDrawIfPending(state: GameState): void {
  if (state.phase !== "awaiting-canteen-draw") return;
  const player = state.players[state.activePlayer];
  const eff = state.canteenPool.shift() ?? state.canteenDisplay.shift();
  if (eff) {
    const c = grantCanteen(state, player, eff);
    if (c) {
      state.actionLog.push({
        turn: state.turnCount,
        season: state.season,
        playerIndex: state.activePlayer,
        action: "take-canteen",
        canteenEffect: c.effect,
      });
    }
    refillCanteenDisplay(state);
  }
  state.phase = "playing";
}
