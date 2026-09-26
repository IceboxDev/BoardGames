// ---------------------------------------------------------------------------
// AI seats. Every strategy picks from the engine's own legal actions, so a
// bad heuristic can play badly but never illegally.
// ---------------------------------------------------------------------------

import { createRng } from "../../lib/rng";
import { type BoardGraph, space } from "./board";
import { bonusDef } from "./content/bonus-tokens";
import { cardDef, passivesOf } from "./content/cards";
import { missionDef } from "./content/missions";
import { TURNS } from "./game-engine";
import {
  allCards,
  cardSpeed,
  closerCount,
  currentSpace,
  getActivePlayer,
  getLegalActions,
  graph,
  hasKeyword,
  huntCost,
  passivesIn,
  playAreaSpeed,
} from "./rules";
import { missionContext, missionScore } from "./scoring";
import {
  type Action,
  type AIStrategyId,
  ALL_STRATEGIES,
  type CardId,
  type GameState,
  type PlayerState,
} from "./types";

export interface HungerStrategy {
  id: AIStrategyId;
  label: string;
  description: string;
  pickAction(state: GameState, seat: number, legal: readonly Action[]): Action;
}

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------

const meta = (id: AIStrategyId) => {
  const m = ALL_STRATEGIES.find((s) => s.id === id);
  if (!m) throw new Error(`Unknown strategy ${id}`);
  return m;
};

const RANDOM: HungerStrategy = {
  ...meta("random"),
  pickAction(state, _seat, legal) {
    // Seeded from the game so self-play (and its tests) replay exactly.
    return legal[Math.floor(createRng(state.rng ^ (state.log.length * 7919))() * legal.length)];
  },
};

// ---------------------------------------------------------------------------
// Heuristic
// ---------------------------------------------------------------------------

/** Expected Speed of a 3-card hand drawn from everything the Vampire owns. */
function expectedHandSpeed(p: PlayerState): number {
  const cards = allCards(p).filter((id) => !cardDef(id).keywords.includes("permanent"));
  const permanent = p.playArea
    .filter((c) => cardDef(c.id).keywords.includes("permanent"))
    .reduce((sum, c) => sum + cardSpeed(c.id, false), 0);
  if (cards.length === 0) return permanent;
  const mean = cards.reduce((sum, id) => sum + cardSpeed(id, false), 0) / cards.length;
  return permanent + 3 * mean;
}

/** Turns after the current one. */
function turnsAfter(state: GameState): number {
  return Math.max(0, TURNS - state.turn);
}

function regionBonus(g: BoardGraph, spaceId: string): number {
  const region = space(g, spaceId).region;
  return region === "forest" ? 2 : region === "plains" ? 1 : 0;
}

/** How much a pile is worth hunting from `spaceId`, net of the drag it adds. */
function pileValue(
  state: GameState,
  p: PlayerState,
  pile: readonly CardId[],
  spaceId: string,
): number {
  const g = graph(state);
  const hunger = passivesIn(p.playArea, "hunt-vp-per-human").reduce((sum, e) => sum + e.n, 0);
  // Late in the night a slow deck costs the trip home.
  const drag = 0.4 + (state.turn / TURNS) * 1.4;
  let value = 0;
  for (const id of pile) {
    const def = cardDef(id);
    value += def.vp;
    const speed = cardSpeed(id, true);
    if (def.type === "human") {
      value += regionBonus(g, spaceId) + hunger;
      if (def.huntBonus && space(g, spaceId).region === def.huntBonus.region)
        value += def.huntBonus.vp;
      if (def.onHunt) value += 1;
      if (def.keywords.includes("confuse")) value -= 1.5 * (state.turn / TURNS) * 3;
      if (def.keywords.includes("holy-water")) value -= 1;
      if (def.keywords.includes("spicy")) value -= 0.5;
      if (def.endGame) value += 1.5;
    } else {
      value += Math.max(0, speed) * (1.2 - state.turn / TURNS);
    }
    if (speed < 0) value += speed * drag;
    value += missionAffinity(p, id);
  }
  return value;
}

