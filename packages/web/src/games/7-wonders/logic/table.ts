import type {
  SevenWondersPlayerBoardView,
  SevenWondersPlayerView,
} from "@boardgames/core/games/7-wonders/machine";
import type {
  Age,
  LogEntry,
  MilitaryOutcome,
  WonderId,
} from "@boardgames/core/games/7-wonders/types";
import { leftOf, rightOf } from "@boardgames/core/games/7-wonders/types";
import { wonderStyle } from "./wonder-style";

export type ViewId = "city" | "table" | "overview" | "edifice" | "chains";

/**
 * Number keys for the rail, in its order: the table views first (Edifice
 * only when it's in play), then the cities from yours round the table —
 * through 9, then 0.
 */
export function navKeys(hasEdifice: boolean): {
  views: Partial<Record<Exclude<ViewId, "city">, string>>;
  city: (i: number) => string | undefined;
} {
  const order: Exclude<ViewId, "city">[] = ["table", "overview", "chains"];
  if (hasEdifice) order.push("edifice");
  const views = Object.fromEntries(order.map((v, i) => [v, String(i + 1)]));
  return {
    views,
    city: (i) => {
      const n = order.length + 1 + i;
      return n <= 9 ? String(n) : n === 10 ? "0" : undefined;
    },
  };
}

/**
 * Seats in table order starting from `from`: you, your left neighbour, and
 * on round the table to your right neighbour last. Ages I and III pass left.
 */
export function seatsFrom(from: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(from < 0 ? k : (from + k) % count);
  return out;
}

export type Neighbour = "left" | "right" | null;

export function neighbourOf(me: number, seat: number, count: number): Neighbour {
  if (me < 0 || seat === me) return null;
  if (seat === leftOf(me, count)) return "left";
  if (seat === rightOf(me, count)) return "right";
  return null;
}

/** Ages I and III pass to the left, Age II to the right. */
export function passDirection(age: 1 | 2 | 3): "left" | "right" {
  return age === 2 ? "right" : "left";
}

/** The conflict token one city takes from a border this age: +1/+3/+5, −1, or 0. */
export function duelToken(mine: number, theirs: number, age: 1 | 2 | 3): number {
  if (mine > theirs) return age === 1 ? 1 : age === 2 ? 3 : 5;
  if (mine < theirs) return -1;
  return 0;
}

export interface Border {
  /** The city on this border's clockwise side… */
  a: number;
  /** …and the next one round (a's left neighbour). */
  b: number;
  aShields: number;
  bShields: number;
  /** Who would win if the age ended now: a, b, or null on a tie. */
  winner: number | null;
}

/** Every border at the table — one per adjacent pair. */
export function borders(players: readonly SevenWondersPlayerBoardView[]): Border[] {
  const n = players.length;
  return players.map((p, i) => {
    const b = leftOf(i, n);
    const q = players[b];
    return {
      a: i,
      b,
      aShields: p.shields,
      bShields: q.shields,
      winner: p.shields > q.shields ? i : q.shields > p.shields ? b : null,
    };
  });
}

export type SeatStatus = "choosing" | "picked" | "resolving" | "idle";

export function seatStatus(view: SevenWondersPlayerView, seat: number): SeatStatus {
  if (view.phase === "pending") {
    return view.pending?.playerIndex === seat ? "resolving" : "idle";
  }
  if (view.phase !== "selecting") return "idle";
  return view.players[seat]?.hasSelected ? "picked" : "choosing";
}

/**
 * Places that hold something for you to do. The hand is always in view, so
 * this is about your city: it calls while it's your pick and you're
 * elsewhere, and while a Halikarnassos pick is yours.
 */
export function attentionFor(
  view: SevenWondersPlayerView,
  myIndex: number,
  isGameOver: boolean,
): Set<ViewId> {
  const out = new Set<ViewId>();
  if (isGameOver || myIndex < 0) return out;
  const pending = view.phase === "pending" ? view.pending : null;
  if (pending?.playerIndex === myIndex) out.add("city");
  if (view.phase === "selecting" && view.me && !view.me.hasSelected) out.add("city");
  return out;
}

/**
 * An age's war as one row per border — a city, its left neighbour and the
 * token each took. The engine walks the borders seat by seat and appends
 * both cities' tokens as it goes; replaying that walk pairs every token with
 * its border.
 */
export function warBorders(
  outcomes: readonly MilitaryOutcome[],
  count: number,
): { a: number; b: number; ta: number; tb: number }[] {
  const next = new Map<number, number>();
  const take = (seat: number) => {
    const k = next.get(seat) ?? 0;
    next.set(seat, k + 1);
    return outcomes.find((o) => o.playerIndex === seat)?.tokens[k] ?? 0;
  };
  return Array.from({ length: count }, (_, a) => {
    const b = leftOf(a, count);
    return { a, b, ta: take(a), tb: take(b) };
  });
}

/**
 * The Age each of a city's built wonder stages was built in, oldest first —
 * read from the log, so the card tucked under each stage shows its Age's back.
 */
export function stageAges(log: readonly LogEntry[], seat: number): Age[] {
  const out: Age[] = [];
  for (const e of log) {
    if (e.type !== "reveal" && e.type !== "pending") continue;
    const plays = e.type === "reveal" ? e.plays : e.play ? [e.play] : [];
    for (const p of plays) {
      if (p.playerIndex === seat && p.action === "build-wonder") out.push(e.age);
    }
  }
  return out;
}

/**
 * What to call each seat: people by name, you as "You" unless named, and AI
 * seats (whose names all read "… (AI)") by their wonder.
 */
export function seatLabels(
  wonders: readonly WonderId[],
  myIndex: number,
  seatNames?: readonly string[],
): string[] {
  return wonders.map((wonderId, i) => {
    const given = seatNames?.[i];
    if (i === myIndex) return given && given !== "You" ? given : "You";
    return given && !given.endsWith("(AI)") && given !== "AI" ? given : wonderStyle(wonderId).short;
  });
}
