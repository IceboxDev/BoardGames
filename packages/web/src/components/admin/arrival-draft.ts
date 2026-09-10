import {
  type AdminArrivalPoll,
  type AdminUser,
  ARRIVAL_GAMES_MAX,
  type PublishArrivalBody,
  type SkillPlayerRef,
} from "@boardgames/core/protocol";
import { DEFAULT_ACCENT } from "../../lib/accent";
import { resolveGame } from "../../lib/games-by-slug";
import type { ArrivalCard } from "../arrivals/arrival-view-model";

// The composer's draft, and the pure rules over it, kept out of the React
// component so the gates ("Publish" enabled, which requirement to name next)
// are unit-tested without rendering.

export type DraftPhoto = {
  /** The downscaled upload, ready for the wire. */
  dataUri: string;
  width: number;
  height: number;
  bytes: number;
  /** Wider than tall — it will be cropped to portrait server-side. */
  landscape: boolean;
  fileName: string;
};

export type DraftPhotoStatus = "idle" | "processing" | "error";

export type DraftGame = {
  slug: string;
  purchaserUserId: string | null;
  photo: DraftPhoto | null;
  photoStatus: DraftPhotoStatus;
  photoError: string | null;
};

export function newDraftGame(slug: string, purchaserUserId: string | null): DraftGame {
  return { slug, purchaserUserId, photo: null, photoStatus: "idle", photoError: null };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDraftValid(games: readonly DraftGame[], acquiredOn?: string): boolean {
  return firstUnmetRequirement(games, (slug) => slug, acquiredOn) === null;
}

/**
 * The first thing still missing, as the footer says it — or null when the
 * draft can be published. Checked in reading order: the game list, then each
 * picked game top to bottom (owner, then photo).
 */
export function firstUnmetRequirement(
  games: readonly DraftGame[],
  titleOf: (slug: string) => string,
  /** The "Arrived on" field; omitted by callers that don't show one. */
  acquiredOn?: string,
): string | null {
  if (games.length === 0) return `Pick 1–${ARRIVAL_GAMES_MAX} games`;
  if (games.length > ARRIVAL_GAMES_MAX) return `Pick at most ${ARRIVAL_GAMES_MAX} games`;
  const slugs = new Set<string>();
  for (const game of games) {
    if (slugs.has(game.slug)) return `${titleOf(game.slug)} is picked twice`;
    slugs.add(game.slug);
    const title = titleOf(game.slug);
    if (game.purchaserUserId === null) return `Pick who bought ${title}`;
    if (game.photoStatus === "processing") return `Preparing ${title}'s photo…`;
    if (game.photo === null) return `Add a photo of ${title}`;
  }
  if (acquiredOn !== undefined && !DATE_KEY.test(acquiredOn)) return "Pick the arrival date";
  return null;
}

/** "Ready — 2 games, 1 owner" once everything is in place. */
export function readySummary(games: readonly DraftGame[]): string {
  const owners = new Set(games.map((g) => g.purchaserUserId).filter((id) => id !== null)).size;
  const n = games.length;
  return `Ready — ${n} game${n === 1 ? "" : "s"}, ${owners} owner${owners === 1 ? "" : "s"}`;
}

/** The wire body, or null while a requirement is still unmet. */
export function draftToBody(
  pollId: number,
  games: readonly DraftGame[],
  acquiredOn: string,
): PublishArrivalBody | null {
  if (!isDraftValid(games, acquiredOn)) return null;
  const out: PublishArrivalBody["games"] = [];
  for (const game of games) {
    if (game.purchaserUserId === null || game.photo === null) return null;
    out.push({ slug: game.slug, purchaserUserId: game.purchaserUserId, photo: game.photo.dataUri });
  }
  return { pollId, acquiredOn, games: out };
}

/** What members will see, built from the draft — photos straight from the
 * data URIs, votes and faces from the poll's live tally. */
export function draftToCards(
  games: readonly DraftGame[],
  poll: AdminArrivalPoll,
  players: Record<string, SkillPlayerRef>,
  members: readonly AdminUser[],
): ArrivalCard[] | null {
  const cards: ArrivalCard[] = [];
  for (const game of games) {
    const member = members.find((m) => m.id === game.purchaserUserId);
    if (!member || game.photo === null) return null;
    const entry = poll.tally.find((t) => t.slug === game.slug);
    const def = resolveGame(game.slug);
    cards.push({
      slug: game.slug,
      title: def?.title ?? game.slug,
      accentHex: def?.accentHex ?? DEFAULT_ACCENT,
      purchaser: { id: member.id, name: member.name, image: member.image ?? null, accentHex: null },
      votes: entry?.votes ?? 0,
      voters: (entry?.voterIds ?? []).map((id) => ({
        image: players[id]?.image ?? null,
        accentHex: null,
      })),
      photoSrc: game.photo.dataUri,
      placeholder: game.photo.dataUri,
      width: game.photo.width,
      height: game.photo.height,
    });
  }
  return cards;
}
