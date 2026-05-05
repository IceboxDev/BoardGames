// Schemas and types live in core. The hand-rolled parsers (parseAggregate,
// parseAttendee, fetchAvailableGames body) that used to defend this file
// are gone — `apiFetch` validates through the schema instead.

import {
  AvailableGamesSchema,
  GameReactionBodySchema,
  OkResponseSchema,
  type ReactionKind,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export type {
  Attendee,
  AttendeeStatus,
  AvailableGames,
  ReactionAggregate,
  ReactionKind,
} from "@boardgames/core/protocol";

export async function fetchAvailableGames(date: string, signal?: AbortSignal) {
  return apiFetch(`/api/calendar/games?date=${encodeURIComponent(date)}`, {
    response: AvailableGamesSchema,
    signal,
  });
}

export async function setGameReaction(
  date: string,
  slug: string,
  reaction: ReactionKind,
  on: boolean,
) {
  return apiFetch("/api/calendar/games/reaction", {
    method: "POST",
    body: { date, slug, reaction, on },
    request: GameReactionBodySchema,
    response: OkResponseSchema,
  });
}
