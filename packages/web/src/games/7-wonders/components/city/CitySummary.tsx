import type {
  SevenWondersPlayerBoardView,
  SevenWondersPlayerView,
} from "@boardgames/core/games/7-wonders/machine";
import { scoreScience } from "@boardgames/core/games/7-wonders/scoring";
import type { ResourceType } from "@boardgames/core/games/7-wonders/types";
import {
  leftOf,
  RESOURCE_TYPES,
  rightOf,
  SCIENCE_SYMBOLS,
} from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import type { ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { defOf, SCORE_CATEGORIES } from "../../card-utils";
import { scienceGains } from "../../logic/metrics";
import { duelToken } from "../../logic/table";
import SevenIcon, { Amount, ScoreIcon } from "../SevenIcon";

interface Props {
  view: SevenWondersPlayerView;
  seat: number;
  names: readonly string[];
  className?: string;
}

/**
 * The city in numbers, beside its cards: what it produces and buys cheap,
 * its science, its two borders this age, and its score so far. Four panels
 * of one fixed size each — every city's numbers fit the same frames, so
 * switching cities never moves anything.
 */
export default function CitySummary({ view, seat, names, className }: Props) {
  const p = view.players[seat];
  const showEdifice = Boolean(view.edifices);
  return (
    <div className={cn("grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-rows-2", className)}>
      <Box title="Resources">
        <Resources player={p} />
      </Box>
      <Box title="Science">
        <Science player={p} />
      </Box>
      <Box title={`Borders · Age ${view.age}`}>
        <Borders view={view} seat={seat} names={names} />
      </Box>
      <Box title="Score now">
        <ScoreBar player={p} showEdifice={showEdifice} />
      </Box>
    </div>
  );
}

/** A panel of the city's numbers: a quiet dark glass, a gilt hairline under its title. */
export function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-card-lg bg-surface-900/85 px-3 pb-2.5 pt-2 shadow-lg ring-1 ring-black/60"
      style={{ boxShadow: "inset 0 1px 0 rgb(217 165 32 / 0.22), 0 6px 14px rgb(0 0 0 / 0.4)" }}
    >
      <h3 className="flex shrink-0 flex-col gap-1.5 font-fantasy text-xs font-bold text-amber-200">
        {title}
        <span
          aria-hidden
          className="h-px w-full"
          style={{ background: "linear-gradient(90deg, rgb(217 165 32 / 0.6), transparent 85%)" }}
        />
      </h3>
      {children}
    </section>
  );
}

/**
 * One fixed tile: an icon and a big number. Lit when the city has some,
 * dimmed when it has none — readable at a glance, the same size for every
 * city, so the panel never reflows.
 */
function Tile({
  icon,
  value,
  extra,
  extraTone = "amber",
  highlight = false,
  on,
  title,
}: {
  icon: ReactNode;
  value: ReactNode;
  /** A small amber badge on the corner (e.g. "+1" from either/or cards). */
  extra?: ReactNode;
  extraTone?: "amber" | "emerald";
  /** Ring it — the best next pick. */
  highlight?: boolean;
  on: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "relative flex h-10 min-w-0 items-center justify-center gap-1 rounded-ui-md transition-colors",
        on
          ? "bg-fill-strong ring-1 ring-amber-200/25"
          : "bg-fill-soft ring-1 ring-inset ring-line-soft",
        highlight && "ring-2 ring-emerald-400/70",
      )}
    >
      <span className={cn("flex shrink-0", !on && "opacity-30 grayscale")}>{icon}</span>
      <span
        className={cn(
          "text-base font-bold leading-none tabular-nums",
          on ? "text-fg-strong" : "text-fg-disabled",
        )}
      >
        {value}
      </span>
      {extra && (
        <span
          className={cn(
            "absolute -right-1 -top-1.5 flex h-4 items-center rounded-full px-1 text-4xs font-bold tabular-nums text-surface-950 shadow ring-2 ring-surface-900",
            extraTone === "amber" ? "bg-amber-300" : "bg-emerald-300",
          )}
        >
          {extra}
        </span>
      )}
    </span>
  );
}

/** Both tile panels share one grid, so their rows line up side by side. */
const TILE_GRID = "grid grid-cols-4 gap-x-2 gap-y-2.5 pt-1";

const RESOURCE_NAME: Record<ResourceType, string> = {
  wood: "Wood",
  stone: "Stone",
  clay: "Clay",
  ore: "Ore",
  glass: "Glass",
  loom: "Loom",
  papyrus: "Papyrus",
};

/**
 * What the city has to build with each turn: a tile per good (raw on top,
 * manufactured below) with how many it always makes, and — in amber — how
 * many more its either/or cards could make instead. The last tile is its
 * 1-coin trading deals.
 */
