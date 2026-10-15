import type {
  SevenWondersPlayerBoardView,
  SevenWondersPlayerView,
  SevenWondersResult,
} from "@boardgames/core/games/7-wonders/machine";
import type { ScoreBreakdown } from "@boardgames/core/games/7-wonders/scoring";
import type { CardColor, CardId } from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useState } from "react";
import { type GameOverAction, GameOverLayout } from "../../../components/game-over";
import { Eyebrow, MicroLabel, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import {
  COLOR_HEX,
  COLOR_LABEL,
  defOf,
  SCORE_CATEGORIES,
  type ScoreCategory,
  TABLEAU_ORDER,
} from "../card-utils";
import { artUrl, crestArt, WONDER_FOCUS, wonderBoardArt } from "../logic/art";
import { seatLabels } from "../logic/table";
import CardArt from "./CardArt";
import CardPreview from "./CardPreview";
import SevenIcon, { Amount, CoinToken, ScoreIcon } from "./SevenIcon";
import WonderMedallion from "./WonderMedallion";

interface GameOverScreenProps {
  result: SevenWondersResult;
  /** The final table: each seat's wonder, cards and coins. */
  view: SevenWondersPlayerView;
  myIndex: number;
  /** Who sat at each seat ("You", room names, AI labels). */
  seatNames: readonly string[];
  actions: readonly GameOverAction[];
}

type Category = (typeof SCORE_CATEGORIES)[number];

/**
 * The count, told on one wide screen. The cities stand in the victory
 * parade in finishing order, the winner wreathed in the middle; beside it,
 * what every score was made of and who took each category; below, one
 * column per city with its tally and every card it built.
 */
export default function GameOverScreen({
  result,
  view,
  myIndex,
  seatNames,
  actions,
}: GameOverScreenProps) {
  const n = result.totals.length;
  const names = seatLabels(
    view.players.map((p) => p.wonderId),
    myIndex,
    seatNames,
  );
  const iWon = result.winner === myIndex;
  const winner = view.players[result.winner];
  // Most points first; level on points, the winner (most coins) first.
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) =>
      result.totals[b] - result.totals[a] ||
      (a === result.winner ? -1 : b === result.winner ? 1 : 0) ||
      (view.players[b]?.coins ?? 0) - (view.players[a]?.coins ?? 0),
  );
  const rank = new Map(order.map((seat, k) => [seat, k + 1]));
  const categories = SCORE_CATEGORIES.filter(
    (c) => c.key !== "edifice" || result.breakdowns.some((b) => b.edifice !== 0),
  );
  const myRank = rank.get(myIndex);
  const tiedOnTop = n > 1 && result.totals[order[0]] === result.totals[order[1]];

  return (
    <GameOverLayout
      wide
      headline={iWon ? "You win!" : `${names[result.winner] ?? "Someone"} wins`}
      headlineColor={iWon ? "win" : myRank !== undefined ? "lose" : "neutral"}
      subtitle={
        winner
          ? `${result.totals[result.winner]} points with ${getWonderDef(winner.wonderId).name}${
              tiedOnTop ? " — level on points, ahead on coins" : ""
            }`
          : undefined
      }
      actions={actions}
    >
      <div className="flex flex-col gap-6">
        <Parade view={view} result={result} order={order} names={names} />

        <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <Surface variant="panel" padding="lg" className="flex flex-col gap-4">
            <PanelHead
              title="Where the points came from"
              note="Every score split by category, on one scale — hover a segment for its value"
            />
            <Composition
              view={view}
              result={result}
              order={order}
              names={names}
              categories={categories}
            />
          </Surface>
          <Surface variant="panel" padding="lg" className="flex flex-col gap-4">
            <PanelHead title="Category crowns" note="Who scored the most in each" />
            <Crowns view={view} result={result} names={names} categories={categories} />
          </Surface>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {order.map((seat) => (
            <CityColumn
              key={seat}
              rank={rank.get(seat) ?? 0}
              winner={seat === result.winner}
              mine={seat === myIndex}
              player={view.players[seat]}
              name={names[seat]}
              b={result.breakdowns[seat]}
              categories={categories}
            />
          ))}
        </div>
        <p className="text-center text-xs text-fg-muted">
          Level on points, the city with more coins wins.
        </p>
      </div>
    </GameOverLayout>
  );
}

function PanelHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Eyebrow size="sm">{title}</Eyebrow>
      <span className="text-xs text-fg-muted">{note}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The victory parade: every city in finishing order, the winner in the middle.
