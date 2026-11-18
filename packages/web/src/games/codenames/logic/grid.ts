import type { CodenamesPlayerView } from "@boardgames/core/games/codenames/types";
import type { CardNote, CardPointer, GridCard } from "../table";
import { seatLabel, TEAM_TONE, toneOf } from "./labels";
import { recentTouches } from "./table";

// The live board's cards from one seat's view: covers, the key (for a
// spymaster who shows it), pointers and sticky notes, the clue-giver's chosen
// targets, an armed or opened strip clue, and the latest touches in order.
// Pure, so the board component only wires taps to actions.

export interface GridContext {
  names: readonly (string | null)[];
  images: readonly (string | null)[];
  showKey: boolean;
  /** The clue-giver's chosen targets. */
  chosen: readonly number[];
  /** The viewer's own pick (its Touch button commits it). */
  picked: number | null;
  /** An operative's armed strip clue (its turn), pinning notes. */
  pinning: number | null;
  /** A spymaster's opened strip clue: its face-down targets. */
  owed: ReadonlySet<number>;
  /** Cards the clue-giver may choose as targets. */
  choosable: (card: number) => boolean;
}

function pointersOn(view: CodenamesPlayerView, card: number, ctx: GridContext): CardPointer[] {
  const seats = (view.cards[card]?.marks ?? []).filter((seat) => seat !== view.seat);
  if (ctx.picked === card) seats.unshift(view.seat);
  return seats.map((seat) => ({
    key: String(seat),
    name: seatLabel(seat, ctx.names),
    image: ctx.images[seat] ?? null,
    mine: seat === view.seat,
  }));
}

function notesOn(view: CodenamesPlayerView, card: number, ctx: GridContext): CardNote[] {
  return [...(view.cards[card]?.notes ?? [])]
    .sort((a, b) => a.turn - b.turn)
    .map((note) => {
      const clue = view.turns[note.turn]?.clue;
      const word = (clue?.word ?? "?").toUpperCase();
      const count = clue ? ` ${clue.count === "unlimited" ? "∞" : clue.count}` : "";
      return {
        key: String(note.turn),
        label: word,
        title: `${word}${count} — pinned by ${note.seat === view.seat ? "you" : seatLabel(note.seat, ctx.names)}`,
      };
    });
}

export function codenamesGridCards(view: CodenamesPlayerView, ctx: GridContext): GridCard[] {
  const recent = recentTouches(view);
  const appeal = view.appeal;
  return view.cards.map((card, i) => {
    const faceDown = card.revealed === null;
    return {
      word: card.word,
      cover: card.revealed === null ? null : toneOf(card.revealed),
      keyTone: faceDown && card.key !== null && ctx.showKey ? toneOf(card.key) : null,
      pointers: pointersOn(view, i, ctx),
      notes: notesOn(view, i, ctx),
      pickable: faceDown && (ctx.choosable(i) || view.canGuess || ctx.pinning !== null),
      chosen: ctx.chosen.includes(i),
      selected: ctx.picked === i && ctx.pinning === null,
      pinned: ctx.pinning !== null && card.notes.some((n) => n.turn === ctx.pinning),
      owed: faceDown && ctx.owed.has(i),
      ...(recent?.order.has(i)
        ? { touch: recent.order.get(i) as number, touchTone: TEAM_TONE[recent.team] }
        : {}),
      // The two spymasters weighing a clue question see the word it brushes.
      ...(appeal?.clash && faceDown && card.word === appeal.clash ? { target: true } : {}),
    };
  });
}
