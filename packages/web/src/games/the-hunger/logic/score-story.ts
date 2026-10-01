import type {
  HungerResult,
  LogEntry,
  SeatBreakdown,
} from "@boardgames/core/games/the-hunger/types";

/** Where a Vampire's points came from, in the order they stack. */
export type Source = "hunting" | "castle" | "night" | "missions" | "cards";

export const SOURCES: readonly { id: Source; label: string; hint: string }[] = [
  { id: "hunting", label: "Hunting", hint: "Humans, Familiars, Powers and Roses hunted" },
  { id: "castle", label: "Castle & Chests", hint: "The Castle tile and Bonus tokens from Chests" },
  { id: "night", label: "Roses & Familiars", hint: "End-of-turn VP and Familiar abilities" },
  { id: "missions", label: "Missions", hint: "Public and personal Missions, Instants included" },
  { id: "cards", label: "End-of-game cards", hint: "Cards that score at sunrise" },
];

/**
 * The composition palette (dark surface), validated with the dataviz method:
 * all checks pass, worst adjacent CVD ΔE 9.4 — in the order above.
 */
export const SOURCE_COLOR: Record<Source, string> = {
  hunting: "#3987e5",
  castle: "#c98500",
  night: "#9085e9",
  missions: "#199e70",
  cards: "#d95926",
};

export interface SeatStory {
  sources: Record<Source, number>;
  /** VP the log can't place (kept so the parts always add up). */
  other: number;
  /** Sunrise: 0, or a loss (Cemetery, Mountain penalty). */
  sunrise: number;
  total: number;
  /** VP after each night, from night 1; the last point is the final score. */
  curve: number[];
}

/**
 * Each Vampire's score, told two ways: what it was made of, and how it grew
 * night by night. Built from the game log and the final breakdown, so the
 * parts always sum to the total.
 */
export function scoreStory(log: readonly LogEntry[], result: HungerResult): SeatStory[] {
  const seats = result.breakdown.length;
  const night = Array.from({ length: seats }, () => ({
    hunting: 0,
    castle: 0,
    night: 0,
    instants: 0,
  }));
  const running = Array<number>(seats).fill(0);
  const curves: number[][] = Array.from({ length: seats }, () => []);
  let started = false;

  const closeNight = () => {
    for (let s = 0; s < seats; s++) curves[s].push(running[s]);
  };

  for (const e of log) {
    if (e.t === "turn") {
      if (started) closeNight();
      started = true;
      continue;
    }
    const gain = vpOf(e);
    if (gain === null) continue;
    const { p, vp, kind } = gain;
    if (p < 0 || p >= seats) continue;
    night[p][kind] += vp;
    running[p] += vp;
  }
  if (started) closeNight();

  return result.breakdown.map((b: SeatBreakdown, s): SeatStory => {
    const n = night[s];
    const logged = n.hunting + n.castle + n.night + n.instants;
    const missions = b.publicMissions + b.personalMissions + n.instants;
    return {
      sources: {
        hunting: n.hunting,
        castle: n.castle,
        night: n.night,
        missions,
        cards: b.cardBonuses,
      },
      other: b.duringPlay - logged,
      sunrise: b.sunrise,
      total: b.total,
      curve: [...curves[s], b.total],
    };
  });
}

function vpOf(
  e: LogEntry,
): { p: number; vp: number; kind: "hunting" | "castle" | "night" | "instants" } | null {
  switch (e.t) {
    case "hunt":
      return { p: e.p, vp: e.vp, kind: "hunting" };
    case "castle":
      return { p: e.p, vp: e.tile, kind: "castle" };
    case "chest":
      return { p: e.p, vp: e.vp, kind: "castle" };
    case "end-turn":
    case "familiar":
      return { p: e.p, vp: e.vp, kind: "night" };
    case "instant":
      return { p: e.p, vp: e.vp, kind: "instants" };
    default:
      return null;
  }
}
