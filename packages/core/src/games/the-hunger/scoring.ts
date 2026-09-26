// ---------------------------------------------------------------------------
// Final scoring: End-of-the-Game card effects, Public and personal Missions,
// Human tokens, then sunrise.
// ---------------------------------------------------------------------------

import { graphFor, space } from "./board";
import { bonusDef } from "./content/bonus-tokens";
import { cardDef } from "./content/cards";
import { missionDef } from "./content/missions";
import {
  type CardDef,
  type Fate,
  type GameState,
  HUMAN_CATEGORIES,
  type HumanCategory,
  type HumanKeyword,
  type HungerResult,
  type MajorityOf,
  type MissionCondition,
  type PlayerState,
  type SeatBreakdown,
} from "./types";

export interface Tally {
  /** Hunted Humans by type, Human tokens included. */
  humans: Record<HumanCategory, number>;
  humanTotal: number;
  /** The real Human cards — tokens have no printed VP and no keywords. */
  humanCards: CardDef[];
  familiars: number;
  powers: number;
  distinctFamiliars: number;
  distinctPowers: number;
  digestedHumans: number;
  bonus: number;
  hasRose: boolean;
  castleOrder: number | null;
}

function emptyHumans(): Record<HumanCategory, number> {
  return { villager: 0, religious: 0, military: 0, noble: 0 };
}

function ownedCards(p: PlayerState): string[] {
  return [...p.deck, ...p.hand, ...p.playArea.map((c) => c.id), ...p.discard, ...p.digested];
}

/**
 * What a Vampire has hunted: every non-Starting card it owns (Digested ones
 * included), with Human tokens — and chosen choice tokens — counted in.
 */
export function tally(p: PlayerState, choices: HumanCategory[] = []): Tally {
  const humans = emptyHumans();
  const humanCards: CardDef[] = [];
  const familiarIds = new Set<string>();
  const powerIds = new Set<string>();
  let familiars = 0;
  let powers = 0;
  let hasRose = false;
  for (const id of ownedCards(p)) {
    const def = cardDef(id);
    if (def.type === "human" && def.category) {
      humans[def.category] += 1;
      humanCards.push(def);
    }
    if (def.type === "familiar") {
      familiars += 1;
      familiarIds.add(def.id);
    }
    if (def.type === "power") {
      powers += 1;
      powerIds.add(def.id);
    }
    if (def.family === "rose") hasRose = true;
  }
  let choice = 0;
  for (const b of p.bonus) {
    const kind = bonusDef(b.id).bonus;
    if (kind.kind === "human") humans[kind.category] += 1;
    if (kind.kind === "human-choice") {
      const cat = b.chosen ?? choices[choice++];
      if (cat) humans[cat] += 1;
    }
  }
  return {
    humans,
    humanTotal: HUMAN_CATEGORIES.reduce((sum, c) => sum + humans[c], 0),
    humanCards,
    familiars,
    powers,
    distinctFamiliars: familiarIds.size,
    distinctPowers: powerIds.size,
    digestedHumans: p.digested.filter((id) => cardDef(id).type === "human").length,
    bonus: p.bonus.length,
    hasRose,
    castleOrder: p.castleOrder,
  };
}

/** End-of-game card effects count real cards only; tokens are for Missions. */
/** Each End-of-the-Game card and what it scores (real cards only; tokens are for Missions). */
export function cardBonusLines(p: PlayerState): { card: string; vp: number }[] {
  const cards = ownedCards(p);
  const owned = cards.map(cardDef);
  const ids = new Set(owned.map((d) => d.id));
  const out: { card: string; vp: number }[] = [];
  cards.forEach((card, i) => {
    const e = owned[i].endGame;
    if (!e) return;
    let vp = 0;
    if (e.kind === "if-has" && ids.has(e.other)) vp = e.vp;
    if (e.kind === "if-family" && owned.some((d) => d.family === e.family)) vp = e.vp;
    if (e.kind === "per-category") {
      vp = e.vp * owned.filter((d) => d.type === "human" && d.category === e.category).length;
    }
    if (e.kind === "per-family") vp = e.vp * owned.filter((d) => d.family === e.family).length;
    out.push({ card, vp });
  });
  return out;
}

export function cardBonuses(p: PlayerState): number {
  return cardBonusLines(p).reduce((sum, l) => sum + l.vp, 0);
}

/** Everything a Mission may compare against. */
export interface MissionContext {
  me: Tally;
  others: readonly Tally[];
  /** Score before Missions: the night + sunrise + card bonuses. */
  preScore: number;
  otherPreScores: readonly number[];
}

/** Strictly more than every other Vampire — a tie is not enough. */
function strictlyMost(mine: number, others: readonly number[]): boolean {
  return others.every((o) => mine > o);
}

function strictlyFewest(mine: number, others: readonly number[]): boolean {
  return others.every((o) => mine < o);
}

