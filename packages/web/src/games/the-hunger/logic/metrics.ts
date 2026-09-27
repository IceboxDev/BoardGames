import type { BoardGraph } from "@boardgames/core/games/the-hunger/board";
import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import {
  HUMAN_CATEGORIES,
  type HungerPlayerView,
  type PlayerSummary,
} from "@boardgames/core/games/the-hunger/types";
import { type ArtName, CATEGORY_ICON } from "./art";
import { CATEGORY_LABEL, spaceLabel } from "./labels";

/** One row of the Overview: a label and a value per seat, and which end is best. */
export interface MetricRow {
  label: string;
  values: (number | string)[];
  /** "max" / "min": the leader (strictly) is highlighted; omit for text rows. */
  best?: "max" | "min";
  hint?: string;
  /** An icon drawn before the label. */
  icon?: ArtName;
}

export interface MetricSection {
  title: string;
  rows: MetricRow[];
}

const region = (p: PlayerSummary, g: BoardGraph) => g.spaces.get(p.pos)?.region ?? "castle";

/** If the sun rose now: where each Vampire would end up. */
function fateNow(view: HungerPlayerView, p: PlayerSummary, g: BoardGraph): string {
  const r = region(p, g);
  if (r === "castle") return "Safe";
  if (r === "cemetery") return "−5 VP";
  if (r === "mountains") {
    if (view.options.mode === "rookie") {
      const penalty = g.spaces.get(p.pos)?.mountainPenalty ?? 0;
      return penalty ? `−${penalty} VP` : "Safe";
    }
    if (view.options.beginnerSafeMountains) return "Safe";
  }
  return "Ashes";
}

function status(view: HungerPlayerView, seat: number, active: number): string {
  if (view.phase === "game-over") return "—";
  if (seat === active) return "Acting";
  const queue = view.order.indexOf(seat);
  if (queue >= 0) return queue === 0 ? "Next" : `In ${queue + 1}`;
  return view.players[seat]?.resting ? "Done" : "—";
}

/** Every public metric, per Vampire, grouped for the Overview grid. */
export function overviewMetrics(
  view: HungerPlayerView,
  g: BoardGraph,
  active: number,
): MetricSection[] {
  const ps = view.players;
  const unused = (p: PlayerSummary) => p.bonus.filter((b) => !b.used).length;
  return [
    {
      title: "Standing",
      rows: [
        { label: "Victory Points", values: ps.map((p) => p.vp), best: "max" },
        { label: "This night", values: ps.map((p) => status(view, p.index, active)) },
        {
          label: "Castle tile",
          values: ps.map((p) => (p.castleTile === null ? "—" : `+${p.castleTile}`)),
        },
        { label: "If the sun rose now", values: ps.map((p) => fateNow(view, p, g)) },
      ],
    },
    {
      title: "Position",
      rows: [
        { label: "Standing on", values: ps.map((p) => spaceLabel(view.options, p.pos)) },
        {
          label: "Steps to the Castle",
          values: ps.map((p) => g.castleDist.get(p.pos) ?? 0),
          best: "min",
        },
      ],
    },
    {
      title: "Deck",
      rows: [
        {
          label: "Expected Speed",
          values: ps.map((p) => p.expectedSpeed),
          best: "max",
          hint: "3 × the average Speed of the cards that cycle, plus Permanents",
        },
        { label: "Draw pile", values: ps.map((p) => p.deckCount) },
        { label: "In hand", values: ps.map((p) => p.handCount) },
        { label: "Discard pile", values: ps.map((p) => p.discard.length) },
        { label: "Digested", values: ps.map((p) => p.digested.length), best: "max" },
      ],
    },
    {
      title: "Hunted",
      rows: [
        { label: "Cards hunted", values: ps.map((p) => p.hunted), best: "max" },
        ...HUMAN_CATEGORIES.map(
          (c): MetricRow => ({
            label: CATEGORY_LABEL[c],
            icon: CATEGORY_ICON[c],
            values: ps.map((p) => p.humans[c]),
            best: "max",
          }),
        ),
        {
          label: "Familiars",
          icon: "icon-familiar",
          values: ps.map((p) => p.familiars),
          best: "max",
        },
        { label: "Powers", icon: "icon-power", values: ps.map((p) => p.powers), best: "max" },
        { label: "Rose", icon: "icon-item-rose", values: ps.map((p) => (p.hasRose ? "Yes" : "—")) },
      ],
    },
    {
      title: "Tokens & Missions",
      rows: [
        { label: "Bonus tokens", values: ps.map((p) => p.bonus.length), best: "max" },
        { label: "…still to use", values: ps.map(unused) },
        {
          label: "Parasol",
          values: ps.map((p) =>
            p.bonus.some((b) => bonusDef(b.id).bonus.kind === "parasol") ? "☂" : "—",
          ),
        },
        { label: "Missions held", values: ps.map((p) => p.missionCount) },
        { label: "Instants used", values: ps.map((p) => p.usedMissions.length) },
      ],
    },
  ];
}

/** The seat(s) strictly leading a numeric row, or none on a tie or text row. */
export function leaders(row: MetricRow): Set<number> {
  if (!row.best) return new Set();
  const nums = row.values.map((v) => (typeof v === "number" ? v : Number.NaN));
  if (nums.some(Number.isNaN)) return new Set();
  const target = row.best === "max" ? Math.max(...nums) : Math.min(...nums);
  const hits = nums.flatMap((v, i) => (v === target ? [i] : []));
  return hits.length === 1 ? new Set(hits) : new Set();
}
