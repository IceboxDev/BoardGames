import { isPageViewPage, type PageViewPage } from "@boardgames/core/protocol";
import { type DescribeContext, day, game, whose } from "./describe-context";
import { aboutFromShownDetail, greetingKindOfShownPage, greetingPhrase } from "./greeting-labels";
import { trainerName } from "./trainer-labels";

// One line per page-view `page` (the PAGE_VIEW_PAGES vocabulary in core). A
// `Record` over the whole union: a page added there without words here fails
// the typecheck instead of rendering as "Viewed trainer-study".

type PageLabel = (detail: string | undefined, ctx: DescribeContext) => string;

const TRAIT_NAMES: Readonly<Record<string, string>> = {
  int: "Intelligence",
  pln: "Planning",
  per: "Perception",
  soph: "Sophistication",
  soc: "Social",
  dex: "Dexterity",
};

/** AdminPage's `?tab=` keys, as its tab bar names them. */
const ADMIN_TAB_NAMES: Readonly<Record<string, string>> = {
  users: "Users",
  vote: "Purchase vote",
  "pre-register": "Pre-register",
  skills: "Skill ratings",
  guests: "Guests",
};

/** A greeting card being shown: "Saw the group spotlight about Melanie". */
function shown(page: PageViewPage): PageLabel {
  return (detail, ctx) => {
    const kind = greetingKindOfShownPage(page);
    return kind ? `Saw ${greetingPhrase(kind, aboutFromShownDetail(kind, detail), ctx)}` : page;
  };
}

export const PAGE_LABELS: Readonly<Record<PageViewPage, PageLabel>> = {
  home: () => "Opened the home page",
  calendar: () => "Viewed the calendar",
  history: () => "Viewed the match history",
  players: () => "Viewed the players list",
  admin: (tab) => `Viewed the admin dashboard${tab ? ` (${ADMIN_TAB_NAMES[tab] ?? tab} tab)` : ""}`,
  games: () => "Browsed the games catalog",
  appearance: () => "Opened appearance settings",
  profile: (id, ctx) => `Viewed ${whose(ctx, id)} profile`,
  "profile-matches": (id, ctx) => `Viewed ${whose(ctx, id)} match history`,
  "profile-collection": (id, ctx) => `Viewed ${whose(ctx, id)} collection`,
  "profile-purchases": (id, ctx) => `Viewed ${whose(ctx, id)} purchases`,
  "profile-nights": (id, ctx) => `Viewed ${whose(ctx, id)} game nights`,
  "profile-skill": (id, ctx) => `Viewed ${whose(ctx, id)} skill page`,

  play: (slug, ctx) => `Opened ${game(ctx, slug)}`,
  "play-rules": (slug, ctx) => `Read the ${game(ctx, slug)} rules`,
  "play-solo": (slug, ctx) => `Started a solo game of ${game(ctx, slug)}`,
  "play-companion": (slug, ctx) => `Opened the ${game(ctx, slug)} table companion`,
  "play-bga": (slug, ctx) => `Opened the ${game(ctx, slug)} BoardGameArena bridge`,
  "play-join": (slug, ctx) => `Looked for a room to join in ${game(ctx, slug)}`,
  "play-lobby": (slug, ctx) => `Joined a lobby for ${game(ctx, slug)}`,
  "play-room": (slug, ctx) => `Played ${game(ctx, slug)} in a multiplayer room`,
  "play-replays": (slug, ctx) => `Browsed ${game(ctx, slug)} match replays`,
  "play-replay": (slug, ctx) => `Watched a replay of ${game(ctx, slug)}`,
  "play-tournament": (slug, ctx) => `Viewed the ${game(ctx, slug)} AI tournament results`,

  trainer: (deck) => `Opened the ${trainerName(deck)} trainer`,
  "trainer-study": (deck) => `Started studying ${trainerName(deck)}`,
  "trainer-wiki": (deck) => `Read the ${trainerName(deck)} wiki`,
  "trainer-timeline": (deck) => `Opened their ${trainerName(deck)} timeline`,
  "trainer-explore": (deck) => `Explored the ${trainerName(deck)} globe`,

  night: (key) => (key ? `Opened the ${day(key)} game night` : "Opened a game night"),
  "purchase-vote": () => "Opened the purchase-vote screen",
  "skill-board": (detail, ctx) => {
    // Detail is a trait id (trait boards) or a game slug (game boards).
    const name = (detail ? TRAIT_NAMES[detail] : undefined) ?? game(ctx, detail, "a skill");
    return `Opened the ${name} leaderboard`;
  },

  "skill-intro": shown("skill-intro"),
  "skill-spotlight": shown("skill-spotlight"),
  "purchase-vote-announce": shown("purchase-vote-announce"),
  "purchase-vote-reminder": shown("purchase-vote-reminder"),
  arrival: shown("arrival"),
  "night-invite": shown("night-invite"),
  "purchase-vote-result": () => "Saw the purchase-vote results",
};

/** The line for a page view; a page this build doesn't know still reads. */
export function describePageView(
  page: string | undefined,
  detail: string | undefined,
  ctx: DescribeContext,
): string {
  if (page && isPageViewPage(page)) return PAGE_LABELS[page](detail, ctx);
  return `Viewed ${page ?? "a page"}${detail ? ` (${detail})` : ""}`;
}

/**
 * The page as a destination — "Melanie's skill page" — for a greeting's
 * "Followed … to …" line. Undefined for a page that isn't a destination.
 */
export function pageDestination(
  page: string | undefined,
  detail: string | undefined,
  ctx: DescribeContext,
): string | undefined {
  switch (page) {
    case "profile":
      return `${whose(ctx, detail)} profile`;
    case "profile-skill":
      return `${whose(ctx, detail)} skill page`;
    case "profile-collection":
      return `${whose(ctx, detail)} collection`;
    case "purchase-vote":
      return "the vote screen";
    case "games":
      return "the games catalog";
    case "calendar":
      return "the calendar";
    case "night":
      return detail ? `the ${day(detail)} game night` : "the night";
    default:
      return undefined;
  }
}
