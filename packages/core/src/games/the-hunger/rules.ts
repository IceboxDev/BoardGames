// ---------------------------------------------------------------------------
// Read-only queries over a GameState, and the legal-action enumeration that
// the validator matches untrusted client actions against.
// ---------------------------------------------------------------------------

import {
  type BoardGraph,
  graphFor,
  mistDestinations,
  pushDestinations,
  space,
  spicyDestinations,
  walkDestinations,
} from "./board";
import { bonusDef } from "./content/bonus-tokens";
import { cardDef, passivesOf } from "./content/cards";
import { missionDef } from "./content/missions";
import { RULINGS } from "./rulings";
import type {
  Action,
  CardId,
  GameState,
  HumanCategory,
  ManipulationEffect,
  PassiveEffect,
  PlayCard,
  PlayerState,
  SpaceEffect,
  TurnState,
} from "./types";

export function graph(state: GameState): BoardGraph {
  return graphFor(state.options);
}

export function getActivePlayer(state: GameState): number {
  if (state.phase === "game-over" || !state.current) return -1;
  return deciderOf(state.current);
}

/** Who decides now: the turn's Vampire, or a Vampire its Nanny just pushed. */
export function deciderOf(turn: TurnState): number {
  return turn.step === "nanny" ? (turn.nannyQueue[0] ?? turn.player) : turn.player;
}

/** Familiar abilities usable now: Kutya and Wiggles in play, Ursa before anything else. */
function familiarActions(p: PlayerState, turn: TurnState): Action[] {
  const out: Action[] = [];
  for (const card of p.playArea) {
    const effect = cardDef(card.id).activated;
    if (!effect) continue;
    switch (effect.kind) {
      case "discard-for-col1-hunt":
        if (turn.step === "act" && !turn.extraTurn) out.push({ type: "familiar", card: card.id });
        break;
      case "digest-with-card":
        if (turn.step !== "manipulate" && turn.step !== "act") break;
        for (const target of p.playArea) {
          if (target.id !== card.id)
            out.push({ type: "familiar", card: card.id, target: target.id });
        }
        break;
      case "redraw-hand":
        if (turn.step === "manipulate" && !turn.touched)
          out.push({ type: "familiar", card: card.id });
        break;
    }
  }
  return out;
}

export function hasHuman(cards: readonly PlayCard[]): boolean {
  return cards.some((c) => cardDef(c.id).type === "human");
}

export function hasKeyword(cards: readonly PlayCard[], kw: string): boolean {
  return cards.some((c) => cardDef(c.id).keywords.some((k) => k === kw));
}

export function cardSpeed(id: CardId, humanInPlay: boolean): number {
  const s = cardDef(id).speed;
  if (typeof s === "number") return s;
  return humanInPlay ? s.ifHuman : s.base;
}

/** Total Speed of the playing area (Permanents included). */
/** Every passive effect of one kind among `cards`, one entry per card carrying it. */
export function passivesIn<K extends PassiveEffect["kind"]>(
  cards: readonly PlayCard[],
  kind: K,
): Extract<PassiveEffect, { kind: K }>[] {
  const out: Extract<PassiveEffect, { kind: K }>[] = [];
  for (const c of cards) {
    for (const e of passivesOf(cardDef(c.id))) {
      if (e.kind === kind) out.push(e as Extract<PassiveEffect, { kind: K }>);
    }
  }
  return out;
}

/** The cards in `cards` carrying a passive effect of this kind. */
export function cardsWith(cards: readonly PlayCard[], kind: PassiveEffect["kind"]): CardId[] {
  return cards
    .filter((c) => passivesOf(cardDef(c.id)).some((e) => e.kind === kind))
    .map((c) => c.id);
}

function humansIn(cards: readonly PlayCard[]) {
  return cards.map((c) => cardDef(c.id)).filter((d) => d.type === "human");
}

/**
 * Total Speed of the playing area (Permanents included): printed Speeds,
 * plus Wee Vlad per cheap Human and Lockjaw with enough Humans.
 */
