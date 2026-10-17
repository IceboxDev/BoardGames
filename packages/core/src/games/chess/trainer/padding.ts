/**
 * The opponent-reply rule of an opening tree: every move played against you
 * in the position, and — when that's fewer than `min` — more, alternating the
 * database's most popular moves with the engine's choices (most popular, best,
 * 2nd most popular, 2nd best, …), skipping repeats, until there are `min` or
 * the legal moves run out. (The trainer then shows them in the engine's order.)
 */

export type ReplySource = "played" | "engine" | "popular";

export interface PaddedReply {
  readonly uci: string;
  readonly source: ReplySource;
}

export function padReplies(
  observed: readonly string[],
  engine: readonly string[],
  popular: readonly string[],
  legal: ReadonlySet<string>,
  min = 3,
): PaddedReply[] {
  const out: PaddedReply[] = [];
  const have = new Set<string>();
  const add = (uci: string, source: ReplySource) => {
    if (have.has(uci) || !legal.has(uci)) return;
    have.add(uci);
    out.push({ uci, source });
  };
  for (const uci of observed) add(uci, "played");
  const target = Math.min(min, legal.size);
  const longest = Math.max(engine.length, popular.length);
  for (let i = 0; i < longest && out.length < target; i++) {
    const p = popular[i];
    if (p !== undefined) add(p, "popular");
    if (out.length >= target) break;
    const e = engine[i];
    if (e !== undefined) add(e, "engine");
  }
  return out;
}
