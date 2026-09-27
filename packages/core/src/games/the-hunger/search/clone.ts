import type { GameState, PlayCard, PlayerState, TurnState } from "../types";

// A hand-written deep copy of `GameState` for search. `structuredClone` is the
// engine's general-purpose clone and dominates the cost of an apply; this one
// knows the shape, shares what never mutates (`options`, a finished
// `result`), and starts an empty `log` (search never reads it).
//
// Every mutable field MUST be copied here — `clone.test.ts` diffs this
// against `structuredClone` over whole games, so a new field that is not
// copied fails the build instead of aliasing across search branches.

const copyPlay = (c: PlayCard): PlayCard => ({ ...c });

function copyPlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    deck: p.deck.slice(),
    hand: p.hand.slice(),
    playArea: p.playArea.map(copyPlay),
    discard: p.discard.slice(),
    digested: p.digested.slice(),
    missions: p.missions.slice(),
    usedMissions: p.usedMissions.slice(),
    bonus: p.bonus.map((b) => ({ ...b })),
  };
}

function copyTurn(t: TurnState): TurnState {
  return {
    ...t,
    huntedHumans: t.huntedHumans.map((h) => ({ ...h })),
    trackHunts: t.trackHunts.map((h) => ({ ...h })),
    nannyQueue: t.nannyQueue.slice(),
    pushQueue: t.pushQueue.slice(),
    readyQueue: t.readyQueue.slice(),
    missionPick: t.missionPick
      ? { ...t.missionPick, offered: t.missionPick.offered.slice() }
      : null,
  };
}

export function cloneState(s: GameState): GameState {
  const crypts: Record<string, string[]> = {};
  for (const k in s.crypts) crypts[k] = s.crypts[k].slice();
  return {
    ...s,
    setupOffers: s.setupOffers.map((o) => o.slice()),
    players: s.players.map(copyPlayer),
    order: s.order.slice(),
    current: s.current ? copyTurn(s.current) : null,
    track: s.track.map((row) => row.map((pile) => pile.slice())),
    huntDeck: s.huntDeck.slice(),
    tavern: s.tavern.slice(),
    roses: s.roses.slice(),
    chests: { ...s.chests },
    crypts,
    publicMissions: s.publicMissions.slice(),
    castleTiles: s.castleTiles.slice(),
    log: [],
  };
}
