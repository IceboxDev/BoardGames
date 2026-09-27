import { graphFor } from "./board";
import { cardDef } from "./content/cards";
import { cardSpeed } from "./rules";
import { tally } from "./scoring";
import type { CardId, GameState, HungerPlayerView } from "./types";

/**
 * Project the state for one seat. Hidden: every draw deck's order, other
 * Vampires' hands and Missions (revealed Instant Missions stay public), the
 * Tavern's face-down cards, the Hunt deck, face-down Chest tokens, and the
 * seed. Hunt Track piles may always be inspected. Seat -1 is a spectator.
 */
const KIND_ORDER = ["starting", "power", "familiar", "item", "human"];

/** A pile as an unordered list: by kind, then name, then copy. */
function sortedPile(cards: readonly CardId[]): CardId[] {
  return [...cards].sort((a, b) => {
    const da = cardDef(a);
    const db = cardDef(b);
    return (
      KIND_ORDER.indexOf(da.type) - KIND_ORDER.indexOf(db.type) ||
      da.name.localeCompare(db.name) ||
      a.localeCompare(b)
    );
  });
}

function publicCounts(p: GameState["players"][number]) {
  const t = tally(p);
  const owned = [...p.deck, ...p.hand, ...p.playArea.map((c) => c.id), ...p.discard];
  const permanent = owned.filter((id) => cardDef(id).keywords.includes("permanent"));
  const cycling = owned.filter((id) => !cardDef(id).keywords.includes("permanent"));
  const speedOf = (id: CardId) => cardSpeed(id, false);
  const mean =
    cycling.length > 0 ? cycling.reduce((s, id) => s + speedOf(id), 0) / cycling.length : 0;
  return {
    humans: t.humans,
    familiars: t.familiars,
    powers: t.powers,
    hasRose: t.hasRose,
    expectedSpeed:
      Math.round((3 * mean + permanent.reduce((s, id) => s + speedOf(id), 0)) * 10) / 10,
  };
}

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
      // Everything a Vampire owns is known, so its draw pile's contents are
      // too — but never their order.
      drawPile: sortedPile(p.deck),
      handCount: p.hand.length,
      discard: [...p.discard],
      digested: [...p.digested],
      playArea: p.playArea.map((c) => ({ ...c })),
      missionCount: p.missions.length,
      usedMissions: [...p.usedMissions],
      bonus: p.bonus.map((b) => ({ ...b })),
      hunted: p.hunted,
      ...publicCounts(p),
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