function Resources({ player }: { player: SevenWondersPlayerBoardView }) {
  const fixed = new Map<ResourceType, number>();
  const flex = new Map<ResourceType, number>();
  for (const set of player.production) {
    const into = set.length === 1 ? fixed : flex;
    for (const r of set) into.set(r, (into.get(r) ?? 0) + 1);
  }
  return (
    <div className={TILE_GRID}>
      {RESOURCE_TYPES.map((r) => {
        const n = fixed.get(r) ?? 0;
        const f = flex.get(r) ?? 0;
        return (
          <Tile
            key={r}
            on={n + f > 0}
            icon={<SevenIcon name={r} className="h-6 w-6" />}
            value={n}
            extra={f > 0 ? `+${f}` : undefined}
            title={`${RESOURCE_NAME[r]}: ${n} every turn${
              f > 0 ? `, or ${f} more from cards that make one of several goods` : ""
            }`}
          />
        );
      })}
      <Trade player={player} />
    </div>
  );
}

/** Trading posts, the Marketplace and Olympia B: which neighbour sells for 1 coin. */
function Trade({ player }: { player: SevenWondersPlayerBoardView }) {
  const side = getWonderDef(player.wonderId).sides[player.side];
  const deals = { left: new Set<string>(), right: new Set<string>() };
  for (const e of [
    ...player.tableau.flatMap((id) => defOf(id).effects),
    ...side.stages.slice(0, player.stagesBuilt).flatMap((s) => s.effects),
  ]) {
    if (e.kind !== "trade-discount") continue;
    for (const n of e.neighbors) deals[n].add(e.resources === "raw" ? "raw" : "goods");
  }
  const price = (set: Set<string>) => (set.size > 0 ? 1 : 2);
  const describe = (set: Set<string>) =>
    set.size === 0 ? "2 coins a good" : `1 coin for ${[...set].join(" and ")}, 2 for the rest`;
  const on = deals.left.size + deals.right.size > 0;
  const priceTag = (set: Set<string>, arrow: string, left: boolean) => (
    <span
      className={cn(
        "flex items-center text-xs font-bold leading-none tabular-nums",
        set.size > 0 ? "text-amber-200" : "text-fg-muted",
      )}
    >
      {left && <span className="text-5xs">{arrow}</span>}
      {price(set)}
      {!left && <span className="text-5xs">{arrow}</span>}
    </span>
  );
  // What a good costs from each neighbour: ◂ left · right ▸ — amber where a deal applies.
  return (
    <span
      title={`Buying from your left neighbour: ${describe(deals.left)}. From your right: ${describe(deals.right)}.`}
      className={cn(
        "flex h-10 min-w-0 flex-col items-center justify-center gap-1 rounded-ui-md",
        on
          ? "bg-fill-strong ring-1 ring-amber-200/25"
          : "bg-fill-soft ring-1 ring-inset ring-line-soft",
      )}
    >
      <SevenIcon
        name="coin"
        className={cn("h-3.5 w-3.5", !on && "opacity-50 grayscale")}
        title="Price of a good from each neighbour"
      />
      <span className="flex items-center gap-1.5">
        {priceTag(deals.left, "◂", true)}
        {priceTag(deals.right, "▸", false)}
      </span>
    </span>
  );
}

/**
 * The three symbols and the wildcards as tiles, each badged with what one
 * more would be worth now (the best pick ringed); below, complete sets and
 * the science points so far — row for row with the Resources beside it.
 */
function Science({ player }: { player: SevenWondersPlayerBoardView }) {
  const counts = player.scienceCounts;
  const wild = player.scienceWildcards;
  const gains = scienceGains(counts, wild);
  const wildGain = scoreScience(counts, wild + 1) - scoreScience(counts, wild);
  const values = SCIENCE_SYMBOLS.map((s) => gains[s]);
  const best = Math.max(...values);
  // Ring the best pick only when there is one — not when every symbol pays the same.
  const leads = best > Math.min(...values);
  const sets = Math.min(...SCIENCE_SYMBOLS.map((s) => counts[s]));
  return (
    <div className={TILE_GRID}>
      {SCIENCE_SYMBOLS.map((s) => (
        <Tile
          key={s}
          on={counts[s] > 0}
          icon={<SevenIcon name={s} className="h-6 w-6" />}
          value={counts[s]}
          extra={`+${gains[s]}`}
          extraTone="emerald"
          highlight={leads && gains[s] === best}
          title={`${SCIENCE_NAME[s]}: ${counts[s]} — one more is worth +${gains[s]} VP now`}
        />
      ))}
      <Tile
        on={wild > 0}
        icon={<SevenIcon name="science-any" className="h-6 w-6" />}
        value={wild}
        extra={`+${wildGain}`}
        extraTone="emerald"
        title={`Wildcards: ${wild} — each counts as whichever symbol scores best; one more is worth +${wildGain} VP now`}
      />
      <div className="col-span-4 flex h-10 items-center gap-4 rounded-ui-md bg-fill-soft px-3 ring-1 ring-inset ring-line-soft">
        <span
          className="flex items-baseline gap-1.5 text-3xs uppercase tracking-label text-fg-muted"
          title="A set of all three symbols is worth 7 VP"
        >
          Sets
          <span className="text-sm font-bold normal-case tracking-normal tabular-nums text-fg-primary">
            {sets}
          </span>
          <span className="normal-case tracking-normal">× 7</span>
        </span>
        <span className="ml-auto flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none tabular-nums text-fg-strong">
            {player.score.science}
          </span>
          <span className="text-4xs uppercase tracking-label text-fg-muted">VP</span>
        </span>
      </div>
    </div>
  );
}

