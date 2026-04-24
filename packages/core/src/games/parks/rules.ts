import type {
  Action,
  GameState,
  Park,
  PlayerState,
  ResourceBag,
  ResourceType,
  WaterGapIndex,
} from "./types";
import {
  CANTEEN_BOARD_WATER_GAPS,
  GEAR_BLIND_COST,
  GEAR_COSTS,
  GEAR_TRIGGERS,
  isAtTrailEnd,
  slotRow,
  TRAIL_END_LAST,
  WATER_GAP_TO_ROW,
} from "./types";

export function canteenIsActivated(player: PlayerState, slot: number): boolean {
  const row = slotRow(slot);
  for (let g = 0; g < CANTEEN_BOARD_WATER_GAPS; g++) {
    if (player.waterTokens[g] && WATER_GAP_TO_ROW[g as WaterGapIndex] === row) return true;
  }
  return false;
}

/**
 * "Useful" gaps for placing a freshly received water token: gaps that are empty
 * AND on a row that contains at least one canteen (otherwise the placement
 * would never activate anything). Used by the player-choice flow when water is
 * granted.
 */
export function getUsefulWaterGaps(player: PlayerState): WaterGapIndex[] {
  const gaps: WaterGapIndex[] = [];
  for (let g = 0; g < CANTEEN_BOARD_WATER_GAPS; g++) {
    const gap = g as WaterGapIndex;
    if (player.waterTokens[gap]) continue;
    const row = WATER_GAP_TO_ROW[gap];
    const hasCanteenInRow = player.canteens.some((c) => slotRow(c.slot) === row);
    if (hasCanteenInRow) gaps.push(gap);
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Active player
// ---------------------------------------------------------------------------

export function getActivePlayer(state: GameState): number {
  return state.activePlayer;
}

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------

/** Positions a hiker may move to (must be strictly forward). */
export function legalMoveTargets(state: GameState, playerIdx: number, hikerId: 0 | 1): number[] {
  const player = state.players[playerIdx];
  const hiker = player.hikers[hikerId];
  if (isAtTrailEnd(hiker.position)) return [];

  const targets: number[] = [];
  const occupied = new Set<number>();
  for (const p of state.players) {
    for (const h of p.hikers) {
      // Trail's End rows allow stacking across players (3 separate rows).
      if (!isAtTrailEnd(h.position)) occupied.add(h.position);
    }
  }

  for (let pos = hiker.position + 1; pos <= TRAIL_END_LAST; pos++) {
    // A lit campfire allows moving onto an occupied tile (and is consumed by it).
    if (occupied.has(pos) && !player.campfireLit) continue;
    targets.push(pos);
  }

  // If every other player is finished for the season, the only player still on
  // the trail must march to Trail's End — no more dawdling on midline tiles.
  const allOthersDone = state.players.every((p, i) => i === playerIdx || p.doneForSeason);
  if (allOthersDone) {
    return targets.filter((t) => isAtTrailEnd(t));
  }

  return targets;
}

export function bothHikersAtEnd(player: PlayerState): boolean {
  return isAtTrailEnd(player.hikers[0].position) && isAtTrailEnd(player.hikers[1].position);
}

// ---------------------------------------------------------------------------
// Park cost helpers
// ---------------------------------------------------------------------------

/**
 * Effective per-resource cost for a park, after applying the player's active
 * gear-effect discount (if any). Birdwatching/Forestry/Kayaking/Mountaineering
 * each shave 1 off the corresponding resource cost while in "gear" mode.
 */
export function effectiveCost(park: Park, player: PlayerState): ResourceBag {
  const c = { ...park.cost };
  if (player.passionMode !== "gear" || !player.passion) return c;
  switch (player.passion) {
    case "birdwatching":
      c.S = Math.max(0, c.S - 1);
      break;
    case "forestry":
      c.F = Math.max(0, c.F - 1);
      break;
    case "kayaking":
      c.W = Math.max(0, c.W - 1);
      break;
    case "mountaineering":
      c.M = Math.max(0, c.M - 1);
      break;
    default:
      break;
  }
  return c;
}

/** Park-with-effective-cost helper (preserves identity & refund). */
export function effectivePark(park: Park, player: PlayerState): Park {
  return { ...park, cost: effectiveCost(park, player) };
}

/** A acts as a wild for any non-A cost. Returns true if `pay` exactly satisfies `park.cost`. */
export function canAffordPayment(park: Park, pay: ResourceBag, available: ResourceBag): boolean {
  // Verify `pay` doesn't exceed available resources
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    if (pay[r] < 0) return false;
    if (pay[r] > available[r]) return false;
  }
  // Verify `pay` exactly satisfies the cost (with A as wild for the others)
  // Required: for each r in M/F/S/W: pay[r] >= cost[r]; A surplus covers shortfalls.
  const need = { ...park.cost };
  let extraA = pay.A;
  // First spend exact-color
  for (const r of ["M", "F", "S", "W"] as ResourceType[]) {
    if (pay[r] < need[r]) {
      const shortfall = need[r] - pay[r];
      if (extraA < shortfall) return false;
      extraA -= shortfall;
      need[r] = pay[r];
    }
  }
  // Direct A cost
  if (need.A > 0) {
    // The A in pay first goes to cover M/F/S/W shortfalls (above), then to A cost.
    // pay.A total minus what was spent on shortfalls must >= need.A.
    const spentOnShortfalls = pay.A - extraA;
    const remainingA = pay.A - spentOnShortfalls;
    if (remainingA < need.A) return false;
  }
  // Total payment must equal total cost (no overpaying)
  const totalPay = pay.M + pay.F + pay.S + pay.W + pay.A;
  const totalCost = park.cost.M + park.cost.F + park.cost.S + park.cost.W + park.cost.A;
  if (totalPay !== totalCost) return false;
  return true;
}

/** Returns the minimal payment that covers a park's cost using available resources, or null. */
export function tryAutoPayment(park: Park, available: ResourceBag): ResourceBag | null {
  const pay: ResourceBag = { M: 0, F: 0, S: 0, W: 0, A: 0 };
  // Pay exact M/F/S/W first
  for (const r of ["M", "F", "S", "W"] as ResourceType[]) {
    const want = park.cost[r];
    const have = available[r];
    pay[r] = Math.min(want, have);
  }
  // Cover M/F/S/W shortfalls with A
  let aLeft = available.A;
  for (const r of ["M", "F", "S", "W"] as ResourceType[]) {
    const shortfall = park.cost[r] - pay[r];
    if (shortfall > 0) {
      if (aLeft < shortfall) return null;
      aLeft -= shortfall;
      pay.A += shortfall;
    }
  }
  // Cover direct A cost
  if (park.cost.A > 0) {
    if (aLeft < park.cost.A) return null;
    aLeft -= park.cost.A;
    pay.A += park.cost.A;
  }
  return pay;
}

export function canAffordPark(park: Park, available: ResourceBag): boolean {
  return tryAutoPayment(park, available) !== null;
}

// ---------------------------------------------------------------------------
// Site interaction helpers
// ---------------------------------------------------------------------------

/** True if any of player's hikers is currently on the Parks site. */
export function hikerOnParksSite(state: GameState, playerIdx: number): boolean {
  const TRAIL_PARKS_INDEX = 4;
  for (const h of state.players[playerIdx].hikers) {
    if (h.position === TRAIL_PARKS_INDEX) return true;
  }
  return false;
}

/** True if any of player's hikers is currently on the Trading Post (shop) tile. */
export function hikerOnShopSite(state: GameState, playerIdx: number): boolean {
  for (const h of state.players[playerIdx].hikers) {
    if (h.position < 0 || h.position >= state.trail.length) continue;
    if (state.trail[h.position] === "shop") return true;
  }
  return false;
}

function playerHasAnyResource(player: PlayerState): boolean {
  return (
    player.resources.M > 0 ||
    player.resources.F > 0 ||
    player.resources.S > 0 ||
    player.resources.W > 0 ||
    player.resources.A > 0
  );
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export function getLegalActions(state: GameState, playerIdx: number): Action[] {
  if (state.phase === "game-over" || state.phase === "season-end") return [];
  if (state.activePlayer !== playerIdx) return [];

  const player = state.players[playerIdx];
  const actions: Action[] = [];

  // Initial pick-your-passion phase
  if (state.phase === "awaiting-passion-choice") {
    for (const opt of player.passionOptions) {
      actions.push({ type: "choose-passion", passionId: opt });
    }
    return actions;
  }

  // Goal just met — pick gear effect or end-game bonus.
  if (state.phase === "awaiting-passion-mode-choice") {
    actions.push({ type: "passion-mode-choice", mode: "gear" });
    actions.push({ type: "passion-mode-choice", mode: "end-bonus" });
    return actions;
  }

  // Hiker just landed on a tile with both a weather token and a site effect.
  // Player picks which to resolve first.
  if (state.phase === "awaiting-landing-choice") {
    actions.push({ type: "landing-choice", first: "weather" });
    actions.push({ type: "landing-choice", first: "site" });
    return actions;
  }

  // Player must pick a canteen to draw (face-up shop or hidden pile).
  if (state.phase === "awaiting-canteen-draw") {
    for (let i = 0; i < state.canteenDisplay.length; i++) {
      actions.push({ type: "draw-canteen", source: "display", displayIndex: i });
    }
    if (state.canteenPool.length > 0) {
      actions.push({ type: "draw-canteen", source: "pile" });
    }
    return actions;
  }

  // Player drew a canteen and must pick which row of the canteen board to place it.
  if (state.phase === "awaiting-canteen-row-choice") {
    const used = new Set(player.canteens.map((c) => c.slot));
    for (const row of [0, 1, 2] as const) {
      if (!used.has(row * 2) || !used.has(row * 2 + 1)) {
        actions.push({ type: "place-canteen-row", row });
      }
    }
    return actions;
  }

  // Awaiting follow-up choices from a triggered site/canteen
  if (state.phase === "awaiting-exchange" || state.phase === "awaiting-canteen-exchange") {
    // Must spend one M/F/S/W to gain 1A; or pass on the exchange (skip)
    for (const r of ["M", "F", "S", "W"] as Exclude<ResourceType, "A">[]) {
      if (player.resources[r] >= 1) {
        actions.push({ type: "exchange-resource", resource: r });
      }
    }
    actions.push({ type: "pass" });
    return actions;
  }

  if (state.phase === "awaiting-canteen-or-photo") {
    actions.push({ type: "canteen-or-photo-choice", choice: "canteen" });
    for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
      if (player.resources[r] >= 1) {
        actions.push({
          type: "canteen-or-photo-choice",
          choice: "photo",
          payWith: r as Exclude<ResourceType, "A"> | "A",
        });
      }
    }
    return actions;
  }

  if (state.phase === "awaiting-canteen-photo") {
    for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
      if (player.resources[r] >= 1) {
        actions.push({
          type: "canteen-or-photo-choice",
          choice: "photo",
          payWith: r as Exclude<ResourceType, "A"> | "A",
        });
      }
    }
    actions.push({ type: "pass" });
    return actions;
  }

  // Player has freshly received Water and must decide where each unit goes.
  if (state.phase === "awaiting-water-placement") {
    for (const gap of getUsefulWaterGaps(player)) {
      actions.push({ type: "place-or-keep-water", placement: gap });
    }
    actions.push({ type: "place-or-keep-water", placement: "keep" });
    return actions;
  }

  // Awaiting gear-or-end: activate any activatable gear, optionally buy gear at the
  // shop tile, and pass to finalize the turn.
  if (state.phase === "awaiting-gear-or-end") {
    for (const g of player.gear) {
      if (player.usedGearThisTurn.includes(g.id)) continue;
      const triggers = GEAR_TRIGGERS[g.kind];
      if (!triggers.some((t) => player.triggeredThisTurn.includes(t))) continue;
      // Wide-angle / Telephoto need a resource to spend on the photo.
      if (
        (g.kind === "wide-angle-lens" || g.kind === "telephoto-lens") &&
        !playerHasAnyResource(player)
      ) {
        continue;
      }
      // Journal / Compass need a park to reserve from.
      if (
        (g.kind === "journal" || g.kind === "compass") &&
        state.parksDisplay.length === 0 &&
        state.parksDeck.length === 0
      ) {
        continue;
      }
      actions.push({ type: "activate-gear", gearId: g.id });
    }
    // Buying gear is only available when the player has just landed on a shop —
    // either the trail "shop" tile, or Trail's End row R3 (Shop Action).
    const shopAccess =
      state.pendingSiteContext &&
      ((state.pendingSiteContext.source === "site" && hikerOnShopSite(state, playerIdx)) ||
        (state.pendingSiteContext.source === "trail-end" &&
          state.pendingSiteContext.trailEndRow === 2));
    if (shopAccess) {
      for (let i = 0; i < state.gearMarket.visible.length; i++) {
        const card = state.gearMarket.visible[i];
        if (player.resources.S >= GEAR_COSTS[card.kind]) {
          actions.push({ type: "buy-gear", source: "display", index: i });
        }
      }
      const deckHasCard = state.gearMarket.deck.length > 0 || state.gearMarket.discard.length > 0;
      if (deckHasCard && player.resources.S >= GEAR_BLIND_COST) {
        actions.push({ type: "buy-gear", source: "deck-blind" });
      }
    }
    actions.push({ type: "pass" });
    return actions;
  }

  // Pay for a gear-triggered photo (Wide-Angle / Telephoto Lens).
  if (state.phase === "awaiting-gear-photo-payment") {
    for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
      if (player.resources[r] >= 1) {
        actions.push({ type: "gear-photo-payment", payWith: r });
      }
    }
    return actions;
  }

  // Pick reserve source for Journal / Compass.
  if (state.phase === "awaiting-reserve-source") {
    for (const park of state.parksDisplay) {
      actions.push({ type: "reserve-park", source: "display", parkId: park.id });
    }
    if (state.parksDeck.length > 0) {
      actions.push({ type: "reserve-park", source: "deck-top" });
    }
    return actions;
  }

  // Triggered Park Action (canteen "park-action" effect, or Trail's End row 1) —
  // buy OR reserve one park, then pass to end the action.
  if (state.phase === "awaiting-park-action") {
    for (const park of state.parksDisplay) {
      const eff = effectivePark(park, player);
      if (canAffordPark(eff, player.resources)) {
        const pay = tryAutoPayment(eff, player.resources);
        if (pay) actions.push({ type: "buy-park", parkId: park.id, pay });
      }
    }
    for (const park of player.reservedParks) {
      const eff = effectivePark(park, player);
      if (canAffordPark(eff, player.resources)) {
        const pay = tryAutoPayment(eff, player.resources);
        if (pay) actions.push({ type: "buy-park-reserved", parkId: park.id, pay });
      }
    }
    for (const park of state.parksDisplay) {
      actions.push({ type: "reserve-park", source: "display", parkId: park.id });
    }
    if (state.parksDeck.length > 0) {
      actions.push({ type: "reserve-park", source: "deck-top" });
    }
    actions.push({ type: "pass" });
    return actions;
  }

  // Shutterbug bonus: pay 1 resource for an extra photo, or skip.
  if (state.phase === "awaiting-shutterbug-photo") {
    for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
      if (player.resources[r] >= 1) {
        actions.push({ type: "shutterbug-photo-pay", payWith: r });
      }
    }
    actions.push({ type: "pass" });
    return actions;
  }

  // End-of-turn discard: must trim resources down to the cap before swapping.
  if (state.phase === "awaiting-resource-discard") {
    for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
      if (player.resources[r] >= 1) {
        actions.push({ type: "discard-resource", resource: r });
      }
    }
    return actions;
  }

  // Normal "playing" phase: move hikers, use canteens, buy parks, pass.
  if (state.phase === "playing") {
    if (player.doneForSeason) {
      actions.push({ type: "pass" });
      return actions;
    }

    // Move actions
    for (const h of player.hikers) {
      const targets = legalMoveTargets(state, playerIdx, h.id);
      for (const t of targets) {
        actions.push({ type: "move", hikerId: h.id, targetPosition: t });
      }
    }

    // Use canteen actions — canteen must be unused AND in an activated row
    for (const c of player.canteens) {
      if (!c.used && canteenIsActivated(player, c.slot)) {
        actions.push({ type: "use-canteen", canteenId: c.id });
      }
    }

    // Buy park if any hiker is on the Parks site, and player can afford one.
    // Cost is the discounted "effective" cost based on the player's gear effect.
    if (hikerOnParksSite(state, playerIdx)) {
      for (const park of state.parksDisplay) {
        const eff = effectivePark(park, player);
        if (canAffordPark(eff, player.resources)) {
          const pay = tryAutoPayment(eff, player.resources);
          if (pay) actions.push({ type: "buy-park", parkId: park.id, pay });
        }
      }
      // Reserved parks are available to this player only.
      for (const park of player.reservedParks) {
        const eff = effectivePark(park, player);
        if (canAffordPark(eff, player.resources)) {
          const pay = tryAutoPayment(eff, player.resources);
          if (pay) actions.push({ type: "buy-park-reserved", parkId: park.id, pay });
        }
      }
    }

    // Pass: only legal when no movement is possible (both hikers at end)
    if (bothHikersAtEnd(player)) {
      actions.push({ type: "pass" });
    }

    // If we somehow have no actions (deadlock), allow pass
    if (actions.length === 0) actions.push({ type: "pass" });
  }

  return actions;
}
