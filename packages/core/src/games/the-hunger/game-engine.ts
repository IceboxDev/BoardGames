// ---------------------------------------------------------------------------
// State transitions. `applyActionPure` clones, applies one legal action, and
// runs every automatic step that follows (end of turn, next Vampire, the
// round's upkeep, sunrise) until someone has a decision to make.
// ---------------------------------------------------------------------------

import { matchLegalAction } from "../../machines/action-validation";
import { boardForMode, confuseDestination, orderKey, pushDestinations } from "./board";
import { BONUS_TOKENS, bonusDef } from "./content/bonus-tokens";
import {
  cardDef,
  expand,
  expandByRookie,
  HUNT_CARDS,
  passivesOf,
  ROSES,
  STARTING,
  VAMPIRES,
} from "./content/cards";
import { MISSIONS, missionDef } from "./content/missions";
import {
  cardsWith,
  closerCount,
  currentSpace,
  digestCategoryOf,
  digestibleAny,
  drawCount,
  getLegalActions,
  graph,
  handSpeed,
  hasHuman,
  hasKeyword,
  humansBonusVp,
  huntCost,
  huntsLeft,
  isReturned,
  passiveCount,
  passivesIn,
  playAreaSpeed,
} from "./rules";
import { RULINGS } from "./rulings";
import { computeResult } from "./scoring";
import type {
  Action,
  AIStrategyId,
  CardId,
  CryptRegion,
  GameOptions,
  GameState,
  PlayerState,
  TurnState,
} from "./types";

export const TURNS = 15;

const CASTLE_TILES: Record<number, number[]> = {
  2: [10, 6],
  3: [10, 6, 4],
  4: [10, 8, 6, 4],
  5: [10, 8, 6, 4, 2],
  6: [10, 8, 6, 4, 2],
};

const CRYPT_SIZES: Record<CryptRegion, number> = { mountains: 6, plains: 5, forest: 4 };

// ---------------------------------------------------------------------------
// Randomness (serialisable: the Mulberry32 state lives in GameState.rng)
// ---------------------------------------------------------------------------

