/**
 * What the player strips say about offers and presence: a draw offered or
 * asked of you, a takeback asked, a refusal, an opponent who left. The words
 * live here, pure, so every case is unit-tested; `useOfferNotices` keeps the
 * little state a refusal needs (what you sent, the view before).
 */
import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import type { Tone } from "../../../components/ui/tones";

export interface StripStatus {
  readonly text: string;
  readonly tone: Tone;
}

/** The parts of a view an offer depends on. */
export interface OfferState {
  readonly drawOffer: Color | null;
  readonly takebackRequest: Color | null;
  readonly plies: number;
  readonly over: boolean;
}

export const offerState = (v: ChessPlayerView): OfferState => ({
  drawOffer: v.drawOffer,
  takebackRequest: v.takebackRequest,
  plies: v.history.length,
  over: v.result !== null,
});

/** An offer this browser just sent, before the server's answer arrived. */
export type SentOffer = "draw" | "takeback" | null;

const other = (c: Color): Color => (c === "w" ? "b" : "w");

/** What each strip says while an offer or request stands. */
export function standingStatus(state: OfferState, me: Color): Record<Color, StripStatus | null> {
  const them = other(me);
  const out: Record<Color, StripStatus | null> = { w: null, b: null };
  if (state.over) return out;
  if (state.drawOffer === me) out[me] = { text: "½ Draw offered", tone: "neutral" };
  if (state.drawOffer === them) out[them] = { text: "Offers a draw", tone: "accent" };
  if (state.takebackRequest === me) out[me] = { text: "Asked to take back", tone: "neutral" };
  if (state.takebackRequest === them) out[them] = { text: "Asks to take back", tone: "accent" };
  return out;
}

/**
 * The opponent's answer to an offer of yours that has just gone: refused
 * outright, or lapsed because they moved. An accepted draw ends the game and
 * an allowed takeback takes moves off — neither needs words.
 */
export function refusal(
  prev: OfferState,
  next: OfferState,
  sent: SentOffer,
  me: Color,
  opponentIsAi: boolean,
): StripStatus | null {
  if (next.over) return null;
  const offeredDraw = sent === "draw" || prev.drawOffer === me;
  if (offeredDraw && next.drawOffer !== me) {
    return {
      text: opponentIsAi ? "Declines: it isn't worse" : "Declined your draw",
      tone: "neutral",
    };
  }
  const askedTakeback = sent === "takeback" || prev.takebackRequest === me;
  if (askedTakeback && next.takebackRequest !== me && next.plies >= prev.plies) {
    return { text: "Refused the takeback", tone: "neutral" };
  }
  return null;
}

/** `m:ss` left before the opponent may claim the game. */
export function claimCountdown(claimAt: number, now: number): string {
  const s = Math.max(0, Math.ceil((claimAt - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