export function playAreaSpeed(cards: readonly PlayCard[]): number {
  const human = hasHuman(cards);
  const humans = humansIn(cards);
  let speed = cards.reduce((sum, c) => sum + cardSpeed(c.id, human), 0);
  for (const e of passivesIn(cards, "speed-per-human-worth")) {
    speed += e.n * humans.filter((d) => d.vp >= e.min && d.vp <= e.max).length;
  }
  for (const e of passivesIn(cards, "humans-bonus")) {
    if (humans.length >= e.atLeast) speed += e.speed;
  }
  return speed;
}

/** Lockjaw's VP for this playing area. */
export function humansBonusVp(cards: readonly PlayCard[]): number {
  const n = humansIn(cards).length;
  return passivesIn(cards, "humans-bonus").reduce((sum, e) => sum + (n >= e.atLeast ? e.vp : 0), 0);
}

/** Turn-1 order: the Speed of the three-card starting hand. */
export function handSpeed(hand: readonly CardId[]): number {
  const human = hand.some((id) => cardDef(id).type === "human");
  return hand.reduce((sum, id) => sum + cardSpeed(id, human), 0);
}

export function passiveCount(cards: readonly PlayCard[], kind: PassiveEffect["kind"]): number {
  return passivesIn(cards, kind).length;
}

export function isReturned(p: PlayerState): boolean {
  return p.castleTile !== null;
}

export function ownsRose(p: PlayerState): boolean {
  return allCards(p).some((id) => cardDef(id).family === "rose");
}

export function allCards(p: PlayerState): CardId[] {
  return [...p.deck, ...p.hand, ...p.playArea.map((c) => c.id), ...p.discard, ...p.digested];
}

/** Hunt Track column N costs N Speed, +1 once if the pile holds a Fast card. */
export function huntCost(pile: readonly CardId[], col: number): number {
  const fast = pile.some((id) => cardDef(id).keywords.includes("fast"));
  return col + 1 + (fast ? 1 : 0);
}

const DIGEST_SPACE: Partial<Record<SpaceEffect, HumanCategory>> = {
  market: "villager",
  church: "religious",
  mansion: "noble",
  barracks: "military",
};

export function digestCategoryOf(effect: SpaceEffect): HumanCategory | null {
  return DIGEST_SPACE[effect] ?? null;
}

export function currentSpace(state: GameState, p: PlayerState) {
  return space(graph(state), p.pos);
}

export function occupantsOf(state: GameState, spaceId: string, except: number): number[] {
  return state.players
    .filter((p) => p.index !== except && p.pos === spaceId)
    .sort((a, b) => b.placedAt - a.placedAt)
    .map((p) => p.index);
}

/** Hunts still available this turn: `general` (any column) and `col1` (Well). */
export function huntsLeft(turn: TurnState): { general: number; col1: number } {
  const generalUsed = turn.hunts - turn.col1Used;
  return {
    general: Math.max(0, 1 + turn.extraHunts - generalUsed),
    col1: Math.max(0, turn.col1Hunts - turn.col1Used),
  };
}

function canUseSpace(turn: TurnState): boolean {
  return RULINGS.stayTriggersSpace ? turn.speed > 0 : turn.speed > 0 && turn.moved;
}

/** Why hunting is impossible this turn, if it is. */
export function huntBlocked(state: GameState, p: PlayerState, turn: TurnState): string | null {
  if (turn.extraTurn) return "no hunting during a Parasol turn";
  if (turn.speed <= 0) return "no Speed";
  if (hasKeyword(p.playArea, "holy-water")) return "Holy Water";
  const effect = currentSpace(state, p).effect;
  if (effect === "castle") return "in the Castle";
  if (effect === "ship") return "on a Ship";
  return null;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  if (k >= 0 && k <= items.length) pick(0, []);
  return out;
}

/**
 * The Instant Missions `p` may discard right now, each with its target.
 * Free hunts follow a qualifying Hunt Track hunt this turn; Digestion must
 * be the very first thing done; the rest work any time on your turn.
 */