function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(state.rng ^ (state.rng >>> 15), 1 | state.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

function shuffleState<T>(state: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface SetupInput {
  playerCount: number;
  strategies: (AIStrategyId | null)[];
  seed: number;
  options?: Partial<Pick<GameOptions, "mode" | "beginnerSafeMountains">>;
  /** Tests only: play on the fixed test layout instead of a printed side. */
  board?: "test";
}

export function createInitialState(input: SetupInput): GameState {
  const n = input.playerCount;
  if (!Number.isInteger(n) || n < 2 || n > VAMPIRES.length) {
    throw new Error(`The Hunger seats 2–6, not ${n}`);
  }
  // Options arrive from a lobby: anything but the two known values is ignored.
  const mode = input.options?.mode === "rookie" ? "rookie" : "elder";
  const options: GameOptions = {
    mode,
    board: input.board === "test" ? "test" : boardForMode(mode),
    beginnerSafeMountains: input.options?.beginnerSafeMountains === true,
  };
  const state: GameState = {
    seed: input.seed,
    rng: input.seed | 0,
    options,
    setupOffers: [],
    turn: 1,
    phase: "setup",
    players: [],
    order: [],
    current: null,
    track: [],
    huntDeck: [],
    tavern: [],
    roses: expand(ROSES),
    chests: {},
    crypts: { mountains: [], plains: [], forest: [] },
    publicMissions: [],
    castleTiles: [...CASTLE_TILES[n]],
    castleArrivals: 0,
    placeCounter: 0,
    log: [],
    result: null,
  };
  const g = graph(state);

  // Hunt deck. The END of the array is the top.
  if (options.mode === "rookie") {
    // A cards are marked per copy (one of two Hypnosis is A, the other not).
    const split = expandByRookie(HUNT_CARDS);
    const rookieCards = shuffleState(state, split.a);
    const aside = rookieCards.splice(0, 2 + 2 * n);
    const rest = shuffleState(state, [...rookieCards, ...split.rest]);
    state.huntDeck = [...rest, ...aside];
  } else {
    state.huntDeck = shuffleState(state, expand(HUNT_CARDS));
  }

  // Chests: one face-down token each; the rest go back unseen.
  const tokens = shuffleState(state, expand(BONUS_TOKENS));
  for (const s of g.def.spaces) {
    if (s.effect === "chest" || s.effect === "chest-open")
      state.chests[s.id] = tokens.pop() ?? null;
  }

  // Tavern: Rookie draws from the bottom, so the set-aside A cards stay on top.
  for (let i = 0; i < 3; i++) {
    const card = options.mode === "rookie" ? state.huntDeck.shift() : state.huntDeck.pop();
    if (card) state.tavern.push(card);
  }

  // Missions.
  const pool = MISSIONS.filter((m) => n >= 5 || !m.fivePlus);
  const publicPool = shuffleState(
    state,
    pool.filter((m) => m.standard && (options.mode === "elder" || m.whiteTitle)).map((m) => m.id),
  );
  state.publicMissions = publicPool.slice(0, 2);
  const rest = shuffleState(
    state,
    pool.map((m) => m.id).filter((id) => !state.publicMissions.includes(id)),
  );
  for (let p = 0; p < n; p++) state.setupOffers.push(rest.splice(0, 2));
  for (const region of ["mountains", "plains", "forest"] as const) {
    state.crypts[region] = rest.splice(0, CRYPT_SIZES[region]);
  }

  // Vampires.
  for (let p = 0; p < n; p++) {
    const strategy = input.strategies[p] ?? null;
    const deck = shuffleState(state, expand(STARTING, `${p}-`));
    state.players.push({
      index: p,
      type: strategy ? "ai" : "human",
      aiStrategy: strategy ?? undefined,
      vampire: p,
      deck,
      hand: [],
      playArea: [],
      discard: [],
      digested: [],
      missions: [],
      usedMissions: [],
      bonus: [],
      pos: g.castle,
      placedAt: 0,
      resting: false,
      vp: 0,
      castleTile: null,
      castleOrder: null,
      hunted: 0,
      parasolTurnUsed: false,
    });
  }
  for (const p of state.players) drawCards(state, p, 3);

  // Turn 1: lowest hand Speed first; tokens stacked on the Castle, first on top.
  const firstOrder = [...state.players]
    .sort((a, b) => handSpeed(a.hand) - handSpeed(b.hand) || a.index - b.index)
    .map((p) => p.index);
  firstOrder
    .slice()
    .reverse()
    .forEach((seat) => {
      state.players[seat].placedAt = ++state.placeCounter;
    });

  // Hunt Track: one row more than the players.
  state.track = Array.from({ length: n + 1 }, () => [[], [], []]);
  refillTrack(state);

  beginSetupPick(state);
  return state;
}

function beginSetupPick(state: GameState): void {
  const seat = state.setupOffers.findIndex((o) => o.length > 0);
  if (seat === -1) {
    state.phase = "play";
    beginRound(state);
    return;
  }
  state.current = {
    ...freshTurn(seat),
    step: "missions",
    missionPick: { source: null, offered: [...state.setupOffers[seat]], keep: 1 },
  };
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function drawOne(state: GameState, p: PlayerState): CardId | null {
  if (p.deck.length === 0) {
    if (p.discard.length === 0) return null;
    p.deck = shuffleState(state, p.discard);
    p.discard = [];
  }
  return p.deck.pop() ?? null;
}

function drawCards(state: GameState, p: PlayerState, count: number): void {
  for (let i = 0; i < count; i++) {
    const card = drawOne(state, p);
    if (card) p.hand.push(card);
  }
}

function drawToPlay(state: GameState, p: PlayerState): CardId | null {
  const card = drawOne(state, p);
  if (card) p.playArea.push({ id: card, resolved: false });
  return card;
}

function removeFromPlay(p: PlayerState, id: CardId): void {
  const i = p.playArea.findIndex((c) => c.id === id);
  if (i === -1) throw new Error(`${id} is not in the playing area`);
  p.playArea.splice(i, 1);
}

function refillTrack(state: GameState): void {
  for (const row of state.track) {
    const card = state.huntDeck.pop();
    if (!card) return;
    row[cardDef(card).keywords.includes("slow") ? 1 : 2].push(card);
  }
}

// ---------------------------------------------------------------------------
// Rounds and turns
// ---------------------------------------------------------------------------

function freshTurn(player: number): TurnState {
  return {
    player,
    step: "manipulate",
    stage: 1,
    bonusSpeed: 0,
    speed: 0,
    speedLeft: 0,
    moved: false,
    spaceUsed: false,
    hunts: 0,
    extraHunts: 0,
    col1Hunts: 0,
    col1Used: 0,
    huntedHumans: [],
    trackHunts: [],
    touched: false,
    nannyQueue: [],
    pushQueue: [],
    readyQueue: [],
    missionPick: null,
    pendingInspire: 0,
    pendingDigest: 0,
    digestCategory: null,
    confused: false,
    extraTurn: false,
  };
}

export function turnOrder(state: GameState, seats: readonly number[]): number[] {
  const g = graph(state);
  return [...seats].sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    const ka = orderKey(g, pa.pos);
    const kb = orderKey(g, pb.pos);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return pb.placedAt - pa.placedAt;
  });
}

function beginRound(state: GameState): void {
  const seats = state.players.map((p) => p.index);
  state.order = turnOrder(state, seats);
  state.log.push({ t: "turn", turn: state.turn, order: [...state.order] });
  nextTurn(state);
}

function nextTurn(state: GameState): void {
  const seat = state.order.shift();
  if (seat === undefined) {
    prepareNextTurn(state);
    return;
  }
  startTurn(state, seat);
}

/** Exported for tests: begin `seat`'s turn from its current hand. */
export function startTurn(state: GameState, seat: number): void {
  const p = state.players[seat];
  const turn = freshTurn(seat);
  turn.extraTurn = state.turn > TURNS;
  state.current = turn;
  for (const card of p.playArea) {
    card.resolved = false;
    card.used = 0;
  }
  for (const id of p.hand) p.playArea.push({ id, resolved: false });
  p.hand = [];

  if (RULINGS.castleTurnsAutoResolve && isReturned(p)) {
    endTurn(state);
    return;
  }
  settleManipulation(state);
}

/** Skip step 1 when it offers nothing but "done". */
function settleManipulation(state: GameState): void {
  const turn = state.current;
  if (!turn || turn.step !== "manipulate") return;
  const legal = getLegalActions(state, turn.player);
  if (legal.length === 1 && legal[0].type === "end-manipulation") enterMove(state);
}

function enterMove(state: GameState): void {
  const turn = state.current;
  if (!turn) return;
  const p = state.players[turn.player];
  const g = graph(state);

  // Confuse: before Speed, never cumulative, no space effect, no push.
  if (hasKeyword(p.playArea, "confuse") && !(RULINGS.castleIgnoresConfuse && isReturned(p))) {
    const to = confuseDestination(g, p.pos);
    if (to !== p.pos) {
      p.pos = to;
      p.placedAt = ++state.placeCounter;
      turn.confused = true;
      state.log.push({ t: "confuse", p: p.index, to });
    }
  }

  turn.stage = 2;
  turn.speed = playAreaSpeed(p.playArea) + turn.bonusSpeed;
  const lockjaw = humansBonusVp(p.playArea);
  if (lockjaw > 0) {
    p.vp += lockjaw;
    state.log.push({
      t: "familiar",
      p: p.index,
      card: cardsWith(p.playArea, "humans-bonus")[0],
      vp: lockjaw,
    });
  }
  turn.speedLeft = Math.max(0, turn.speed);
  turn.extraHunts += passiveCount(p.playArea, "extra-hunt");
  turn.step = turn.speed > 0 && !isReturned(p) ? "move" : "act";
  if (turn.step === "act") onArrive(state);
}

/** After movement: Well hunts, then the pushes and pending choices. */
function onArrive(state: GameState): void {
  const turn = state.current;
  if (!turn) return;
  const p = state.players[turn.player];
  const g = graph(state);
  if (g.wells.has(p.pos) && turn.speed > 0) {
    turn.col1Hunts += 1;
    // Kutya: extra Speed to hunt with on a Well.
    const bonus = passivesIn(p.playArea, "well-speed").reduce((sum, e) => sum + e.n, 0);
    turn.speedLeft += bonus;
  }
  settle(state);
}

/** Route to the next pending choice, else back to the turn's main step. */
function settle(state: GameState): void {
  const turn = state.current;
  if (!turn) return;
  const p = state.players[turn.player];
  if (turn.nannyQueue.length > 0) turn.step = "nanny";
  else if (turn.pushQueue.length > 0) turn.step = "push";
  else if (turn.readyQueue.length > 0) turn.step = "ready";
  else if (turn.pendingDigest > 0 && digestibleAny(p).length > 0) turn.step = "digest";
  else if (turn.missionPick) turn.step = "missions";
  else if (turn.pendingInspire > 0 && hasMissionStack(state)) turn.step = "inspire";
  else {
    turn.pendingInspire = 0;
    if (turn.stage === 1) {
      turn.step = "manipulate";
      settleManipulation(state);
    } else turn.step = "act";
  }
}

function hasMissionStack(state: GameState): boolean {
  return Object.values(state.crypts).some((s) => s.length > 0);
}

function arriveCastle(state: GameState, p: PlayerState): void {
  if (isReturned(p) || p.pos !== graph(state).castle) return;
  const tile = state.castleTiles.shift() ?? 0;
  p.castleTile = tile;
  p.castleOrder = ++state.castleArrivals;
  p.vp += tile;
  state.log.push({ t: "castle", p: p.index, tile });
}

function endTurn(state: GameState): void {
  const turn = state.current;
  if (!turn) return;
  const p = state.players[turn.player];
  const g = graph(state);
  p.resting = true;

  const carrySpicy = !g.wells.has(p.pos);
  let endVp = 0;
  const keep: typeof p.playArea = [];
  for (const card of p.playArea) {
    const def = cardDef(card.id);
    for (const passive of passivesOf(def)) {
      const hunted = turn.hunts > 0;
      if (passive.kind === "end-turn-vp") {
        if (
          passive.when === "always" ||
          (passive.when === "hunted" && hunted) ||
          (passive.when === "not-hunted" && !hunted)
        ) {
          endVp += passive.n;
        }
      }
      if (passive.kind === "human-hunt-vp" && turn.huntedHumans.length > 0) endVp += passive.n;
    }
    // Spicy Humans are Permanent until the turn ends on a Well.
    if (def.keywords.includes("spicy")) {
      if (carrySpicy) keep.push({ id: card.id, resolved: false, carried: true });
      else p.discard.push(card.id);
    } else if (def.keywords.includes("permanent")) keep.push({ id: card.id, resolved: false });
    else p.discard.push(card.id);
  }
  p.playArea = keep;
  p.vp += endVp;
  drawCards(state, p, 3);
  if (turn.extraTurn) p.parasolTurnUsed = true;
  state.log.push({ t: "end-turn", p: p.index, vp: endVp });
  state.current = null;
  nextTurn(state);
}

function prepareNextTurn(state: GameState): void {
  if (state.turn >= TURNS) {
    if (state.turn === TURNS) {
      const parasols = state.players
        .filter(
          (p) =>
            !isReturned(p) &&
            !p.parasolTurnUsed &&
            p.bonus.some((b) => bonusDef(b.id).bonus.kind === "parasol"),
        )
        .map((p) => p.index);
      if (parasols.length > 0) {
        state.turn = TURNS + 1;
        for (const p of state.players) p.resting = false;
        state.order = turnOrder(state, parasols);
        state.log.push({ t: "turn", turn: state.turn, order: [...state.order] });
        nextTurn(state);
        return;
      }
    }
    finishGame(state);
    return;
  }

  state.turn += 1;
  for (const p of state.players) p.resting = false;
  // Shift right: column 1 accumulates, column 2 → 1, column 3 → 2.
  for (const row of state.track) {
    row[0] = [...row[0], ...row[1]];
    row[1] = row[2];
    row[2] = [];
  }
  if (state.turn < TURNS) refillTrack(state);
  const tavernSpace = graph(state).def.spaces.find((s) => s.effect === "tavern");
  const tavernBusy = state.players.some((p) => p.pos === tavernSpace?.id);
  if (!tavernBusy && state.tavern.length < 3) {
    const card = state.huntDeck.pop();
    if (card) state.tavern.push(card);
  }
  beginRound(state);
}

function finishGame(state: GameState): void {
  state.current = null;
  state.order = [];
  state.phase = "game-over";
  state.result = computeResult(state);
}

// ---------------------------------------------------------------------------
// Hunting
// ---------------------------------------------------------------------------

function scoreCard(state: GameState, p: PlayerState, turn: TurnState, card: CardId): number {
  const def = cardDef(card);
  let vp = def.vp;
  if (def.type === "human" && def.category) {
    const region = currentSpace(state, p).region;
    if (region === "plains") vp += 1;
    if (region === "forest") vp += 2;
    vp += passivesIn(p.playArea, "hunt-vp-per-human").reduce((sum, e) => sum + e.n, 0);
    if (def.huntBonus?.region === region) vp += def.huntBonus.vp;
    turn.huntedHumans.push({ category: def.category, region });
  }
  return vp;
}

function gain(p: PlayerState, turn: TurnState, card: CardId): void {
  const def = cardDef(card);
  p.hunted += 1;
  if (def.keywords.includes("ready")) turn.readyQueue.push(card);
  else p.discard.push(card);
  if (def.keywords.includes("inspiring")) turn.pendingInspire += 1;
  if (def.onHunt?.kind === "digest-any") turn.pendingDigest += 1;
}

function huntCards(
  state: GameState,
  source: "track" | "tavern" | "rose",
  cards: CardId[],
  col?: number,
): void {
  const turn = state.current;
  if (!turn) return;
  const p = state.players[turn.player];
  let vp = 0;
  const gained = [...cards];
  for (const card of cards) {
    vp += scoreCard(state, p, turn, card);
    gain(p, turn, card);
    // Gregarious: the top Hunt card joins the hunt.
    if (cardDef(card).keywords.includes("gregarious")) {
      const extra = state.huntDeck.pop();
      if (extra) {
        const extraVp = scoreCard(state, p, turn, extra);
        vp += extraVp;
        gain(p, turn, extra);
        gained.push(extra);
        state.log.push({
          t: "hunt",
          p: p.index,
          source: "gregarious",
          cards: [extra],
          vp: extraVp,
        });
      }
    }
  }
  p.vp += vp;
  if (source === "track" && col !== undefined) {
    turn.trackHunts.push({
      col: col - 1,
      region: currentSpace(state, p).region,
      human: cards.some((id) => cardDef(id).type === "human"),
    });
  }
  state.log.push({ t: "hunt", p: p.index, source, cards, vp, col });
}

function afterHunt(state: GameState, turn: TurnState, cost: number, col1: boolean): void {
  turn.hunts += 1;
  if (col1) turn.col1Used += 1;
  turn.speedLeft -= cost;
  const left = huntsLeft(turn);
  if (!RULINGS.speedKeptForExtraHunts || left.general + left.col1 === 0) turn.speedLeft = 0;
  settle(state);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function applyInPlace(state: GameState, player: number, action: Action): void {
  const turn = state.current;
  if (!turn) throw new Error("No turn in progress");
  const p = state.players[player];
  const g = graph(state);

  switch (action.type) {
    case "resolve": {
      const card = p.playArea.find((c) => c.id === action.card);
      const m = card && cardDef(card.id).manipulation;
      if (!card || !m) throw new Error("Nothing to resolve");
      const human = hasHuman(p.playArea);
      card.resolved = true;
      card.used = (card.used ?? 0) + 1;
      turn.touched = true;
      let drew = 0;
      if (m.kind === "draw") {
        const n = drawCount(m, human);
        for (let i = 0; i < n; i++) if (drawToPlay(state, p)) drew++;
      } else if (action.discard) {
        removeFromPlay(p, action.discard);
        p.discard.push(action.discard);
        if (drawToPlay(state, p)) drew++;
      }
      state.log.push({
        t: "resolve",
        p: player,
        card: action.card,
        drew,
        discarded: action.discard,
      });
      settleManipulation(state);
      return;
    }
    case "use-bonus": {
      const token = p.bonus.find((b) => b.id === action.token && !b.used);
      if (!token) throw new Error("No such token");
      token.used = true;
      turn.touched = true;
      const b = bonusDef(token.id).bonus;
      if (b.kind === "speed") turn.bonusSpeed += b.n;
      else if (b.kind === "extra-hunt") turn.extraHunts += 1;
      else if (b.kind === "draw-to-play") drawToPlay(state, p);
      else if (b.kind === "discard-draw" && action.discard) {
        removeFromPlay(p, action.discard);
        p.discard.push(action.discard);
        drawToPlay(state, p);
      } else if (b.kind === "mission") turn.pendingInspire += 1;
      state.log.push({ t: "bonus", p: player, bonus: token.id });
      settle(state);
      return;
    }
    case "end-manipulation":
      enterMove(state);
      return;
    case "move":
    case "mist": {
      const from = p.pos;
      const spent = action.type === "move" ? action.spent : 0;
      p.pos = action.to;
      p.placedAt = ++state.placeCounter;
      turn.moved = true;
      turn.speedLeft -= spent;
      state.log.push({ t: "move", p: player, from, to: action.to, spent });
      arriveCastle(state, p);
      // Nobody is pushed out of the Castle or a Cemetery (the region, whatever the space shows).
      const landed = currentSpace(state, p);
      if (landed.effect !== "castle" && landed.region !== "cemetery") {
        turn.pushQueue = state.players
          .filter((o) => o.index !== player && o.pos === p.pos)
          .sort((a, b) => b.placedAt - a.placedAt)
          .map((o) => o.index);
        if (pushDestinations(g, p.pos).length === 0) turn.pushQueue = [];
      }
      turn.step = "act";
      onArrive(state);
      return;
    }
    case "stay":
      // Chop: not moving earns one more Hunt.
      turn.extraHunts += passiveCount(p.playArea, "stay-extra-hunt");
      turn.step = "act";
      onArrive(state);
      return;
    case "push": {
      const victim = turn.pushQueue.shift();
      if (victim === undefined) throw new Error("Nobody to push");
      if (action.to) {
        const v = state.players[victim];
        v.pos = action.to;
        v.placedAt = ++state.placeCounter;
        state.log.push({ t: "push", p: player, victim, to: action.to });
        nannyTax(state, p, turn, v);
      }
      settle(state);
      return;
    }
    case "discard-permanent": {
      // The pushed Vampire (the active decider here) gives up a Permanent.
      turn.nannyQueue.shift();
      removeFromPlay(p, action.card);
      p.discard.push(action.card);
      state.log.push({ t: "nanny", p: player, card: action.card });
      settle(state);
      return;
    }
    case "familiar":
      applyFamiliar(state, p, turn, action);
      return;
    case "hypnosis": {
      const card = p.playArea.find((c) => c.id === action.card);
      if (!card) throw new Error("No Hypnosis in play");
      card.resolved = true;
      turn.touched = true;
      for (const row of state.track) {
        for (let c = 0; c < row.length; c++) row[c] = row[c].filter((id) => id !== action.pick);
      }
      state.track[action.row][action.col].push(action.pick);
      state.log.push({
        t: "hypnosis",
        p: player,
        card: action.pick,
        row: action.row,
        col: action.col,
      });
      settle(state);
      return;
    }
    case "space": {
      const here = currentSpace(state, p);
      turn.spaceUsed = true;
      if (here.effect === "chest" || here.effect === "chest-open") {
        takeBonus(state, p, here.id);
      } else if (here.effect === "crypt") {
        openCrypt(state, p, turn, here.region as CryptRegion);
      } else {
        const category = digestCategoryOf(here.effect);
        if (!category) throw new Error("This space has no effect");
        turn.digestCategory = category;
        turn.step = "digest";
        return;
      }
      settle(state);
      return;
    }
    case "digest": {
      if (action.card) {
        const inPlay = p.playArea.findIndex((c) => c.id === action.card);
        if (inPlay !== -1) p.playArea.splice(inPlay, 1);
        else p.discard.splice(p.discard.indexOf(action.card), 1);
        p.digested.push(action.card);
        state.log.push({ t: "digest", p: player, card: action.card });
      }
      // A building's Digest names a type; a hunted Zephania / Angus / Peter does not.
      if (turn.digestCategory) turn.digestCategory = null;
      else turn.pendingDigest = Math.max(0, turn.pendingDigest - 1);
      settle(state);
      return;
    }
    case "inspire": {
      turn.pendingInspire = Math.max(0, turn.pendingInspire - 1);
      openCrypt(state, p, turn, action.stack);
      settle(state);
      return;
    }
    case "keep-missions": {
      const pick = turn.missionPick;
      if (!pick) throw new Error("No missions to keep");
      const kept = [...action.keep];
      if (pick.source === null) {
        // Setup: the other tile goes back to the box unseen.
        p.missions = kept;
        state.setupOffers[player] = [];
        state.log.push({ t: "missions", p: player, source: "setup", kept: kept.length });
        state.current = null;
        beginSetupPick(state);
        return;
      }
      // Sova / Bagoly: VP for every Mission tile newly gained.
      const gained = kept.filter((m) => !p.missions.includes(m)).length;
      const sova = passivesIn(p.playArea, "vp-per-mission").reduce((sum, e) => sum + e.n, 0);
      if (gained > 0 && sova > 0) {
        p.vp += gained * sova;
        const card = cardsWith(p.playArea, "vp-per-mission")[0];
        state.log.push({ t: "familiar", p: player, card, vp: gained * sova });
      }
      if (state.options.mode === "rookie") {
        p.missions.push(...kept);
        state.crypts[pick.source] = pick.offered.filter((m) => !kept.includes(m));
      } else {
        const returned = [...p.missions, ...pick.offered].filter((m) => !kept.includes(m));
        p.missions = kept;
        state.crypts[pick.source] = returned;
      }
      state.log.push({ t: "missions", p: player, source: pick.source, kept: kept.length });
      turn.missionPick = null;
      settle(state);
      return;
    }
    case "hunt": {
      const pile = state.track[action.row][action.col];
      const cost = huntCost(pile, action.col);
      const left = huntsLeft(turn);
      const col1 = action.col === 0 && left.col1 > 0;
      state.track[action.row][action.col] = [];
      huntCards(state, "track", pile, action.col + 1);
      afterHunt(state, turn, cost, col1);
      return;
    }
    case "hunt-tavern": {
      const cards = state.tavern;
      state.tavern = [];
      turn.spaceUsed = true;
      huntCards(state, "tavern", cards);
      afterHunt(state, turn, 2, false);
      return;
    }
    case "hunt-rose": {
      state.roses = state.roses.filter((r) => r !== action.card);
      turn.spaceUsed = true;
      huntCards(state, "rose", [action.card]);
      afterHunt(state, turn, 0, false);
      return;
    }
    case "ready": {
      const card = turn.readyQueue.shift();
      if (card !== action.card) throw new Error("Not the pending Ready card");
      if (action.to === "deck") p.deck.push(card);
      else p.discard.push(card);
      settle(state);
      return;
    }
    case "instant":
      applyInstant(state, p, turn, action);
      return;
    case "end-turn":
      endTurn(state);
      return;
  }
}

/** Nanny: VP for the push, and the victim loses a Permanent (its choice if it has several). */
function nannyTax(state: GameState, p: PlayerState, turn: TurnState, victim: PlayerState): void {
  const nannies = passivesIn(p.playArea, "push-tax");
  if (nannies.length === 0) return;
  const vp = nannies.reduce((sum, e) => sum + e.vp, 0);
  p.vp += vp;
  state.log.push({ t: "familiar", p: p.index, card: cardsWith(p.playArea, "push-tax")[0], vp });
  const permanents = victim.playArea.filter((c) => cardDef(c.id).keywords.includes("permanent"));
  if (permanents.length === 1) {
    removeFromPlay(victim, permanents[0].id);
    victim.discard.push(permanents[0].id);
    state.log.push({ t: "nanny", p: victim.index, card: permanents[0].id });
  } else if (permanents.length > 1) {
    turn.nannyQueue.push(victim.index);
  }
}

/** A Familiar's own ability: Kutya, Wiggles, Ursa. */
function applyFamiliar(
  state: GameState,
  p: PlayerState,
  turn: TurnState,
  action: Extract<Action, { type: "familiar" }>,
): void {
  const effect = cardDef(action.card).activated;
  if (!effect) throw new Error("This card has no ability");
  let vp = 0;
  switch (effect.kind) {
    case "discard-for-col1-hunt":
      removeFromPlay(p, action.card);
      p.discard.push(action.card);
      turn.col1Hunts += 1;
      break;
    case "digest-with-card": {
      const target = action.target;
      if (!target) throw new Error("Wiggles needs a card");
      removeFromPlay(p, action.card);
      removeFromPlay(p, target);
      p.digested.push(action.card, target);
      vp = effect.vp;
      break;
    }
    case "redraw-hand": {
      // "Before you play": the hand is already in the playing area.
      const keep: typeof p.playArea = [];
      for (const card of p.playArea) {
        const def = cardDef(card.id);
        if (card.id === action.card) continue;
        if (def.keywords.includes("permanent") || card.carried) keep.push(card);
        else p.discard.push(card.id);
      }
      p.playArea = keep;
      p.discard.push(action.card);
      for (let i = 0; i < effect.draw; i++) drawToPlay(state, p);
      vp = effect.vp;
      break;
    }
  }
  turn.touched = true;
  p.vp += vp;
  state.log.push({ t: "familiar", p: p.index, card: action.card, vp, target: action.target });
  settle(state);
}

function takeBonus(state: GameState, p: PlayerState, spaceId: string): void {
  const token = state.chests[spaceId];
  if (!token) throw new Error("Empty chest");
  state.chests[spaceId] = null;
  p.bonus.push({ id: token, used: false });
  const vp = bonusDef(token).bonus.kind === "velvet" ? 4 : 2;
  p.vp += vp;
  state.log.push({ t: "chest", p: p.index, bonus: token, vp });
}

/** Discard an Instant Mission for its effect. A used tile can never be exchanged. */
function applyInstant(
  state: GameState,
  p: PlayerState,
  turn: TurnState,
  action: Extract<Action, { type: "instant" }>,
): void {
  const effect = missionDef(action.mission).instant;
  if (!effect) throw new Error("Not an Instant Mission");
  p.missions = p.missions.filter((m) => m !== action.mission);
  p.usedMissions.push(action.mission);
  let vp = 0;
  switch (effect.kind) {
    case "vp-per-closer":
      vp = closerCount(state, p, graph(state));
      p.vp += vp;
      break;
    case "take-bonus":
      if (action.space) takeBonus(state, p, action.space);
      break;
    case "free-familiar": {
      const card = action.card;
      if (!card) throw new Error("Beast Master needs a Familiar");
      for (const row of state.track) {
        for (let c = 0; c < row.length; c++) row[c] = row[c].filter((id) => id !== card);
      }
      p.hunted += 1;
      p.vp += cardDef(card).vp;
      const before = playAreaSpeed(p.playArea);
      p.playArea.push({ id: card, resolved: false });
      if (turn.stage === 2) {
        // Speed is the playing area's total, so a Familiar arriving after it
        // was calculated adds what it changes (Lockjaw, Wee Vlad) to what is left.
        const add = playAreaSpeed(p.playArea) - before;
        turn.speed += add;
        turn.speedLeft = Math.max(0, turn.speedLeft + add);
      }
      state.log.push({
        t: "hunt",
        p: p.index,
        source: "familiar",
        cards: [card],
        vp: cardDef(card).vp,
      });
      break;
    }
    case "free-hunt-after-col3":
    case "free-hunt-same-column": {
      if (action.row === undefined || action.col === undefined) throw new Error("No pile");
      const pile = state.track[action.row][action.col];
      state.track[action.row][action.col] = [];
      // Free: no Speed, no Hunt used.
      huntCards(state, "track", pile, action.col + 1);
      break;
    }
    case "digest-hand": {
      // Skip the turn: the hand's Humans are Digested, its other cards discarded.
      const keep: typeof p.playArea = [];
      for (const card of p.playArea) {
        const def = cardDef(card.id);
        if (def.keywords.includes("permanent") || card.carried) keep.push(card);
        else if (def.type === "human") p.digested.push(card.id);
        else p.discard.push(card.id);
      }
      p.playArea = keep;
      state.log.push({ t: "instant", p: p.index, mission: action.mission, vp: 0 });
      endTurn(state);
      return;
    }
  }
  state.log.push({ t: "instant", p: p.index, mission: action.mission, vp });
  settle(state);
}

function openCrypt(state: GameState, p: PlayerState, turn: TurnState, region: CryptRegion): void {
  const offered = state.crypts[region];
  if (offered.length === 0) return;
  state.crypts[region] = [];
  const keep = state.options.mode === "rookie" ? 1 : p.missions.length + 1;
  turn.missionPick = { source: region, offered, keep };
}

export function applyActionPure(state: GameState, player: number, action: Action): GameState {
  const legal = getLegalActions(state, player);
  const match = matchLegalAction(legal, action);
  if (!match) throw new Error(`Illegal action ${JSON.stringify(action)}`);
  const next = structuredClone(state);
  applyInPlace(next, player, match);
  return next;
}