const SCIENCE_NAME = { compass: "Compass", gear: "Gear", tablet: "Tablet" } as const;

/** Both borders as they would resolve if the age ended now. */
function Borders({
  view,
  seat,
  names,
}: {
  view: SevenWondersPlayerView;
  seat: number;
  names: readonly string[];
}) {
  const n = view.playerCount;
  const me = view.players[seat];
  const sides = [
    { seat: leftOf(seat, n), arrow: "◂" },
    { seat: rightOf(seat, n), arrow: "▸" },
  ];
  const tokens = me.militaryTokens;
  const row =
    "flex h-7 items-center gap-1.5 rounded-ui-md bg-fill-soft px-2 text-xs ring-1 ring-inset ring-line-soft";
  // Three fixed rows, the same frame on every board: each border's duel, then the tally.
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {sides.map(({ seat: other, arrow }) => {
        const them = view.players[other];
        const t = duelToken(me.shields, them.shields, view.age);
        return (
          <div key={arrow} className={row}>
            <span className="w-2.5 shrink-0 text-fg-muted">{arrow}</span>
            <span className="min-w-0 flex-1 truncate text-fg-secondary">{names[other]}</span>
            <span className="grid w-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-0.5 tabular-nums">
              <span
                className={cn(
                  "text-right font-bold",
                  t > 0 ? "text-emerald-300" : t < 0 ? "text-rose-300" : "text-fg-primary",
                )}
              >
                {me.shields}
              </span>
              <SevenIcon name="swords" className="h-4 w-4" />
              <span className="text-left text-fg-muted">{them.shields}</span>
            </span>
            <span className="flex w-7 shrink-0 justify-end">
              {t > 0 ? (
                <Amount kind="victory" value={`+${t}`} className="h-5 w-5" textClass="text-6xs" />
              ) : t < 0 ? (
                <Amount kind="defeat" value="−1" className="h-5 w-5" textClass="text-6xs" />
              ) : (
                <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted">
                  Tie
                </span>
              )}
            </span>
          </div>
        );
      })}
      <div className={cn(row, "gap-1")}>
        {tokens.length === 0 ? (
          <span className="text-2xs text-fg-muted">No battles fought yet</span>
        ) : (
          <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
            {tokens.map((t, i) =>
              t > 0 ? (
                <Amount
                  // biome-ignore lint/suspicious/noArrayIndexKey: tokens in the order they were won
                  key={i}
                  kind="victory"
                  value={t}
                  className="h-5 w-5 shrink-0"
                  textClass="text-6xs"
                />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: tokens in the order they were won
                <SevenIcon key={i} name="defeat" className="h-5 w-5 shrink-0" />
              ),
            )}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-baseline gap-1">
          <span className="text-base font-bold leading-none tabular-nums text-fg-strong">
            {me.score.military > 0 ? "+" : ""}
            {me.score.military}
          </span>
          <span className="text-4xs uppercase tracking-label text-fg-muted">VP</span>
        </span>
      </div>
    </div>
  );
}

/** The score as one stacked bar in the score pad's colours, and its legend. */
export function ScoreBar({
  player,
  showEdifice,
}: {
  player: SevenWondersPlayerBoardView;
  showEdifice: boolean;
}) {
  const s = player.score;
  const cats = SCORE_CATEGORIES.filter((c) => c.key !== "edifice" || showEdifice);
  const positive = cats.reduce((n, c) => n + Math.max(0, s[c.key]), 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-fill">
          {cats.map((c) =>
            s[c.key] > 0 ? (
              <span
                key={c.key}
                className="h-full"
                style={{ flexGrow: s[c.key], backgroundColor: c.hex }}
                title={`${c.label}: ${s[c.key]}`}
              />
            ) : null,
          )}
          {positive === 0 && <span className="flex-1" />}
        </span>
        <span className="flex items-baseline gap-0.5">
          <span className="text-lg font-bold tabular-nums text-fg-strong">{s.total}</span>
          <span className="text-4xs uppercase tracking-label text-fg-muted">VP</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {cats.map((c) => (
          <span
            key={c.key}
            className="flex items-center gap-1 text-3xs text-fg-muted"
            title={c.label}
          >
            <ScoreIcon category={c.key} className="h-3.5 w-3.5" />
            <span className="truncate">{c.label}</span>
            <span
              className={cn(
                "ml-auto tabular-nums",
                s[c.key] < 0 ? "text-rose-300" : s[c.key] > 0 ? "text-fg-primary" : "",
              )}
            >
              {s[c.key]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
