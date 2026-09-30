// Route → page-view classification for the activity trail. Pure, so the whole
// route map is pinned by page-classify.test.ts.
//
// Every route a member can reach should classify to something — a route that
// returns null simply vanishes from the admin's picture of the visit (the
// World Geography trainer did, until 2026-09-28). The exceptions are listed
// at the bottom of `classifyRoute`.

import type { PageViewPage, TrainerDeck } from "@boardgames/core/protocol";

export interface ClassifiedView {
  page: PageViewPage;
  detail?: string;
}

/** Games whose `/play/<slug>/solo` shell is a study trainer, not a game vs AI. */
const TRAINER_SOLO_GAMES: Readonly<Record<string, TrainerDeck>> = { quiztopia: "quiztopia" };

/** Game-shell sub-routes (`/play/:slug/<rest>`), first segment → page. */
const PLAY_SUBROUTES: Readonly<Record<string, PageViewPage>> = {
  rules: "play-rules",
  solo: "play-solo",
  companion: "play-companion",
  bga: "play-bga",
  tournament: "play-tournament",
};

/** Trainer sub-routes, first segment after the trainer's base → page. */
const TRAINER_SUBROUTES: Readonly<Record<string, PageViewPage>> = {
  study: "trainer-study",
  wiki: "trainer-wiki",
  timeline: "trainer-timeline",
  explore: "trainer-explore",
};

function trainerView(deck: TrainerDeck, rest: readonly string[]): ClassifiedView {
  const sub = rest[0];
  return { page: (sub && TRAINER_SUBROUTES[sub]) || "trainer", detail: deck };
}

function playView(slug: string, rest: readonly string[]): ClassifiedView {
  const deck = TRAINER_SOLO_GAMES[slug];
  const [first, second] = rest;
  if (first === undefined) return { page: "play", detail: slug };
  if (first === "solo" && deck) return trainerView(deck, rest.slice(1));
  if (first === "mp") {
    if (second === "join") return { page: "play-join", detail: slug };
    if (second === "lobby") return { page: "play-lobby", detail: slug };
    if (second === "play") return { page: "play-room", detail: slug };
    return { page: "play", detail: slug };
  }
  if (first === "match-history") {
    return { page: rest.length > 1 ? "play-replay" : "play-replays", detail: slug };
  }
  return { page: PLAY_SUBROUTES[first] ?? "play", detail: slug };
}

const PROFILE_SUBPAGES: Readonly<Record<string, PageViewPage>> = {
  matches: "profile-matches",
  collection: "profile-collection",
  nights: "profile-nights",
  skill: "profile-skill",
};

/** Map a location to a loggable surface, or null for one that isn't logged. */
export function classifyRoute(pathname: string, search: string): ClassifiedView | null {
  const params = new URLSearchParams(search);
  const segments = pathname.split("/").filter(Boolean);
  const [head, second, ...rest] = segments;

  switch (head) {
    case undefined:
      return { page: "home" };
    case "offline": {
      if (segments.length > 1) return null;
      // `?date=` opens that night's card (a greeting's or a link's target) —
      // the same look the RsvpModal beacon reports, so the two coincide.
      const night = params.get("date");
      return night ? { page: "night", detail: night } : { page: "calendar" };
    }
    case "history":
      return { page: "history" };
    case "players":
      return { page: "players" };
    case "games":
      return { page: "games" };
    case "settings":
      return { page: "appearance" };
    // Admin is tabbed (?tab=vote etc.) — log which tab, "users" being the default.
    case "admin":
      return { page: "admin", detail: params.get("tab") ?? "users" };
    case "play":
      return second ? playView(second, rest) : null;
    case "trainer":
      return second === "geography" ? trainerView("geography", rest) : null;
    case "u": {
      if (!second) return null;
      const sub = rest[0];
      if (sub === undefined) return { page: "profile", detail: second };
      // The purchases pipeline is a tab of the collection page.
      if (sub === "collection" && params.get("tab") === "purchases") {
        return { page: "profile-purchases", detail: second };
      }
      const page = PROFILE_SUBPAGES[sub];
      return page ? { page, detail: second } : null;
    }
    // Deliberately not logged: /login and /reset-password (signed out), and
    // /dev/* previews (dev builds only).
    default:
      return null;
  }
}