// ---------------------------------------------------------------------------

function Parade({
  view,
  result,
  order,
  names,
}: {
  view: SevenWondersPlayerView;
  result: SevenWondersResult;
  order: number[];
  names: readonly string[];
}) {
  const reduced = useReducedMotion();
  // Winner in the middle, then alternating outwards: 4 2 1 3 5.
  const staged: number[] = [];
  order.forEach((seat, i) => {
    if (i % 2 === 0) staged.push(seat);
    else staged.unshift(seat);
  });
  const parade = artUrl("bg-victory");
  const wreath = artUrl("frame-laurel");
  return (
    <div className="relative isolate overflow-hidden rounded-card-2xl shadow-2xl ring-1 ring-black/60">
      {parade && (
        <img
          src={parade}
          alt="The victory parade"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ objectPosition: "50% 40%" }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgb(10 8 6 / 0.96) 0%, rgb(10 8 6 / 0.55) 45%, rgb(10 8 6 / 0.15) 100%)",
        }}
      />
      <div className="relative flex h-podium items-end justify-center gap-2 px-4 pb-6 lg:gap-6">
        {staged.map((seat, k) => {
          const place = order.indexOf(seat) + 1;
          const p = view.players[seat];
          const first = seat === result.winner;
          const crest = p ? crestArt(p.wonderId) : undefined;
          const size = first ? "h-44 w-44" : place === 2 ? "h-28 w-28" : "h-24 w-24";
          return (
            <motion.div
              key={seat}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.15 + Math.abs(k - staged.length / 2) * 0.1 }}
              className="flex min-w-0 max-w-56 flex-1 flex-col items-center justify-end gap-2"
            >
              <div className={cn("relative shrink-0", size)}>
                {crest ? (
                  <img
                    src={crest}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className={cn(
                      "absolute select-none rounded-full object-contain drop-shadow-[0_10px_22px_rgb(0_0_0/0.75)]",
                      first ? "inset-[20%] h-[60%] w-[60%]" : "inset-0 h-full w-full",
                    )}
                  />
                ) : (
                  p && (
                    <WonderMedallion
                      wonderId={p.wonderId}
                      side={p.side}
                      stagesBuilt={p.stagesBuilt}
                      className="absolute inset-[20%] h-[60%] w-[60%]"
                    />
                  )
                )}
                {first && wreath && (
                  <motion.img
                    src={wreath}
                    alt=""
                    aria-hidden
                    draggable={false}
                    initial={reduced ? false : { scale: 0.7, opacity: 0, rotate: -10 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 150, damping: 13, delay: 0.5 }}
                    className="absolute inset-0 h-full w-full select-none object-contain drop-shadow-[0_6px_14px_rgb(0_0_0/0.6)]"
                  />
                )}
              </div>
              <div className="flex max-w-full flex-col items-center gap-1 text-center">
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ring-1",
                    first
                      ? "bg-amber-300 text-surface-950 ring-amber-200"
                      : "bg-surface-950/80 text-fg-secondary ring-line-strong",
                  )}
                >
                  {place}
                </span>
                <span className="max-w-full truncate text-base font-semibold text-fg-strong drop-shadow">
                  {names[seat]}
                </span>
                {p && (
                  <span className="max-w-full truncate font-fantasy text-xs text-amber-100/80">
                    {getWonderDef(p.wonderId).name}
                  </span>
                )}
                <span
                  className={cn(
                    "font-bold tabular-nums drop-shadow-lg",
                    first ? "text-5xl text-amber-200" : "text-3xl text-fg-strong",
                  )}
                >
                  {result.totals[seat]}
                  <span className="ml-1 text-sm font-medium text-fg-secondary">VP</span>
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where the points came from: one stacked bar per city, on one scale.
// ---------------------------------------------------------------------------

