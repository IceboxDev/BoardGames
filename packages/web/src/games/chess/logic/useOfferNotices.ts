import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { ChessAction, ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  claimCountdown,
  type OfferState,
  offerState,
  refusal,
  type SentOffer,
  type StripStatus,
  standingStatus,
} from "./offer-notices";

/** How long a refusal stays on the opponent's strip (it also goes on their next move). */
export const REFUSAL_MS = 4_000;

/**
 * Each strip's status line for a live game, and a `send` that remembers the
 * offers this browser makes (an AI refuses before any view shows the offer).
 */
export function useOfferNotices(
  view: ChessPlayerView,
  me: Color | null,
  opponentIsAi: boolean,
  send: (action: ChessAction) => void,
): { status: Record<Color, StripStatus | null>; send: (action: ChessAction) => void } {
  const sent = useRef<SentOffer>(null);
  const prev = useRef<OfferState>(offerState(view));
  const [refused, setRefused] = useState<{ status: StripStatus; plies: number } | null>(null);

  useEffect(() => {
    const next = offerState(view);
    if (me) {
      const r = refusal(prev.current, next, sent.current, me, opponentIsAi);
      if (r) setRefused({ status: r, plies: next.plies });
    }
    sent.current = null;
    prev.current = next;
  }, [view, me, opponentIsAi]);

  useEffect(() => {
    if (!refused) return;
    const t = setTimeout(() => setRefused(null), REFUSAL_MS);
    return () => clearTimeout(t);
  }, [refused]);

  const tracked = useCallback(
    (action: ChessAction) => {
      if (action.kind === "offer-draw") sent.current = "draw";
      if (action.kind === "request-takeback") sent.current = "takeback";
      send(action);
    },
    [send],
  );

  // The absent opponent's countdown ticks once a second.
  const them: Color | null = me ? (me === "w" ? "b" : "w") : null;
  const theirSeat = them ? view.seatColors.indexOf(them) : -1;
  const claimAt = view.claimAtMs?.[theirSeat] ?? null;
  const gone = theirSeat >= 0 && view.disconnected.includes(theirSeat);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!gone || claimAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [gone, claimAt]);

  const status: Record<Color, StripStatus | null> = me
    ? standingStatus(offerState(view), me)
    : { w: null, b: null };
  if (them && view.result === null) {
    if (refused && refused.plies === view.history.length) status[them] = refused.status;
    if (gone) {
      status[them] =
        theirSeat >= 0 && view.abandoned.includes(theirSeat)
          ? { text: "Left the game", tone: "amber" }
          : claimAt !== null && claimAt > now
            ? { text: `Disconnected · claim in ${claimCountdown(claimAt, now)}`, tone: "amber" }
            : { text: "Disconnected", tone: "amber" };
    }
  }
  return { status, send: tracked };
}
