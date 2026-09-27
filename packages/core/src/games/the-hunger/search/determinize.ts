import { graphFor } from "../board";
import { BONUS_TOKENS } from "../content/bonus-tokens";
import { expand } from "../content/cards";
import { MISSIONS } from "../content/missions";
import type { GameState } from "../types";
import { cloneState } from "./clone";

// Sample one complete world consistent with what `observer` can see
// (`player-view.ts` is the definition of hidden). Everything the seat can't
// see is pooled and redealt into the same slots with the same sizes:
//
//   - the Hunt deck and the face-down Tavern (one pool);
//   - its own deck order, and each rival's hand + deck (per rival — their
//     contents are public knowledge in aggregate, only the split and order
//     are not);
//   - face-down Chest tokens (from every token not visibly accounted for);
//   - rivals' personal Missions, the Crypt piles and unresolved setup offers
//     (from every Mission tile the seat has not seen);
//   - the RNG, so future reshuffles differ between worlds.
//
// A search that only ever reads states from here cannot peek: pools are
// sorted before shuffling, so two true states with the same view yield the
// same world for the same random stream.

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Shuffle a pool from a canonical (sorted) order, so the sample depends only on the pool's contents. */
function shuffle(arr: string[], rand: Rand): string[] {
  arr.sort();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function determinize(state: GameState, observer: number, rand: Rand): GameState {
  const w = cloneState(state);
  const g = graphFor(w.options);

  // Hunt deck + Tavern.
  const hunt = shuffle([...w.huntDeck, ...w.tavern], rand);
  w.tavern = hunt.splice(0, w.tavern.length);
  w.huntDeck = hunt;

  // Decks and rivals' hands.
  for (const p of w.players) {
    if (p.index === observer) {
      shuffle(p.deck, rand);
    } else {
      const pool = shuffle([...p.hand, ...p.deck], rand);
      p.hand = pool.splice(0, p.hand.length);
      p.deck = pool;
    }
  }

  // Face-down Chest tokens.
  const faceDown = g.def.spaces
    .filter((s) => s.effect === "chest" && w.chests[s.id] != null)
    .map((s) => s.id);
  if (faceDown.length > 0) {
    const seen = new Set<string>();
    for (const p of w.players) for (const b of p.bonus) seen.add(b.id);
    for (const s of g.def.spaces) {
      const t = w.chests[s.id];
      if (s.effect === "chest-open" && t) seen.add(t);
    }
    const pool = shuffle(
      expand(BONUS_TOKENS).filter((t) => !seen.has(t)),
      rand,
    );
    for (const id of faceDown) w.chests[id] = pool.pop() ?? null;
  }

  // Mission tiles.
  const me = w.players[observer];
  const seenM = new Set<string>([...w.publicMissions, ...me.missions]);
  for (const p of w.players) for (const m of p.usedMissions) seenM.add(m);
  if (w.setupOffers[observer]) for (const m of w.setupOffers[observer]) seenM.add(m);
  const pick = w.current?.player === observer ? w.current.missionPick : null;
  if (pick) for (const m of pick.offered) seenM.add(m);
  const n = w.players.length;
  const pool = shuffle(
    MISSIONS.filter((m) => n >= 5 || !m.fivePlus)
      .map((m) => m.id)
      .filter((id) => !seenM.has(id)),
    rand,
  );
  for (const p of w.players) {
    if (p.index !== observer) p.missions = pool.splice(0, p.missions.length);
  }
  w.setupOffers = w.setupOffers.map((o, i) => (i === observer ? o : pool.splice(0, o.length)));
  for (const k in w.crypts) w.crypts[k] = pool.splice(0, w.crypts[k].length);
  if (w.current && w.current.player !== observer && w.current.missionPick) {
    w.current.missionPick.offered = pool.splice(0, w.current.missionPick.offered.length);
  }

  w.rng = Math.floor(rand() * 0x100000000) | 0;
  return w;
}