export function instantActions(state: GameState, p: PlayerState, turn: TurnState): Action[] {
  const out: Action[] = [];
  const g = graph(state);
  const piles = (cols: ReadonlySet<number> | null): { row: number; col: number }[] => {
    const here = currentSpace(state, p);
    const found: { row: number; col: number }[] = [];
    state.track.forEach((row, r) => {
      row.forEach((pile, c) => {
        if (pile.length === 0 || (cols && !cols.has(c))) return;
        if (here.region === "cemetery" && pile.some((id) => cardDef(id).type === "human")) return;
        found.push({ row: r, col: c });
      });
    });
    return found;
  };
  const canHunt = huntBlocked(state, p, turn) === null;
  for (const mission of p.missions) {
    const effect = missionDef(mission).instant;
    if (!effect) continue;
    const anytime = turn.step === "manipulate" || turn.step === "act";
    switch (effect.kind) {
      case "digest-hand":
        if (turn.step === "manipulate" && !turn.touched) out.push({ type: "instant", mission });
        break;
      case "free-hunt-after-col3":
        if (turn.step === "act" && canHunt && turn.trackHunts.some((h) => h.col === 2)) {
          for (const at of piles(null)) out.push({ type: "instant", mission, ...at });
        }
        break;
      case "free-hunt-same-column": {
        if (turn.step !== "act" || !canHunt) break;
        const cols = new Set(
          turn.trackHunts.filter((h) => h.human && h.region === effect.region).map((h) => h.col),
        );
        if (cols.size > 0)
          for (const at of piles(cols)) out.push({ type: "instant", mission, ...at });
        break;
      }
      case "take-bonus":
        if (!anytime) break;
        for (const [spaceId, token] of Object.entries(state.chests).sort()) {
          if (token) out.push({ type: "instant", mission, space: spaceId });
        }
        break;
      case "free-familiar":
        if (!anytime || turn.extraTurn || hasKeyword(p.playArea, "holy-water")) break;
        for (const row of state.track) {
          for (const pile of row) {
            for (const card of pile) {
              if (cardDef(card).type === "familiar") out.push({ type: "instant", mission, card });
            }
          }
        }
        break;
      case "vp-per-closer":
        if (anytime && closerCount(state, p, g) > 0) out.push({ type: "instant", mission });
        break;
    }
  }
  return out;
}

/** Vampires strictly closer to the Castle than `p`. */
export function closerCount(state: GameState, p: PlayerState, g: BoardGraph): number {
  const mine = g.castleDist.get(p.pos) ?? 0;
  return state.players.filter((o) => o.index !== p.index && (g.castleDist.get(o.pos) ?? 0) < mine)
    .length;
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/** Cards a draw effect draws: the base, or its "with a Human" count. */
export function drawCount(
  m: Extract<ManipulationEffect, { kind: "draw" }>,
  humanInPlay: boolean,
): number {
  return humanInPlay ? (m.withHuman ?? m.n) : m.n;
}

/**
 * Hypnosis: every card on the Hunt Track, to each pile one space up, down,
 * left or right. Once per Hypnosis card per turn, any time before the turn ends.
 */
function hypnosisActions(state: GameState, p: PlayerState, turn: TurnState): Action[] {
  if (turn.step !== "manipulate" && turn.step !== "act") return [];
  const out: Action[] = [];
  const rows = state.track.length;
  for (const card of p.playArea) {
    if (card.resolved || cardDef(card.id).activated?.kind !== "hypnosis") continue;
    state.track.forEach((row, r) => {
      row.forEach((pile, c) => {
        const to = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ].filter(([rr, cc]) => rr >= 0 && rr < rows && cc >= 0 && cc < 3);
        for (const pick of pile) {
          for (const [rr, cc] of to) {
            out.push({ type: "hypnosis", card: card.id, pick, row: rr, col: cc });
          }
        }
      });
    });
  }
  return out;
}

