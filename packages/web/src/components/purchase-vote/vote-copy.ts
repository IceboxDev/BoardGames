import { maxPlayersAsNumber } from "@boardgames/core/bgg";
import type { GameDefinition } from "../../games/types";

// The words and numbers of the new-vote page, as pure functions of the poll
// and its contenders, so they are unit-tested and the takeover stays markup.

/** "The October vote: games for the whole table" → "The October vote". */
export function voteShortTitle(title: string | null): string {
  const head = title?.split(":")[0]?.trim();
  return head || "The new vote";
}

/** The part after the colon, when the title has one: the vote's angle. */
export function voteTagline(title: string | null): string | null {
  const i = title?.indexOf(":") ?? -1;
  if (!title || i < 0) return null;
  const tail = title.slice(i + 1).trim();
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : null;
}

/** The fewest seats any contender offers at its most: "every one seats N+". */
export function smallestMaxPlayers(games: readonly GameDefinition[]): number | null {
  let least: number | null = null;
  for (const g of games) {
    if (g.bgg.maxPlayers === null) return null;
    const max = maxPlayersAsNumber(g.bgg.maxPlayers);
    least = least === null ? max : Math.min(least, max);
  }
  return least;
}

/** "4–9", "6–30", "1–∞", or "" when unknown. */
export function seatRange(game: GameDefinition): string {
  const min = game.bgg.minPlayers;
  const max = game.bgg.maxPlayers;
  if (min == null || max == null) return "";
  const top = max === "infinity" || (typeof max === "number" && max >= 99) ? "∞" : String(max);
  return min === max ? String(min) : `${min}–${top}`;
}

/** The mean of the contenders' accents, lifted toward white so it reads as
 * ink on the dark panel — one colour for the whole slate. */
export function slateAccent(games: readonly GameDefinition[], lift = 0.3): string {
  const rgb = [0, 0, 0];
  let n = 0;
  for (const g of games) {
    const m = /^#([0-9a-f]{6})$/i.exec(g.accentHex);
    if (!m?.[1]) continue;
    const v = Number.parseInt(m[1], 16);
    rgb[0] += (v >> 16) & 255;
    rgb[1] += (v >> 8) & 255;
    rgb[2] += v & 255;
    n++;
  }
  if (n === 0) return "#f59e0b";
  return `#${rgb
    .map((c) => Math.round(c / n + (255 - c / n) * lift))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}
