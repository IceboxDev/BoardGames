import { formatDayKey } from "../../../lib/date-format";

/**
 * What a label needs beyond the row itself. Injected (not imported) so the
 * label registries stay pure and testable without the games registry or the
 * admin users query.
 */
export interface DescribeContext {
  /** The member whose trail is on screen. */
  subjectId: string;
  /** Display name for a user id; undefined when the id is unknown. */
  nameOf(userId: string | undefined): string | undefined;
  /** Display title for a game slug; undefined when the slug is unknown. */
  gameTitle(slug: string | undefined): string | undefined;
}

/** "Melanie", or `fallback` for an unknown or missing id. */
export function person(ctx: DescribeContext, userId: string | undefined, fallback: string): string {
  return ctx.nameOf(userId) ?? fallback;
}

/**
 * Possessive for a page owner: "their own" when the member looked at their
 * own page, "Melanie's", or "a member's".
 */
export function whose(ctx: DescribeContext, userId: string | undefined): string {
  if (userId !== undefined && userId === ctx.subjectId) return "their own";
  const name = ctx.nameOf(userId);
  return name ? `${name}'s` : "a member's";
}

/** A game's title, its slug when unknown, or `fallback` when there is none. */
export function game(ctx: DescribeContext, slug: string | undefined, fallback = "a game"): string {
  return slug ? (ctx.gameTitle(slug) ?? slug) : fallback;
}

/** "Sat, Sep 12" for a night or day key (a second night reads as its date). */
export function day(key: string | undefined): string | undefined {
  return key ? formatDayKey(key) : undefined;
}

/** " for Sat, Sep 12" — or nothing when there is no key. */
export function forDay(key: string | undefined, preposition = "for"): string {
  const d = day(key);
  return d ? ` ${preposition} ${d}` : "";
}

/** "3 matches" / "1 match". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** First `cap` items, then "+N more". */
export function capped(items: readonly string[], cap = 4): string {
  const more = items.length - cap;
  return items.slice(0, cap).join(", ") + (more > 0 ? ` +${more} more` : "");
}