/**
 * Cards whose draw is not optional ("Draw 1 card", not "You may draw") and can
 * be resolved right now: step 1 cannot end while any remain.
 */
export function mandatoryDraws(p: Pick<PlayerState, "playArea">): CardId[] {
  const human = hasHuman(p.playArea);
  return p.playArea
    .filter((c) => {
      const m = cardDef(c.id).manipulation;
      return !c.resolved && m?.kind === "draw" && m.mandatory && drawCount(m, human) > 0;
    })
    .map((c) => c.id);
}

function manipulationActions(p: PlayerState): Action[] {
  const out: Action[] = [];
  const human = hasHuman(p.playArea);
  for (const card of p.playArea) {
    const m = cardDef(card.id).manipulation;
    if (!m) continue;
    if (m.kind === "draw") {
      if (!card.resolved && drawCount(m, human) > 0) out.push({ type: "resolve", card: card.id });
    } else {
      // The double Vampiric Will may be used again once it has been activated.
      if ((card.used ?? 0) >= (m.times ?? 1)) continue;
      for (const target of p.playArea) {
        if (target.id === card.id || target.resolved) continue;
        out.push({ type: "resolve", card: card.id, discard: target.id });
      }
    }
  }
  // Discard effects may also hit a card whose own effect is unwanted.
  for (const token of p.bonus) {
    if (token.used) continue;
    const b = bonusDef(token.id).bonus;
    if (b.kind === "discard-draw") {
      for (const target of p.playArea) {
        if (!target.resolved) out.push({ type: "use-bonus", token: token.id, discard: target.id });
      }
    } else if (b.kind === "draw-to-play" || b.kind === "speed" || b.kind === "mission") {
      out.push({ type: "use-bonus", token: token.id });
    }
  }
  return out;
}

function moveActions(state: GameState, p: PlayerState, turn: TurnState): Action[] {
  const g = graph(state);
  if (turn.speed <= 0 || isReturned(p)) return [];
  if (hasKeyword(p.playArea, "spicy")) {
    const forced = spicyDestinations(g, p.pos, turn.speed);
    if (forced.length > 0) return forced.map((d) => ({ type: "move", to: d.to, spent: d.spent }));
    return [{ type: "stay" }];
  }
  const occupied = new Set(state.players.filter((o) => o.index !== p.index).map((o) => o.pos));
  const bat = passiveCount(p.playArea, "bat") > 0;
  const out: Action[] = [{ type: "stay" }];
  const dests = walkDestinations(g, p.pos, turn.speed, { bat, occupied });
  for (const [to, spent] of [...dests].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push({ type: "move", to, spent });
  }
  if (passiveCount(p.playArea, "mist") > 0) {
    for (const to of mistDestinations(g, p.pos)) out.push({ type: "mist", to });
  }
  return out;
}

function actActions(state: GameState, p: PlayerState, turn: TurnState): Action[] {
  const out: Action[] = [];
  const here = currentSpace(state, p);
  const blocked = huntBlocked(state, p, turn);
  const left = huntsLeft(turn);

  if (!turn.spaceUsed && canUseSpace(turn)) {
    if ((here.effect === "chest" || here.effect === "chest-open") && state.chests[here.id]) {
      out.push({ type: "space" });
    } else if (here.effect === "crypt") {
      if ((state.crypts[here.id]?.length ?? 0) > 0) out.push({ type: "space" });
    } else {
      const category = digestCategoryOf(here.effect);
      if (category && digestible(p, category).length > 0) out.push({ type: "space" });
    }
  }

  if (!blocked && turn.speedLeft > 0) {
    // No Humans are hunted anywhere in the Cemetery region.
    const noHumans = here.region === "cemetery";
    const anyHunt = left.general > 0;
    state.track.forEach((row, r) => {
      row.forEach((pile, c) => {
        if (pile.length === 0) return;
        if (!(anyHunt || (c === 0 && left.col1 > 0))) return;
        if (huntCost(pile, c) > turn.speedLeft) return;
        if (noHumans && pile.some((id) => cardDef(id).type === "human")) return;
        out.push({ type: "hunt", row: r, col: c });
      });
    });
    if (
      here.effect === "tavern" &&
      !turn.spaceUsed &&
      anyHunt &&
      state.tavern.length > 0 &&
      turn.speedLeft >= 2
    ) {
      out.push({ type: "hunt-tavern" });
    }
  }
  if (
    here.effect === "labyrinth" &&
    !blocked &&
    !turn.spaceUsed &&
    left.general > 0 &&
    !ownsRose(p)
  ) {
    for (const card of state.roses) out.push({ type: "hunt-rose", card });
  }
  out.push(...instantActions(state, p, turn));
  // +1 Hunt tokens: spent once Speed is known. Speed is lost after the last
  // Hunt, so they matter only before it.
  if (!turn.extraTurn) {
    for (const token of p.bonus) {
      if (!token.used && bonusDef(token.id).bonus.kind === "extra-hunt") {
        out.push({ type: "use-bonus", token: token.id });
      }
    }
  }
  out.push({ type: "end-turn" });
  return out;
}

