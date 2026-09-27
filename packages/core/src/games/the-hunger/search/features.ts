import { graphFor } from "../board";
import { bonusDef } from "../content/bonus-tokens";
import { cardDef } from "../content/cards";
import { TURNS } from "../game-engine";
import { cardSpeed } from "../rules";
import { fateOf, type MissionContext, preMissionScores, scoreMissions, tally } from "../scoring";
import type { GameState, PlayerState, TurnStep } from "../types";

// The value net's input: a fixed-length vector describing the game FROM ONE
// SEAT'S POINT OF VIEW. Only what that seat can know goes in —
//   - every Vampire's position, VP, tokens, play area, discard and digested
//     cards (public), and its whole collection only in aggregate (hand + deck
//     together — their split and order are hidden);
//   - the seat's own hand and personal Missions (no one else's);
//   - the Hunt Track, face-up Chests, counts of face-down things.
// Seats are listed ego first, then the others in seat order after it, padded
// to 6 — one network serves every seat and table size.
//
// Bump FEATURE_VERSION whenever the layout changes: trained weights record
// the version they were trained on and refuse to load against another.

export const FEATURE_VERSION = 1;
const MAX_SEATS = 6;
const MAX_ROWS = 7;
const STEPS: readonly TurnStep[] = [
  "manipulate",
  "move",
  "push",
  "act",
  "digest",
  "missions",
  "inspire",
  "ready",
  "nanny",
];
const REGIONS = ["castle", "cemetery", "mountains", "plains", "forest"] as const;
const CATS = ["villager", "religious", "military", "noble"] as const;

export const SEAT_FEATURES = 36;
export const GLOBAL_FEATURES = 16 + MAX_ROWS * 3 * 4 + STEPS.length + 10 + MAX_SEATS * 2;
export const FEATURES = MAX_SEATS * SEAT_FEATURES + GLOBAL_FEATURES;

function collectionStats(p: PlayerState) {
  let count = 0;
  let speedSum = 0;
  let movable = 0;
  let movableSpeed = 0;
  let permSpeed = 0;
  let negative = 0;
  let familiars = 0;
  let powers = 0;
  let rose = 0;
  let endGame = 0;
  const humans = [0, 0, 0, 0];
  const add = (id: string) => {
    const def = cardDef(id);
    const sp = cardSpeed(id, false);
    count++;
    speedSum += sp;
    if (sp < 0) negative++;
    if (def.keywords.includes("permanent")) permSpeed += sp;
    else {
      movable++;
      movableSpeed += sp;
    }
    if (def.type === "human" && def.category) humans[CATS.indexOf(def.category)]++;
    if (def.type === "familiar") familiars++;
    if (def.type === "power") powers++;
    if (def.family === "rose") rose = 1;
    if (def.endGame) endGame++;
  };
  for (const id of p.deck) add(id);
  for (const id of p.hand) add(id);
  for (const c of p.playArea) add(c.id);
  for (const id of p.discard) add(id);
  // Digested cards still count for Missions, not for Speed.
  for (const id of p.digested) {
    const def = cardDef(id);
    if (def.type === "human" && def.category) humans[CATS.indexOf(def.category)]++;
  }
  const expectedHand = permSpeed + (movable > 0 ? (3 * movableSpeed) / movable : 0);
  return {
    count,
    speedSum,
    negative,
    familiars,
    powers,
    rose,
    endGame,
    humans,
    expectedHand,
  };
}