function majorityCount(t: Tally, of: MajorityOf): number {
  if (of === "humans") return t.humanTotal;
  if (of === "familiars") return t.familiars;
  return t.humans[of];
}

function hasKeyword(def: CardDef, keyword: HumanKeyword): boolean {
  return def.keywords.includes(keyword);
}

/** One standard Mission's VP. Missionary is scored by `scoreMissions`. */
export function missionScore(cond: MissionCondition, vp: number, ctx: MissionContext): number {
  const { me, others } = ctx;
  const counts = HUMAN_CATEGORIES.map((c) => me.humans[c]);
  switch (cond.kind) {
    case "per-category":
      return cond.vpEach * me.humans[cond.category];
    case "majority":
      return strictlyMost(
        majorityCount(me, cond.of),
        others.map((o) => majorityCount(o, cond.of)),
      )
        ? vp
        : 0;
    case "fewest-humans":
      return strictlyFewest(
        me.humanTotal,
        others.map((o) => o.humanTotal),
      )
        ? vp
        : 0;
    case "has-rose":
      return me.hasRose ? vp : 0;
    case "host": {
      const mine = me.castleOrder;
      if (mine === null) return 0;
      const beaten = others.filter((o) => o.castleOrder === null || o.castleOrder > mine).length;
      return vp + cond.perBeaten * beaten;
    }
    case "per-bonus":
      return cond.vpEach * me.bonus;
    case "per-human-worth":
      return (
        cond.vpEach *
        me.humanCards.filter(
          (d) => d.vp >= cond.min && (cond.max === undefined || d.vp <= cond.max),
        ).length
      );
    case "none-worth":
      return me.humanCards.some((d) => d.vp >= cond.atLeast) ? 0 : vp;
    case "same-type":
      return counts.some((n) => n >= cond.atLeast) ? vp : 0;
    case "per-keyword":
      return (
        cond.vpEach *
        me.humanCards.filter((d) => cond.keywords.some((k) => hasKeyword(d, k))).length
      );
    case "per-distinct":
      return cond.vpEach * (cond.type === "power" ? me.distinctPowers : me.distinctFamiliars);
    case "least-type":
      return cond.vpEach * Math.min(...counts);
    case "most-type":
      return cond.vpEach * Math.max(...counts);
    case "score-rank":
      return (cond.rank === "highest" ? strictlyMost : strictlyFewest)(
        ctx.preScore,
        ctx.otherPreScores,
      )
        ? vp
        : 0;
    case "count-humans":
      return me.humanTotal >= cond.atLeast ? vp : 0;
    case "missionary":
      return 0;
    case "sets":
      return cond.vpEach * Math.min(...counts);
    case "per-digested":
      return cond.vpEach * me.digestedHumans;
    case "first-home":
      return me.castleOrder === 1 ? vp : 0;
  }
}

/**
 * A set of Mission tiles' VP. Missionary scores 1 per tile in the same set
 * scoring 1+, itself included (it always scores at least its own 1).
 */
/** Each standard Mission tile in a set and what it scores (Instants score nothing). */
export function missionLines(
  ids: readonly string[],
  ctx: MissionContext,
): { id: string; vp: number }[] {
  const lines = ids.map((id) => {
    const def = missionDef(id);
    const c = def.standard;
    return { id, vp: c && c.kind !== "missionary" ? missionScore(c, def.vp, ctx) : 0 };
  });
  const missionaries = ids.filter((id) => missionDef(id).standard?.kind === "missionary").length;
  const scoring = lines.filter((l) => l.vp > 0).length;
  return lines.map((l) =>
    missionDef(l.id).standard?.kind === "missionary" ? { ...l, vp: scoring + missionaries } : l,
  );
}

export function scoreMissions(ids: readonly string[], ctx: MissionContext): number {
  return missionLines(ids, ctx).reduce((sum, l) => sum + l.vp, 0);
}

function choiceCount(p: PlayerState): number {
  return p.bonus.filter((b) => bonusDef(b.id).bonus.kind === "human-choice" && !b.chosen).length;
}

/** Every assignment of `k` choice tokens to Human types. */
function assignments(k: number): HumanCategory[][] {
  if (k === 0) return [[]];
  return assignments(k - 1).flatMap((rest) => HUMAN_CATEGORIES.map((c) => [c, ...rest]));
}

/** The night's VP, sunrise and card bonuses: the score "before Missions". */
export function preMissionScores(state: GameState): number[] {
  return state.players.map((p) => p.vp + fateOf(state, p).delta + cardBonuses(p));
}

function contextFor(
  seat: number,
  tallies: readonly Tally[],
  pre: readonly number[],
): MissionContext {
  return {
    me: tallies[seat],
    others: tallies.filter((_, i) => i !== seat),
    preScore: pre[seat],
    otherPreScores: pre.filter((_, i) => i !== seat),
  };
}