/** Bonus for a card that pushes one of our Missions along. */
function missionAffinity(p: PlayerState, card: CardId): number {
  const def = cardDef(card);
  let bonus = 0;
  for (const m of p.missions) {
    const c = missionDef(m).standard;
    if (!c) continue;
    const human = def.type === "human";
    if ("category" in c && def.category === c.category) bonus += 0.8;
    if (c.kind === "majority" && (c.of === def.category || (c.of === "humans" && human))) {
      bonus += 0.6;
    }
    if (c.kind === "majority" && c.of === "familiars" && def.type === "familiar") bonus += 0.8;
    if (c.kind === "per-distinct" && def.type === c.type) bonus += 0.6;
    if (c.kind === "per-human-worth" && human && def.vp >= c.min && def.vp <= (c.max ?? 99)) {
      bonus += c.vpEach;
    }
    if (c.kind === "none-worth" && human && def.vp >= c.atLeast) bonus -= 3;
    if (c.kind === "per-keyword" && human && c.keywords.some((k) => def.keywords.includes(k))) {
      bonus += c.vpEach * 0.8;
    }
    if ((c.kind === "count-humans" || c.kind === "sets" || c.kind === "same-type") && human) {
      bonus += 0.3;
    }
    if (c.kind === "fewest-humans" && human) bonus -= 0.8;
  }
  return bonus;
}

/**
 * A Rose: its printed VP, its Speed for the run home, and what its
 * end-of-turn effect should still earn — about half the remaining turns hunt.
 */
function roseValue(state: GameState, rose: CardId): number {
  const def = cardDef(rose);
  const left = turnsAfter(state);
  let ongoing = 0;
  for (const passive of passivesOf(def)) {
    if (passive.kind !== "end-turn-vp") continue;
    const share = passive.when === "always" ? 1 : 0.5;
    ongoing += passive.n * share * left;
  }
  return def.vp + ongoing + cardSpeed(rose, false) * 0.8;
}

/** Best hunt reachable after ending on `spaceId` with `speedLeft`. */
function bestHuntFrom(
  state: GameState,
  p: PlayerState,
  spaceId: string,
  speedLeft: number,
): number {
  const g = graph(state);
  const s = space(g, spaceId);
  const turn = state.current;
  if (!turn || turn.extraTurn || speedLeft <= 0) return 0;
  if (s.effect === "castle" || s.effect === "ship" || hasKeyword(p.playArea, "holy-water"))
    return 0;
  let best = 0;
  for (const row of state.track) {
    row.forEach((pile, c) => {
      if (pile.length === 0 || huntCost(pile, c) > speedLeft) return;
      if (s.region === "cemetery" && pile.some((id) => cardDef(id).type === "human")) return;
      best = Math.max(best, pileValue(state, p, pile, spaceId));
    });
  }
  if (s.effect === "labyrinth" && !allCards(p).some((id) => cardDef(id).family === "rose")) {
    for (const rose of state.roses) best = Math.max(best, roseValue(state, rose));
  }
  if (s.effect === "tavern" && speedLeft >= 2) best = Math.max(best, state.tavern.length * 2);
  return best;
}

function spaceValue(state: GameState, p: PlayerState, spaceId: string): number {
  const s = space(graph(state), spaceId);
  switch (s.effect) {
    case "chest":
    case "chest-open":
      return state.chests[spaceId] ? 3 : 0;
    case "crypt":
      return (state.crypts[s.region as "mountains"]?.length ?? 0) > 0 ? 2 : 0;
    case "market":
    case "church":
    case "mansion":
    case "barracks":
      return p.discard.some((id) => cardDef(id).type === "human") ? 1.5 : 0;
    default:
      return 0;
  }
}

/**
 * Sunrise risk of standing on `spaceId` now, with `turnsAfter` turns left to
 * get home. Zero when the Castle is comfortably within reach.
 */
function risk(state: GameState, p: PlayerState, spaceId: string): number {
  const g = graph(state);
  const left = turnsAfter(state);
  const dist = g.castleDist.get(spaceId) ?? 99;
  const s = space(g, spaceId);
  if (left === 0) {
    if (s.region === "castle") return 0;
    if (s.region === "cemetery") return 5;
    if (s.region === "mountains" && state.options.mode === "rookie") return s.mountainPenalty ?? 0;
    if (s.region === "mountains" && state.options.beginnerSafeMountains) return 0;
    return 200 + p.vp;
  }
  const pace = Math.max(1, expectedHandSpeed(p) * 0.7);
  const reach = left * pace;
  if (dist <= reach - pace) return 0;
  // Beyond comfortable reach: steeply penalise, proportional to what's at stake.
  return (dist - (reach - pace)) * (4 + p.vp / 6);
}

