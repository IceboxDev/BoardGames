import { graphFor } from "./board";
import { tally } from "./scoring";
import type { GameState, HungerPlayerView } from "./types";

/**
 * Project the state for one seat. Hidden: every draw deck's order, other
 * Vampires' hands and Missions (revealed Instant Missions stay public), the
 * Tavern's face-down cards, the Hunt deck, face-down Chest tokens, and the
 * seed. Hunt Track piles may always be inspected. Seat -1 is a spectator.
 */
export function buildPlayerView(state: GameState, seat: number): HungerPlayerView {
  const me = state.players[seat];
  const open = new Set(
    graphFor(state.options)
      .def.spaces.filter((s) => s.effect === "chest-open")
      .map((s) => s.id),
  );
  const chests: Record<string, string | null> = {};
  for (const [spaceId, token] of Object.entries(state.chests)) {
    chests[spaceId] = token === null ? null : open.has(spaceId) ? token : "hidden";
  }
  const current = state.current
    ? {
        ...state.current,
        // Mission tiles in an exchange are the chooser's secret.
        missionPick:
          state.current.player === seat && state.current.missionPick
            ? { ...state.current.missionPick, offered: [...state.current.missionPick.offered] }
            : null,
        readyQueue: [...state.current.readyQueue],
        pushQueue: [...state.current.pushQueue],
        nannyQueue: [...state.current.nannyQueue],
        trackHunts: state.current.trackHunts.map((h) => ({ ...h })),
        huntedHumans: state.current.huntedHumans.map((h) => ({ ...h })),
      }
    : null;
  return {
    me: me ? seat : -1,
    options: { ...state.options },
    turn: state.turn,
    phase: state.phase,
    players: state.players.map((p) => ({
      index: p.index,
      type: p.type,
      aiStrategy: p.aiStrategy,
      vampire: p.vampire,
      pos: p.pos,
      placedAt: p.placedAt,
      resting: p.resting,
      vp: p.vp,
      castleTile: p.castleTile,
      deckCount: p.deck.length,
      handCount: p.hand.length,
      discard: [...p.discard],
      digested: [...p.digested],
      playArea: p.playArea.map((c) => ({ ...c })),
      missionCount: p.missions.length,
      usedMissions: [...p.usedMissions],
      bonus: p.bonus.map((b) => ({ ...b })),
      hunted: p.hunted,
      humans: tally(p).humans,
    })),
    order: [...state.order],
    current,
    hand: me ? [...me.hand] : [],
    deckCount: me ? me.deck.length : 0,
    missions: me ? [...me.missions] : [],
    track: state.track.map((row) => row.map((pile) => [...pile])),
    huntDeckCount: state.huntDeck.length,
    tavernCount: state.tavern.length,
    roses: [...state.roses],
    chests,
    crypts: Object.fromEntries(
      Object.entries(state.crypts).map(([crypt, pile]) => [crypt, pile.length]),
    ),
    publicMissions: [...state.publicMissions],
    castleTiles: [...state.castleTiles],
    log: state.log,
    result: state.result,
  };
}