/**
 * Fix each choice token's type to whatever scores the owner most, given the
 * other Vampires' counts. Stored on the token: once chosen it cannot change.
 */
export function resolveChoiceTokens(state: GameState): void {
  const base = state.players.map((p) => tally(p));
  const pre = preMissionScores(state);
  for (const p of state.players) {
    const k = choiceCount(p);
    if (k === 0) continue;
    let best: HumanCategory[] = [];
    let bestVp = Number.NEGATIVE_INFINITY;
    for (const pick of assignments(k)) {
      const tallies = base.map((t, i) => (i === p.index ? tally(p, pick) : t));
      const ctx = contextFor(p.index, tallies, pre);
      const vp = scoreMissions(state.publicMissions, ctx) + scoreMissions(p.missions, ctx);
      if (vp > bestVp) {
        bestVp = vp;
        best = pick;
      }
    }
    let i = 0;
    for (const b of p.bonus) {
      if (bonusDef(b.id).bonus.kind === "human-choice" && !b.chosen) b.chosen = best[i++];
    }
  }
}

/** Mission VP for `seat` right now — the AI's running estimate. */
export function missionContext(state: GameState, seat: number): MissionContext {
  return contextFor(
    seat,
    state.players.map((p) => tally(p)),
    preMissionScores(state),
  );
}

export function fateOf(state: GameState, p: PlayerState): { fate: Fate; delta: number } {
  const g = graphFor(state.options);
  const s = space(g, p.pos);
  if (s.region === "castle") return { fate: "castle", delta: 0 };
  if (s.region === "cemetery") return { fate: "cemetery", delta: -5 };
  if (s.region === "mountains") {
    if (state.options.mode === "rookie")
      return { fate: "mountains", delta: -(s.mountainPenalty ?? 0) };
    if (state.options.beginnerSafeMountains) return { fate: "mountains", delta: 0 };
  }
  return { fate: "ashes", delta: 0 };
}

export function computeResult(state: GameState): HungerResult {
  resolveChoiceTokens(state);
  const tallies = state.players.map((p) => tally(p));
  const pre = preMissionScores(state);
  const g = graphFor(state.options);
  const breakdown: SeatBreakdown[] = state.players.map((p) => {
    const ctx = contextFor(p.index, tallies, pre);
    const cardLines = cardBonusLines(p);
    const cards = cardLines.reduce((sum, l) => sum + l.vp, 0);
    const publicLines = missionLines(state.publicMissions, ctx);
    const personalLines = missionLines(p.missions, ctx);
    const pub = publicLines.reduce((sum, l) => sum + l.vp, 0);
    const personal = personalLines.reduce((sum, l) => sum + l.vp, 0);
    const { fate, delta } = fateOf(state, p);
    state.log.push({ t: "sunrise", p: p.index, fate, delta });
    return {
      duringPlay: p.vp,
      cardBonuses: cards,
      publicMissions: pub,
      personalMissions: personal,
      sunrise: delta,
      fate,
      missions: [
        ...publicLines.map((l) => ({ ...l, public: true })),
        ...personalLines.map((l) => ({ ...l, public: false })),
        ...p.usedMissions.map((id) => ({ id, vp: 0, public: false, used: true })),
      ],
      cards: cardLines,
      total: p.vp + cards + pub + personal + delta,
    };
  });

  // Survivors outrank the ashes; then score; then earlier Castle arrival;
  // then closeness to the Castle.
  const rank = [...state.players].sort((a, b) => {
    const ba = breakdown[a.index];
    const bb = breakdown[b.index];
    const sa = ba.fate === "ashes" ? 1 : 0;
    const sb = bb.fate === "ashes" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (ba.total !== bb.total) return bb.total - ba.total;
    const ca = a.castleOrder ?? Number.POSITIVE_INFINITY;
    const cb = b.castleOrder ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    return (g.castleDist.get(a.pos) ?? 99) - (g.castleDist.get(b.pos) ?? 99);
  });
  const key = (p: PlayerState) => {
    const b = breakdown[p.index];
    return [
      b.fate === "ashes" ? 1 : 0,
      b.total,
      p.castleOrder ?? -1,
      g.castleDist.get(p.pos) ?? 99,
    ].join("|");
  };
  const placements = new Array<number>(state.players.length).fill(0);
  rank.forEach((p, i) => {
    const prev = rank[i - 1];
    placements[p.index] = prev && key(prev) === key(p) ? placements[prev.index] : i + 1;
  });
  const winners = rank.filter((p) => placements[p.index] === 1).map((p) => p.index);
  return {
    scores: breakdown.map((b) => b.total),
    winner: winners.length === 1 ? winners[0] : null,
    winners,
    placements,
    breakdown,
  };
}