export function encodeView(state: GameState, ego: number, out?: Float32Array): Float32Array {
  const x = out ?? new Float32Array(FEATURES);
  x.fill(0);
  const g = graphFor(state.options);
  const n = state.players.length;
  const turnsLeft = Math.max(0, TURNS - state.turn);
  const toMove = new Set(state.order);
  const tallies = state.players.map((p) => tally(p));
  const pre = preMissionScores(state);
  if (state.current) toMove.add(state.current.player);

  for (let slot = 0; slot < n; slot++) {
    const seat = (ego + slot) % n;
    const p = state.players[seat];
    const o = slot * SEAT_FEATURES;
    const sp = g.spaces.get(p.pos);
    const dist = g.castleDist.get(p.pos) ?? 35;
    const st = collectionStats(p);
    const ctx: MissionContext = {
      me: tallies[seat],
      others: tallies.filter((_, i) => i !== seat),
      preScore: pre[seat],
      otherPreScores: pre.filter((_, i) => i !== seat),
    };
    const fate = fateOf(state, p);
    x[o] = 1;
    x[o + 1] = dist / 35;
    x[o + 2 + REGIONS.indexOf((sp?.region ?? "plains") as (typeof REGIONS)[number])] = 1;
    x[o + 7] = g.wells.has(p.pos) ? 1 : 0;
    x[o + 8] = p.vp / 60;
    x[o + 9] = fate.fate === "ashes" ? 1 : 0;
    x[o + 10] = fate.delta / 5;
    x[o + 11] = (p.castleTile ?? 0) / 10;
    x[o + 12] = p.castleTile !== null ? 1 : 0;
    x[o + 13] = ctx.preScore / 60;
    x[o + 14] = scoreMissions(state.publicMissions, ctx) / 20;
    // Personal Missions: the ego's own score; for rivals only how many they hold.
    x[o + 15] = slot === 0 ? scoreMissions(p.missions, ctx) / 20 : 0;
    x[o + 16] = p.missions.length / 3;
    x[o + 17] = st.count / 30;
    x[o + 18] = st.speedSum / 40;
    x[o + 19] = st.expectedHand / 10;
    x[o + 20] = (dist - turnsLeft * st.expectedHand) / 20;
    x[o + 21] = st.negative / 5;
    for (let c = 0; c < 4; c++) x[o + 22 + c] = st.humans[c] / 6;
    x[o + 26] = st.familiars / 4;
    x[o + 27] = st.powers / 4;
    x[o + 28] = st.rose;
    x[o + 29] = st.endGame / 4;
    let unusedSpeed = 0;
    let unusedHunt = 0;
    let parasol = 0;
    for (const b of p.bonus) {
      const k = bonusDef(b.id).bonus;
      if (k.kind === "parasol") parasol = 1;
      if (b.used) continue;
      if (k.kind === "speed") unusedSpeed += k.n;
      if (k.kind === "extra-hunt") unusedHunt++;
    }
    x[o + 30] = p.bonus.length / 4;
    x[o + 31] = unusedSpeed / 4;
    x[o + 32] = unusedHunt + parasol * 0.5;
    x[o + 33] = toMove.has(seat) ? 1 : 0;
    x[o + 34] = p.playArea.reduce((s, c) => s + cardSpeed(c.id, false), 0) / 10;
    x[o + 35] = p.hunted / 20;
  }

  let o = MAX_SEATS * SEAT_FEATURES;
  x[o++] = state.turn / 16;
  x[o++] = turnsLeft / 15;
  x[o++] = state.options.mode === "elder" ? 1 : 0;
  x[o++] = state.options.beginnerSafeMountains ? 1 : 0;
  x[o + n - 2] = 1; // players one-hot 2..6
  o += 5;
  x[o++] = (state.castleTiles[0] ?? 0) / 10;
  x[o++] = state.castleTiles.length / 5;
  x[o++] = state.tavern.length / 3;
  x[o++] = state.roses.length / 3;
  let faceUp = 0;
  let faceDown = 0;
  for (const s of g.def.spaces) {
    if (!state.chests[s.id]) continue;
    if (s.effect === "chest-open") faceUp++;
    else faceDown++;
  }
  x[o++] = faceUp / 6;
  x[o++] = faceDown / 5;
  x[o++] = state.huntDeck.length / 120;
  // The ego's own hand (known to it).
  x[o++] = state.players[ego].hand.reduce((s, id) => s + cardSpeed(id, false), 0) / 10;
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < 3; c++) {
      const pile = state.track[r]?.[c] ?? [];
      let vp = 0;
      let humans = 0;
      let speed = 0;
      for (const id of pile) {
        const def = cardDef(id);
        vp += def.vp;
        if (def.type === "human") humans++;
        speed += cardSpeed(id, true);
      }
      x[o++] = pile.length / 5;
      x[o++] = vp / 10;
      x[o++] = humans / 3;
      x[o++] = speed / 5;
    }
  }
  const t = state.current;
  if (t) {
    x[o + STEPS.indexOf(t.step)] = 1;
    o += STEPS.length;
    x[o++] = t.speedLeft / 10;
    x[o++] = t.speed / 10;
    x[o++] = t.hunts / 2;
    x[o++] = t.extraHunts / 2;
    x[o++] = t.col1Hunts / 2;
    x[o++] = t.moved ? 1 : 0;
    x[o++] = t.spaceUsed ? 1 : 0;
    x[o++] = t.stage === 2 ? 1 : 0;
    x[o++] = t.extraTurn ? 1 : 0;
    x[o++] = t.confused ? 1 : 0;
    // Whose turn it is and who decides, relative to the ego.
    x[o + ((t.player - ego + n) % n)] = 1;
    x[o + MAX_SEATS + ((t.player - ego + n) % n)] = t.player === ego ? 1 : 0;
  }
  return x;
}