function castleArrivalValue(state: GameState): number {
  const tile = state.castleTiles[0] ?? 0;
  const left = turnsAfter(state);
  return tile - left * 3.5;
}

function destinationValue(state: GameState, p: PlayerState, to: string, spent: number): number {
  const turn = state.current;
  if (!turn) return 0;
  const g = graph(state);
  if (to === g.castle) return castleArrivalValue(state) + 1;
  return (
    bestHuntFrom(state, p, to, turn.speedLeft - spent) +
    spaceValue(state, p, to) -
    risk(state, p, to) +
    // Wells grant a column-1 Hunt.
    (g.wells.has(to) ? 0.5 : 0)
  );
}

function discardBadness(state: GameState, id: CardId): number {
  const def = cardDef(id);
  let bad = 0;
  if (def.keywords.includes("confuse")) bad += 4 + (state.turn / TURNS) * 4;
  if (def.keywords.includes("holy-water")) bad += 3;
  if (def.keywords.includes("spicy")) bad += 2;
  const speed = cardSpeed(id, true);
  if (speed < 0) bad += -speed * 1.5;
  if (def.keywords.includes("permanent") && !def.keywords.includes("spicy")) bad -= 5;
  // A card that adds Speed is one to keep.
  if (speed > 0) bad -= speed * 2;
  // A Human still scores and counts for Missions once digested.
  if (def.type === "human") bad += 0.5;
  return bad;
}

function missionEstimate(state: GameState, p: PlayerState, id: string): number {
  const def = missionDef(id);
  // An Instant is a one-off favour: worth a few VP whenever it fires.
  if (def.instant) return def.instant.kind === "digest-hand" ? 1.5 : 3;
  const c = def.standard;
  if (!c) return 0;
  const ctx = missionContext(state, p.index);
  const now = c.kind === "missionary" ? p.missions.length : missionScore(c, def.vp, ctx);
  const left = turnsAfter(state) / TURNS;
  // Early in the night most Missions can still be steered toward.
  const hope: Partial<Record<typeof c.kind, number>> = {
    "per-category": 3,
    "per-human-worth": 3,
    "count-humans": def.vp * 0.5,
    majority: def.vp * 0.35,
    "same-type": def.vp * 0.5,
    sets: 4,
    "has-rose": def.vp * 0.5,
    host: 3,
    "first-home": def.vp * 0.25,
    "score-rank": def.vp * 0.2,
    "none-worth": def.vp * 0.8,
  };
  return now + (hope[c.kind] ?? 2) * left;
}

/** An Instant Mission worth discarding now, if any. */
function pickInstant(state: GameState, p: PlayerState, legal: readonly Action[]): Action | null {
  const here = currentSpace(state, p).id;
  let best: { a: Action; v: number } | null = null;
  for (const a of legal) {
    if (a.type !== "instant") continue;
    const effect = missionDef(a.mission).instant;
    if (!effect) continue;
    let v = 0;
    switch (effect.kind) {
      case "digest-hand": {
        const humans = p.playArea.filter(
          (c) => !c.carried && cardDef(c.id).type === "human",
        ).length;
        const slow = playAreaSpeed(p.playArea) <= 1;
        v = humans >= 2 && slow && turnsAfter(state) > 2 ? humans : 0;
        break;
      }
      case "free-hunt-after-col3":
      case "free-hunt-same-column":
        if (a.row !== undefined && a.col !== undefined) {
          v = pileValue(state, p, state.track[a.row][a.col], here);
        }
        break;
      case "take-bonus":
        v = 2.5;
        break;
      case "free-familiar":
        v = a.card ? 2 + cardSpeed(a.card, false) : 0;
        break;
      case "vp-per-closer": {
        const n = closerCount(state, p, graph(state));
        v = n >= 3 || turnsAfter(state) === 0 ? n : 0;
        break;
      }
    }
    if (v > 0.5 && (!best || v > best.v)) best = { a, v };
  }
  return best?.a ?? null;
}

