import { GREETING_KINDS, type GreetingKind, type PageViewPage } from "@boardgames/core/protocol";
import { type DescribeContext, day } from "./describe-context";

// Greetings are the takeover cards (spotlight, purchase-vote news, arrivals,
// private-night invitations). Three rows can describe one: the card being
// shown (a page view), the member's answer (`greeting-response`), and the
// page its button opened (a page view with `via`). The trail folds them into
// one line; these are the words for it.

/** What a greeting is about, when the row can say. */
export interface GreetingAbout {
  subjectUserId?: string;
  /** Night key of a private-night invitation. */
  date?: string;
}

const SHORT: Readonly<Record<GreetingKind, string>> = {
  "skill-intro": "the skill-profiles intro",
  spotlight: "the group spotlight",
  "purchase-vote-announce": "the purchase-vote announcement",
  "purchase-vote-reminder": "the purchase-vote reminder",
  arrival: "the arrivals announcement",
  "night-invite": "the private-night invitation",
};

/** "the group spotlight about Melanie" — as specific as the row allows. */
export function greetingPhrase(
  kind: GreetingKind,
  about: GreetingAbout,
  ctx: DescribeContext,
): string {
  if (kind === "spotlight") {
    const name = ctx.nameOf(about.subjectUserId);
    if (name) return `the group spotlight about ${name}`;
  }
  if (kind === "night-invite") {
    const when = day(about.date);
    if (when) return `the invitation to the ${when} private night`;
  }
  return SHORT[kind];
}

/** "the group spotlight" — used when the line names the destination instead. */
export function greetingShortPhrase(kind: GreetingKind): string {
  return SHORT[kind];
}

/**
 * Where a greeting's button leads, when the page it opened wasn't logged —
 * undefined when the phrase already says it ("Followed the invitation to the
 * Sat, Oct 3 private night").
 */
export function ctaFallbackDestination(
  kind: GreetingKind,
  about: GreetingAbout,
  ctx: DescribeContext,
): string | undefined {
  switch (kind) {
    case "skill-intro":
      return "their own skill page";
    case "spotlight": {
      const name = ctx.nameOf(about.subjectUserId);
      return name ? `${name}'s skill page` : "the skill page";
    }
    case "purchase-vote-announce":
    case "purchase-vote-reminder":
      return "the vote screen";
    case "arrival":
      return "the collection";
    case "night-invite":
      return undefined;
  }
}

/** The page-view page that means "this greeting was shown". */
export const GREETING_SHOWN_PAGE: Readonly<Record<GreetingKind, PageViewPage>> = {
  "skill-intro": "skill-intro",
  spotlight: "skill-spotlight",
  "purchase-vote-announce": "purchase-vote-announce",
  "purchase-vote-reminder": "purchase-vote-reminder",
  arrival: "arrival",
  "night-invite": "night-invite",
};

/** The greeting a "shown" page view is about, if it is one. */
export function greetingKindOfShownPage(page: string | undefined): GreetingKind | undefined {
  return GREETING_KINDS.find((kind) => GREETING_SHOWN_PAGE[kind] === page);
}

/**
 * What a greeting's "shown" page view is about: its `detail` is the spotlight
 * subject or the invitation's night (other kinds carry ids the line doesn't
 * need).
 */
export function aboutFromShownDetail(
  kind: GreetingKind,
  detail: string | undefined,
): GreetingAbout {
  if (!detail) return {};
  if (kind === "spotlight") return { subjectUserId: detail };
  if (kind === "night-invite") return { date: detail };
  return {};
}
