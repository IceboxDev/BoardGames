import type {
  ArrivalGreeting,
  ArrivalPurchaser,
  ArrivalVoterFace,
} from "@boardgames/core/protocol";
import { DEFAULT_ACCENT } from "../../lib/accent.ts";
import { apiUrl } from "../../lib/api-base.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";

// What the takeover renders: one card per arrived game, with everything the
// wire leaves to the client already resolved — the title and accent come
// from the catalog (a retired slug degrades to its slug and the app accent),
// and the photo path becomes a fetchable URL. The admin composer builds the
// same shape from its draft (data-URI photos, the poll's live tally) so the
// preview button shows exactly what members will get.

export type ArrivalCard = {
  slug: string;
  title: string;
  accentHex: string;
  purchaser: ArrivalPurchaser;
  votes: number;
  voters: ArrivalVoterFace[];
  photoSrc: string;
  placeholder: string;
  width: number;
  height: number;
};

export type ArrivalTotals = ArrivalGreeting["totals"];

export function toArrivalCards(greeting: ArrivalGreeting): ArrivalCard[] {
  return greeting.games.map((game) => {
    const def = resolveGame(game.slug);
    return {
      slug: game.slug,
      title: def?.title ?? game.slug,
      accentHex: def?.accentHex ?? DEFAULT_ACCENT,
      purchaser: game.purchaser,
      votes: game.votes,
      voters: game.voters,
      photoSrc: apiUrl(game.photoUrl),
      placeholder: game.placeholder,
      width: game.width,
      height: game.height,
    };
  });
}