function heuristicPick(state: GameState, seat: number, legal: readonly Action[]): Action {
  const p = state.players[seat];
  const turn = state.current;
  const g = graph(state);
  if (!turn) return legal[0];
  const by = <T extends Action["type"]>(type: T) =>
    legal.filter((a): a is Extract<Action, { type: T }> => a.type === type);
  const argmax = <T>(
    items: readonly T[],
    f: (x: T) => number,
  ): { item: T; value: number } | null => {
    let best: { item: T; value: number } | null = null;
    for (const item of items) {
      const value = f(item);
      if (!best || value > best.value) best = { item, value };
    }
    return best;
  };

  switch (turn.step) {
    case "manipulate": {
      const instant = pickInstant(state, p, legal);
      if (instant) return instant;
      // Ursa: a slow hand is worth trading for two fresh cards.
      const ursa = by("familiar").find((a) => cardDef(a.card).activated?.kind === "redraw-hand");
      if (ursa && playAreaSpeed(p.playArea) <= 2) return ursa;
      // Wiggles: digest the worst card before it acts.
      const wiggle = argmax(
        by("familiar").filter((a) => a.target),
        (a) => discardBadness(state, a.target ?? ""),
      );
      if (wiggle && wiggle.value > 1.5) return wiggle.item;
      const draw = by("resolve").find((a) => !a.discard);
      if (draw) return draw;
      const discard = argmax(
        [...by("resolve").filter((a) => a.discard), ...by("use-bonus").filter((a) => a.discard)],
        (a) => discardBadness(state, a.discard ?? ""),
      );
      if (discard && discard.value > 1) return discard.item;
      for (const a of by("use-bonus")) {
        const kind = bonusDef(a.token).bonus.kind;
        if (kind === "draw-to-play" || kind === "mission") return a;
        if (kind === "speed") {
          const dist = g.castleDist.get(p.pos) ?? 0;
          if (turnsAfter(state) <= 2 && dist > 0) return a;
        }
      }
      return legal.find((a) => a.type === "end-manipulation") ?? legal[0];
    }
    case "move": {
      const options = [
        ...by("move").map((a) => ({
          a: a as Action,
          v: destinationValue(state, p, a.to, a.spent),
        })),
        ...by("mist").map((a) => ({ a: a as Action, v: destinationValue(state, p, a.to, 0) })),
        ...by("stay").map((a) => ({
          a: a as Action,
          v: destinationValue(state, p, p.pos, 0) - 0.2,
        })),
      ];
      const best = argmax(options, (o) => o.v);
      return best?.item.a ?? legal[0];
    }
    case "push": {
      // Late in the night, push rivals further from home; a Nanny pays for any push.
      const nanny = passivesIn(p.playArea, "push-tax").length > 0;
      const best = argmax(by("push"), (a) => {
        if (!a.to) return 0;
        const late = state.turn >= TURNS - 4;
        const from = g.castleDist.get(p.pos) ?? 0;
        const to = g.castleDist.get(a.to) ?? 0;
        return (nanny ? 2 : 0) + (late ? to - from - 0.5 : -1);
      });
      return best?.item ?? legal[0];
    }
    case "act": {
      const instant = pickInstant(state, p, legal);
      if (instant) return instant;
      const useSpace = by("space")[0];
      if (useSpace) return useSpace;
      const here = currentSpace(state, p).id;
      const hunts = [
        ...by("hunt").map((a) => ({
          a: a as Action,
          v: pileValue(state, p, state.track[a.row][a.col], here),
        })),
        ...by("hunt-rose").map((a) => ({ a: a as Action, v: roseValue(state, a.card) })),
        ...by("hunt-tavern").map((a) => ({ a: a as Action, v: state.tavern.length * 2 })),
      ];
      // Hypnosis, before hunting: move the card that most improves the best
      // pile we can afford (merge two good piles, or slide one to a cheaper column).
      const hypnosis = by("hypnosis");
      if (hypnosis.length > 0 && turn.hunts === 0 && turn.speedLeft > 0) {
        const bestOn = (track: GameState["track"]) => {
          let v = 0;
          for (const row of track) {
            row.forEach((pile, c) => {
              if (pile.length > 0 && huntCost(pile, c) <= turn.speedLeft) {
                v = Math.max(v, pileValue(state, p, pile, here));
              }
            });
          }
          return v;
        };
        const now = bestOn(state.track);
        const moved = argmax(hypnosis, (a) => {
          const track = state.track.map((row) =>
            row.map((pile) => pile.filter((id) => id !== a.pick)),
          );
          track[a.row][a.col].push(a.pick);
          return bestOn(track) - now;
        });
        if (moved && moved.value > 1) return moved.item;
      }
      const best = argmax(hunts, (h) => h.v);
      // An extra Hunt — Kutya (column 1) or a +1 Hunt token (any column) —
      // must come before the first Hunt, as Speed is lost after the last:
      // take it when a second pile is worth hunting and the Speed covers both.
      const kutya = by("familiar").find(
        (a) => cardDef(a.card).activated?.kind === "discard-for-col1-hunt",
      );
      const token = by("use-bonus").find((a) => bonusDef(a.token).bonus.kind === "extra-hunt");
      if ((kutya || token) && best && best.value > 0.5 && turn.hunts === 0) {
        const chosen = best.item.a;
        const firstCost =
          chosen.type === "hunt" ? huntCost(state.track[chosen.row][chosen.col], chosen.col) : 0;
        const secondBest = (cols: readonly number[]) =>
          argmax(
            state.track.flatMap((row, r) =>
              cols
                .filter(
                  (c) =>
                    row[c].length > 0 &&
                    !(chosen.type === "hunt" && chosen.row === r && chosen.col === c),
                )
                .map((c) => ({ pile: row[c], c })),
            ),
            ({ pile, c }) =>
              firstCost + huntCost(pile, c) <= turn.speedLeft ? pileValue(state, p, pile, here) : 0,
          );
        const anyCol = token ? secondBest([0, 1, 2]) : null;
        if (token && anyCol && anyCol.value > 2.5) return token;
        const col1 = kutya ? secondBest([0]) : null;
        if (kutya && col1 && col1.value > 2.5) return kutya;
      }
      if (best && best.value > 0.5) return best.item.a;
      return legal.find((a) => a.type === "end-turn") ?? legal[0];
    }
    case "nanny": {
      // Give up the Permanent we value least.
      const keepValue = (card: CardId) =>
        cardDef(card).family === "rose"
          ? 10
          : cardSpeed(card, true) + passivesOf(cardDef(card)).length;
      const worst = argmax(by("discard-permanent"), (a) => -keepValue(a.card));
      return worst?.item ?? legal[0];
    }
    case "digest": {
      // Digest what slows the deck or hurts to draw; a building's Human is
      // always worth taking out, a free Digest only if it improves the deck.
      const best = argmax(
        by("digest").filter((a) => a.card),
        (a) => discardBadness(state, a.card ?? "") + (turn.digestCategory ? 1 : 0),
      );
      if (best && best.value > 0) return best.item;
      return legal.find((a) => a.type === "digest" && a.card === null) ?? legal[0];
    }
    case "missions": {
      const best = argmax(by("keep-missions"), (a) =>
        a.keep.reduce((sum, m) => sum + missionEstimate(state, p, m), 0),
      );
      return best?.item ?? legal[0];
    }
    case "inspire": {
      const best = argmax(by("inspire"), (a) => state.crypts[a.stack].length);
      return best?.item ?? legal[0];
    }
    case "ready": {
      const a = by("ready")[0];
      if (!a) return legal[0];
      const good = cardSpeed(a.card, true) > 0 || cardDef(a.card).keywords.includes("permanent");
      return by("ready").find((r) => r.to === (good ? "deck" : "discard")) ?? a;
    }
  }
}

const HEURISTIC: HungerStrategy = {
  ...meta("heuristic-v1"),
  pickAction: heuristicPick,
};

export const STRATEGIES: readonly HungerStrategy[] = [HEURISTIC, RANDOM];

export function getStrategy(id: AIStrategyId | undefined): HungerStrategy {
  return STRATEGIES.find((s) => s.id === id) ?? HEURISTIC;
}

/** The move an AI seat makes now. Falls back to any legal action on a throw. */
export function pickAiAction(state: GameState): Action {
  const seat = getActivePlayer(state);
  const legal = getLegalActions(state, seat);
  if (legal.length === 0) throw new Error("AI has no legal action");
  try {
    const pick = getStrategy(state.players[seat]?.aiStrategy).pickAction(state, seat, legal);
    if (legal.includes(pick)) return pick;
  } catch {
    // Fall through to a safe legal move.
  }
  return legal.find((a) => a.type === "end-turn") ?? legal[0];
}