function Composition({
  view,
  result,
  order,
  names,
  categories,
}: {
  view: SevenWondersPlayerView;
  result: SevenWondersResult;
  order: number[];
  names: readonly string[];
  categories: readonly Category[];
}) {
  const [tip, setTip] = useState<string | null>(null);
  const positive = (b: ScoreBreakdown) => categories.reduce((s, c) => s + Math.max(0, b[c.key]), 0);
  const max = Math.max(1, ...result.breakdowns.map(positive));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {categories.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <ScoreIcon category={c.key} className="h-4 w-4" />
            {c.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {order.map((seat) => {
          const b = result.breakdowns[seat];
          const p = view.players[seat];
          return (
            <div key={seat} className="grid grid-cols-[11rem_1fr_3rem] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2">
                {p && (
                  <WonderMedallion
                    wonderId={p.wonderId}
                    side={p.side}
                    stagesBuilt={p.stagesBuilt}
                    className="h-7 w-7"
                  />
                )}
                <span className="truncate text-sm text-fg-primary">{names[seat]}</span>
              </span>
              <div
                className="flex h-6 gap-0.5"
                role="img"
                aria-label={`${names[seat]}: ${b.total} VP`}
              >
                {categories.map((c) => {
                  const v = b[c.key];
                  if (v <= 0) return null;
                  const text = `${names[seat]} · ${c.label}: ${v} VP`;
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: hover readout; the same values are in each city's tally
                    <span
                      key={c.key}
                      className="h-full rounded-ui-md transition-opacity hover:opacity-80"
                      style={{ width: `${(v / max) * 100}%`, background: c.hex }}
                      title={text}
                      onMouseEnter={() => setTip(text)}
                      onMouseLeave={() => setTip(null)}
                    />
                  );
                })}
              </div>
              <span className="text-right text-base font-bold tabular-nums text-fg-strong">
                {b.total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="min-h-4 text-xs text-fg-secondary">
        {tip ?? (
          <span className="text-fg-muted">
            Military defeats and Edifice debts subtract — each city's tally below has them.
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category crowns: who took each category, and by how much.
// ---------------------------------------------------------------------------

function Crowns({
  view,
  result,
  names,
  categories,
}: {
  view: SevenWondersPlayerView;
  result: SevenWondersResult;
  names: readonly string[];
  categories: readonly Category[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {categories.map((c) => {
        const values = result.breakdowns.map((b) => b[c.key]);
        const best = Math.max(...values);
        const leaders = values.flatMap((v, i) => (v === best ? [i] : []));
        const runnerUp = Math.max(-Infinity, ...values.filter((v) => v < best));
        const nobody = best <= 0;
        const lead = leaders[0];
        const p = view.players[lead];
        return (
          <div
            key={c.key}
            className="flex items-center gap-3 rounded-card-lg bg-fill-soft px-3 py-2 ring-1 ring-line-soft"
            style={{ boxShadow: `inset 3px 0 0 ${c.hex}` }}
          >
            <ScoreIcon category={c.key} className="h-7 w-7" />
            <div className="flex min-w-0 flex-1 flex-col">
              <MicroLabel>{c.label}</MicroLabel>
              {nobody ? (
                <span className="text-sm text-fg-muted">Nobody scored</span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-fg-strong">
                  {p && leaders.length === 1 && (
                    <WonderMedallion
                      wonderId={p.wonderId}
                      side={p.side}
                      stagesBuilt={p.stagesBuilt}
                      className="h-5 w-5"
                    />
                  )}
                  <span className="truncate">
                    {leaders.length === 1 ? names[lead] : `${leaders.length} cities level`}
                  </span>
                </span>
              )}
            </div>
            {!nobody && (
              <div className="flex flex-col items-end">
                <span className="text-lg font-bold tabular-nums text-fg-strong">{best}</span>
                {leaders.length === 1 && Number.isFinite(runnerUp) && (
                  <span className="text-4xs tabular-nums text-fg-muted">
                    +{best - runnerUp} ahead
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One column per city: the tally, then every card it built.
// ---------------------------------------------------------------------------

function CityColumn({
  rank,
  winner,
  mine,
  player,
  name,
  b,
  categories,
}: {
  rank: number;
  winner: boolean;
  mine: boolean;
  player: SevenWondersPlayerBoardView | undefined;
  name: string;
  b: ScoreBreakdown;
  categories: readonly Category[];
}) {
  if (!player) return null;
  const def = getWonderDef(player.wonderId);
  const painting = wonderBoardArt(player.wonderId, player.side);
  const focus = WONDER_FOCUS[player.wonderId];
  const byColor = new Map<CardColor, CardId[]>();
  for (const id of player.tableau) {
    const c = defOf(id).color;
    byColor.set(c, [...(byColor.get(c) ?? []), id]);
  }
  const stages = def.sides[player.side].stages.length;
  return (
    <Surface
      variant="panel"
      padding="none"
      className={cn(
        "flex flex-col overflow-hidden",
        winner && "ring-2 ring-amber-300/70",
        mine && !winner && "ring-1 ring-accent-400/50",
      )}
    >
      <header className="relative isolate flex h-28 items-end gap-3 overflow-hidden px-4 pb-3">
        {painting && (
          <img
            src={painting}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{ objectPosition: `${focus.x * 100}% ${focus.y * 100}%` }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "linear-gradient(0deg, rgb(14 11 9 / 0.95) 5%, rgb(14 11 9 / 0.25) 100%)",
          }}
        />
        <WonderMedallion
          wonderId={player.wonderId}
          side={player.side}
          stagesBuilt={player.stagesBuilt}
          className="relative h-14 w-14"
        />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-lg font-semibold text-fg-strong">{name}</span>
            {winner && (
              <span className="shrink-0 rounded-full bg-amber-300 px-2 py-px text-4xs font-bold uppercase tracking-label text-surface-950">
                Winner
              </span>
            )}
          </span>
          <span className="truncate font-fantasy text-xs text-amber-100/85">
            {def.name} · {player.side === "A" ? "☀ Day" : "☾ Night"}
          </span>
        </div>
        <div className="relative flex flex-col items-end">
          <span className="text-3xl font-bold tabular-nums text-fg-strong drop-shadow">
            {b.total}
          </span>
          <MicroLabel>#{rank} · VP</MicroLabel>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-4 pb-5 pt-4">
        <Section title="The tally">
          <div className="flex flex-col gap-1.5 text-sm">
            {categories.map((c) => (
              <TallyRow key={c.key} category={c} vp={b[c.key]} />
            ))}
            <div className="mt-1 flex items-baseline justify-between border-t border-line-soft pt-2 font-semibold text-fg-strong">
              <span>Total</span>
              <span className="text-lg tabular-nums">{b.total}</span>
            </div>
          </div>
        </Section>

        <Section
          title="The city"
          note={`${player.tableau.length} cards · wonder ${player.stagesBuilt}/${stages}`}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-secondary">
            <span className="flex items-center gap-1 font-semibold text-fg-primary">
              <CoinToken className="h-5 w-5" />
              {player.coins}
              <span className="font-normal text-fg-muted">coins left</span>
            </span>
            <span className="flex items-center gap-1 font-semibold text-fg-primary">
              <SevenIcon name="shield" className="h-4 w-4" />
              {player.shields}
              <span className="font-normal text-fg-muted">shields</span>
            </span>
            {player.militaryTokens.length > 0 && (
              <span className="flex items-center gap-0.5">
                {player.militaryTokens.map((t, i) =>
                  t > 0 ? (
                    <Amount
                      // biome-ignore lint/suspicious/noArrayIndexKey: tokens in the order they were won
                      key={i}
                      kind="victory"
                      value={t}
                      className="h-5 w-5"
                      textClass="text-6xs"
                    />
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: tokens in the order they were won
                    <SevenIcon key={i} name="defeat" className="h-5 w-5" />
                  ),
                )}
              </span>
            )}
          </div>
          {/* Every card, grouped by colour: the cards of a colour overlap like a held fan. */}
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {TABLEAU_ORDER.filter((c) => byColor.has(c)).map((color) => (
              <div
                key={color}
                className="flex border-b-2 pb-1"
                style={{ borderColor: COLOR_HEX[color] }}
                title={`${COLOR_LABEL[color]} · ${byColor.get(color)?.length ?? 0}`}
              >
                {(byColor.get(color) ?? []).map((id, i) => (
                  <CardPreview
                    key={id}
                    cardId={id}
                    className={cn("w-11 shrink-0", i > 0 && "-ml-6")}
                  >
                    <CardArt cardId={id} variant="mini" />
                  </CardPreview>
                ))}
              </div>
            ))}
            {player.tableau.length === 0 && (
              <span className="text-xs text-fg-muted">No cards built.</span>
            )}
          </div>
        </Section>
      </div>
    </Surface>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <MicroLabel>{title}</MicroLabel>
        {note && <span className="text-3xs text-fg-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function TallyRow({
  category,
  vp,
}: {
  category: { key: ScoreCategory; label: string; hex: string };
  vp: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: category.hex }} />
      <ScoreIcon category={category.key} className="h-4 w-4" />
      <span
        className={cn("min-w-0 flex-1 truncate", vp === 0 ? "text-fg-muted" : "text-fg-secondary")}
      >
        {category.label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          vp === 0
            ? "text-fg-muted"
            : vp < 0
              ? "font-semibold text-rose-300"
              : "font-semibold text-fg-primary",
        )}
      >
        {vp > 0 ? `+${vp}` : vp}
      </span>
    </div>
  );
}
