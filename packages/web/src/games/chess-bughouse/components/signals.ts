import type { SignalCode } from "@boardgames/core/games/chess-bughouse/schemas";

/** Button text and the line shown to the partner, per signal. */
export const SIGNAL_TEXT: Readonly<
  Record<SignalCode, { button: string; said: string; tip: string }>
> = {
  "need-p": { button: "Need ♟", said: "needs a pawn", tip: "Ask your partner for a pawn" },
  "need-n": { button: "Need ♞", said: "needs a knight", tip: "Ask your partner for a knight" },
  "need-b": { button: "Need ♝", said: "needs a bishop", tip: "Ask your partner for a bishop" },
  "need-r": { button: "Need ♜", said: "needs a rook", tip: "Ask your partner for a rook" },
  "need-q": { button: "Need ♛", said: "needs a queen", tip: "Ask your partner for a queen" },
  sit: {
    button: "Sit!",
    said: "says sit — don't move",
    tip: "Ask your partner to stop moving for now",
  },
  go: { button: "Go!", said: "says go — play fast", tip: "Ask your partner to play fast" },
};