export function digestible(p: PlayerState, category: HumanCategory): CardId[] {
  const ids = [...p.playArea.map((c) => c.id), ...p.discard];
  return ids.filter((id) => {
    const d = cardDef(id);
    return d.type === "human" && d.category === category;
  });
}

/** Any card in the playing area or discard pile (a hunted Zephania's Digest). */
export function digestibleAny(p: PlayerState): CardId[] {
  return [...p.playArea.map((c) => c.id), ...p.discard];
}

export function missionKeepSets(state: GameState, p: PlayerState, turn: TurnState): string[][] {
  const pick = turn.missionPick;
  if (!pick) return [];
  if (pick.source === null || state.options.mode === "rookie") {
    return pick.offered.map((m) => [m]);
  }
  const pool = [...p.missions, ...pick.offered].sort();
  return combinations(pool, Math.min(pick.keep, pool.length));
}

export function getLegalActions(state: GameState, player: number): Action[] {
  const turn = state.current;
  if (!turn || deciderOf(turn) !== player || state.phase === "game-over") return [];
  const p = state.players[player];
  switch (turn.step) {
    case "nanny":
      return p.playArea
        .filter((c) => cardDef(c.id).keywords.includes("permanent"))
        .map((c): Action => ({ type: "discard-permanent", card: c.id }));
    case "manipulate":
      return [
        ...manipulationActions(p),
        ...instantActions(state, p, turn),
        ...familiarActions(p, turn),
        ...hypnosisActions(state, p, turn),
        ...(mandatoryDraws(p).length === 0 ? [{ type: "end-manipulation" } as const] : []),
      ];
    case "move":
      return moveActions(state, p, turn);
    case "push": {
      const g = graph(state);
      return [
        { type: "push", to: null },
        ...pushDestinations(g, p.pos).map((to): Action => ({ type: "push", to })),
      ];
    }
    case "act":
      return [
        ...familiarActions(p, turn),
        ...hypnosisActions(state, p, turn),
        ...actActions(state, p, turn),
      ];
    case "digest": {
      const cat = turn.digestCategory;
      const ids = cat ? digestible(p, cat) : digestibleAny(p);
      return [
        { type: "digest", card: null },
        ...ids.map((card): Action => ({ type: "digest", card })),
      ];
    }
    case "missions":
      return missionKeepSets(state, p, turn).map(
        (keep): Action => ({ type: "keep-missions", keep }),
      );
    case "inspire":
      // Any one Crypt's pile, each a separate choice.
      return Object.entries(state.crypts)
        .filter(([, pile]) => pile.length > 0)
        .map(([crypt]): Action => ({ type: "inspire", crypt }));
    case "ready": {
      const card = turn.readyQueue[0];
      if (!card) return [];
      return [
        { type: "ready", card, to: "deck" },
        { type: "ready", card, to: "discard" },
      ];
    }
  }
}
