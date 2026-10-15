import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import { scoreScience } from "@boardgames/core/games/7-wonders/scoring";
import type {
  CardColor,
  ResourceType,
  ScienceSymbol,
} from "@boardgames/core/games/7-wonders/types";
import { RESOURCE_TYPES, SCIENCE_SYMBOLS } from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import {
  COLOR_LABEL,
  defOf,
  SCORE_CATEGORIES,
  type ScoreCategory,
  TABLEAU_ORDER,
} from "../card-utils";
import type { SevenIconName } from "../components/SevenIcon";

export interface MetricRow {
  label: string;
  icon?: SevenIconName;
  /** A score-pad category: its painted emblem instead of an icon. */
  score?: ScoreCategory;
  /** Card colour swatch instead of an icon. */
  swatch?: CardColor;
  hint?: string;
  /** One value per seat, in seat order. */
  values: number[];
  /** Lower is better (defeats). */
  lowerIsBetter?: boolean;
}

export interface MetricSection {
  title: string;
  rows: MetricRow[];
}

/**
 * The seats that lead a row outright. A tie at the top, or a row where
 * nobody has anything, lights nobody.
 */
export function leaders(row: MetricRow): Set<number> {
  const vals = row.values;
  if (vals.length < 2) return new Set();
  const best = row.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  const at = vals.flatMap((v, i) => (v === best ? [i] : []));
  if (at.length !== 1) return new Set();
  if (!row.lowerIsBetter && best === 0) return new Set();
  return new Set(at);
}

/** Units a city produces of one resource, counting a choice card as one possible unit. */
export function producible(production: readonly ResourceType[][], r: ResourceType): number {
  return production.filter((set) => set.includes(r)).length;
}

/** VP that one more of each science symbol would add. */
export function scienceGains(
  counts: Record<ScienceSymbol, number>,
  wildcards: number,
): Record<ScienceSymbol, number> {
  const now = scoreScience(counts, wildcards);
  const out = {} as Record<ScienceSymbol, number>;
  for (const s of SCIENCE_SYMBOLS) {
    out[s] = scoreScience({ ...counts, [s]: counts[s] + 1 }, wildcards) - now;
  }
  return out;
}

export function colorCount(tableau: readonly string[], color: CardColor): number {
  return tableau.filter((id) => defOf(id).color === color).length;
}

export function overviewMetrics(view: SevenWondersPlayerView): MetricSection[] {
  const ps = view.players;
  const col = (f: (i: number) => number) => ps.map((_, i) => f(i));
  const hasEdifice = Boolean(view.edifices);

  const score: MetricRow[] = [
    {
      label: "Total",
      icon: "laurel",
      hint: "Points if the game ended now",
      values: col((i) => ps[i].score.total),
    },
    ...SCORE_CATEGORIES.filter((c) => c.key !== "edifice" || hasEdifice).map((c) => ({
      label: c.label,
      score: c.key,
      values: col((i) => ps[i].score[c.key]),
    })),
  ];

  const economy: MetricRow[] = [
    { label: "Coins", icon: "coin", values: col((i) => ps[i].coins) },
    ...RESOURCE_TYPES.map((r) => ({
      label: r[0].toUpperCase() + r.slice(1),
      icon: r,
      hint: "Units you can produce each turn (a choice card counts once for each option)",
      values: col((i) => producible(ps[i].production, r)),
    })),
  ];

  const military: MetricRow[] = [
    { label: "Shields", icon: "shield", values: col((i) => ps[i].shields) },
    {
      label: "Victories",
      icon: "victory",
      values: col((i) => ps[i].militaryTokens.filter((t) => t > 0).reduce((a, b) => a + b, 0)),
    },
    {
      label: "Defeats",
      icon: "defeat",
      lowerIsBetter: true,
      values: col((i) => ps[i].militaryTokens.filter((t) => t < 0).length),
    },
  ];

  const science: MetricRow[] = [
    ...SCIENCE_SYMBOLS.map((s) => ({
      label: s[0].toUpperCase() + s.slice(1),
      icon: s,
      values: col((i) => ps[i].scienceCounts[s]),
    })),
    { label: "Wildcards", values: col((i) => ps[i].scienceWildcards) },
  ];

  const cards: MetricRow[] = [
    ...TABLEAU_ORDER.map((c) => ({
      label: COLOR_LABEL[c],
      swatch: c,
      values: col((i) => colorCount(ps[i].tableau, c)),
    })),
    {
      label: "Wonder stages",
      icon: "wonder" as const,
      values: col((i) => ps[i].stagesBuilt),
    },
  ];

  return [
    { title: "Score now", rows: score },
    { title: "Economy", rows: economy },
    { title: "Military", rows: military },
    { title: "Science", rows: science },
    { title: "City", rows: cards },
  ];
}

export function stageTotal(view: SevenWondersPlayerView, seat: number): number {
  const p = view.players[seat];
  return getWonderDef(p.wonderId).sides[p.side].stages.length;
}
