import type {
  Fate,
  HungerPlayerView,
  HungerResult,
  SeatBreakdown,
} from "@boardgames/core/games/the-hunger/types";
import { type ReactNode, useMemo, useState } from "react";
import { type GameOverAction, GameOverLayout } from "../../../components/game-over";
import { Eyebrow, MicroLabel, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { artUrl, vampireArt } from "../logic/art";
import { seatLabel, vampireColor, vampireName } from "../logic/labels";
import { type SeatStory, SOURCE_COLOR, SOURCES, scoreStory } from "../logic/score-story";
import CardPreview from "./CardPreview";
import HungerCard from "./HungerCard";
import MissionTile from "./MissionTile";
import VampireAvatar from "./VampireAvatar";

interface Props {
  view: HungerPlayerView;
  result: HungerResult;
  names: readonly (string | null)[];
  actions: readonly GameOverAction[];
}

const FATE: Record<Fate, { label: string; tone: string }> = {
  castle: {
    label: "Safe in the Castle",
    tone: "text-emerald-200 bg-emerald-500/15 ring-emerald-400/40",
  },
  cemetery: { label: "Cemetery vault · −5", tone: "text-sky-200 bg-sky-500/15 ring-sky-400/40" },
  mountains: { label: "Mountain shelter", tone: "text-sky-200 bg-sky-500/15 ring-sky-400/40" },
  ashes: { label: "Burned to ashes", tone: "text-rose-200 bg-rose-500/15 ring-rose-400/40" },
};

/**
 * Sunrise: the whole night told on one wide screen. The Vampires stand in
 * the dawn in finishing order; beside it, how every score grew night by
 * night and what it was made of; below, one column per Vampire with every
 * Mission tile and End-of-game card that counted, and what each was worth.
 */
export default function GameOverScreen({ view, result, names, actions }: Props) {
  const mine = view.me >= 0;
  const iWon = mine && result.winners.includes(view.me);
  const winnerLabel = result.winner === null ? null : seatLabel(view, result.winner, names);
  const order = useMemo(
    () =>
      [...result.placements.keys()].sort(
        (a, b) => result.placements[a] - result.placements[b] || a - b,
      ),
    [result.placements],
  );
  const stories = useMemo(() => scoreStory(view.log, result), [view.log, result]);
  const my = mine ? result.breakdown[view.me] : undefined;
  const label = (seat: number) => seatLabel(view, seat, names);

  return (
    // The results run long, so the screen scrolls itself.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <GameOverLayout
        wide
        headline={iWon ? "You Win!" : winnerLabel ? `${winnerLabel} wins` : "A shared crown"}
        headlineColor={iWon ? "win" : mine ? "lose" : "neutral"}
        subtitle={
          my?.fate === "ashes"
            ? "The sun found you before you found home."
            : "The sun rises on the Castle."
        }
        actions={[...actions]}
      >
        <div className="flex flex-col gap-6">
          <Podium view={view} result={result} order={order} label={label} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Surface variant="panel" padding="lg" className="flex flex-col gap-4">
              <PanelHead
                title="The night, in points"
                note="Each Vampire's score after every night, then at sunrise"
              />
              <ScoreChart view={view} stories={stories} order={order} label={label} />
            </Surface>
            <Surface variant="panel" padding="lg" className="flex flex-col gap-4">
              <PanelHead
                title="Where the points came from"
                note="Every score split by its source — hover a segment for its value"
              />
              <Composition view={view} stories={stories} order={order} label={label} />
            </Surface>
          </div>

          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(order.length, 3)}, minmax(0, 1fr))`,
            }}
          >
            {order.map((seat) => (
              <SeatColumn
                key={seat}
                rank={result.placements[seat]}
                winner={result.winners.includes(seat)}
                vampire={view.players[seat]?.vampire ?? seat}
                name={label(seat)}
                b={result.breakdown[seat]}
                story={stories[seat]}
              />
            ))}
          </div>
          <p className="text-center text-xs text-fg-muted">
            Burned Vampires keep their points for the glory of it, but rank below every survivor.
          </p>
        </div>
      </GameOverLayout>
    </div>
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

/** Everyone in the dawn, in finishing order: the winner tallest, in the middle. */
function Podium({
  view,
  result,
  order,
  label,
}: {
  view: HungerPlayerView;
  result: HungerResult;
  order: number[];
  label: (seat: number) => string;
}) {
  // Winner in the middle, then alternating outwards: 4 2 1 3 5.
  const staged: number[] = [];
  order.forEach((seat, i) => {
    if (i % 2 === 0) staged.push(seat);
    else staged.unshift(seat);
  });
  const sunrise = artUrl("sunrise-backdrop");
  return (
    <div className="relative overflow-hidden rounded-card-2xl shadow-2xl ring-1 ring-line">
      {sunrise && (
        <img
          src={sunrise}
          alt="Dawn breaks over the Castle"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/40 to-transparent" />
      <div className="relative flex h-podium items-end justify-center gap-2 px-6 pb-5 lg:gap-6">
        {staged.map((seat) => {
          const rank = result.placements[seat];
          const p = view.players[seat];
          const b = result.breakdown[seat];
          const art = p ? vampireArt(p.vampire, "full") : undefined;
          const burned = b.fate === "ashes";
          const height = rank === 1 ? "66%" : rank === 2 ? "56%" : "48%";
          return (
            <div
              key={seat}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              {art && (
                <img
                  src={art}
                  alt={p ? vampireName(p.vampire) : ""}
                  draggable={false}
                  className="w-auto max-w-full object-contain drop-shadow-2xl"
                  style={{
                    height,
                    // Ashes: drained of colour, lit from behind by the embers.
                    filter: burned
                      ? "grayscale(1) brightness(1.05) contrast(1.1) drop-shadow(0 0 18px rgb(251 113 133 / 0.55))"
                      : undefined,
                  }}
                />
              )}
              <div className="flex flex-col items-center gap-1 text-center">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full font-card text-sm font-semibold ring-1",
                    rank === 1
                      ? "bg-amber-400/25 text-amber-100 ring-amber-300/70"
                      : "bg-surface-950/70 text-fg-secondary ring-line-strong",
                  )}
                >
                  {rank}
                </span>
                <span className="max-w-full truncate font-card text-lg font-semibold text-fg-strong drop-shadow">
                  {label(seat)}
                </span>
                <span className="font-card text-3xl font-semibold tabular-nums text-fg-strong drop-shadow">
                  {b.total}
                  <span className="ml-1 text-sm font-medium text-fg-secondary">VP</span>
                </span>
                <FateChip fate={b.fate} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FateChip({ fate }: { fate: Fate }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-3xs font-semibold uppercase tracking-label ring-1",
        FATE[fate].tone,
      )}
    >
      {FATE[fate].label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The night, in points: one line per Vampire, direct-labeled at its end.
// ---------------------------------------------------------------------------

const CW = 640;
const CH = 280;
const PAD = { l: 40, r: 176, t: 12, b: 30 };

function ScoreChart({
  view,
  stories,
  order,
  label,
}: {
  view: HungerPlayerView;
  stories: SeatStory[];
  order: number[];
  label: (seat: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = Math.max(...stories.map((s) => s.curve.length));
  const top = Math.max(10, ...stories.flatMap((s) => s.curve));
  const step = top > 100 ? 25 : top > 50 ? 20 : 10;
  const yMax = Math.ceil(top / step) * step;
  const inner = CW - PAD.l - PAD.r;
  const colW = inner / Math.max(1, points - 1);
  const x = (i: number) => PAD.l + i * colW;
  const y = (v: number) => PAD.t + (1 - v / yMax) * (CH - PAD.t - PAD.b);
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const lastIndex = points - 1;
  const colorOf = (seat: number) => vampireColor(view.players[seat]?.vampire ?? seat);

  // Direct labels at the line ends, nudged apart so they never collide.
  const ends = order
    .map((seat) => ({ seat, y: y(stories[seat].curve.at(-1) ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 18) ends[i].y = ends[i - 1].y + 18;
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        className="w-full text-fg-muted"
        role="img"
        aria-label="Each Vampire's score after every night"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={CW - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="currentColor"
              strokeOpacity={0.18}
              strokeWidth={1}
            />
            <text
              x={PAD.l - 8}
              y={y(t) + 4}
              textAnchor="end"
              fill="currentColor"
              fontSize={10}
              className="tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}
        {Array.from({ length: points }, (_, i) => i).map((i) => (
          <text
            key={i}
            x={x(i)}
            y={CH - 10}
            textAnchor="middle"
            fontSize={10}
            fill={i === lastIndex ? "#fde68a" : "currentColor"}
            fontWeight={i === lastIndex ? 600 : 400}
            className="tabular-nums"
          >
            {i === lastIndex ? "Dawn" : i % 2 === 0 || points <= 10 ? i + 1 : ""}
          </text>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.t}
            y2={CH - PAD.b}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
        )}
        {order.map((seat) => {
          const curve = stories[seat].curve;
          const d = curve.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
          return (
            <g key={seat}>
              <path
                d={d}
                fill="none"
                stroke={colorOf(seat)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={x(curve.length - 1)}
                cy={y(curve.at(-1) ?? 0)}
                r={4.5}
                fill={colorOf(seat)}
                stroke="#0e0b12"
                strokeWidth={2}
              />
              {hover !== null && hover < curve.length && (
                <circle
                  cx={x(hover)}
                  cy={y(curve[hover])}
                  r={4}
                  fill={colorOf(seat)}
                  stroke="#0e0b12"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
        {ends.map(({ seat, y: ly }) => (
          <g key={seat}>
            <line
              x1={x(lastIndex) + 6}
              x2={x(lastIndex) + 14}
              y1={y(stories[seat].curve.at(-1) ?? 0)}
              y2={ly}
              stroke="currentColor"
              strokeOpacity={0.4}
            />
            <text x={x(lastIndex) + 18} y={ly + 4} fontSize={11} fill="currentColor">
              {label(seat)}{" "}
              <tspan fill="#f7efe6" fontWeight={600} className="tabular-nums">
                {stories[seat].curve.at(-1)}
              </tspan>
            </text>
          </g>
        ))}
        {/* Hover targets: one column per night, wider than its marks. */}
        {Array.from({ length: points }, (_, i) => i).map((i) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover-only crosshair; the numbers are also in each Vampire's column
          <rect
            key={`hit-${i}`}
            x={x(i) - colW / 2}
            y={PAD.t}
            width={colW}
            height={CH - PAD.t - PAD.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-tooltip rounded-card-md bg-surface-900/95 px-3 py-2 text-xs shadow-xl ring-1 ring-line"
          style={{
            left: `${(x(hover) / CW) * 100}%`,
            transform: hover > points / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <div className="mb-1 font-semibold text-fg-strong">
            {hover === lastIndex ? "At sunrise" : `After night ${hover + 1}`}
          </div>
          {order.map((seat) => (
            <div key={seat} className="flex items-center gap-2 tabular-nums">
              <span className="h-2 w-2 rounded-full" style={{ background: colorOf(seat) }} />
              <span className="text-fg-secondary">{label(seat)}</span>
              <span className="ml-auto pl-3 font-semibold text-fg-strong">
                {stories[seat].curve[hover] ?? stories[seat].curve.at(-1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where the points came from: one stacked bar per Vampire, on one scale.
// ---------------------------------------------------------------------------

function Composition({
  view,
  stories,
  order,
  label,
}: {
  view: HungerPlayerView;
  stories: SeatStory[];
  order: number[];
  label: (seat: number) => string;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const max = Math.max(
    1,
    ...stories.map(
      (s) => Object.values(s.sources).reduce((a, b) => a + b, 0) + Math.max(0, s.other),
    ),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {SOURCES.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1.5 text-xs text-fg-secondary"
            title={s.hint}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SOURCE_COLOR[s.id] }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {order.map((seat) => {
          const st = stories[seat];
          return (
            <div key={seat} className="grid grid-cols-[12rem_1fr_3.5rem] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <VampireAvatar vampire={view.players[seat]?.vampire ?? seat} className="h-7 w-7" />
                <span className="truncate text-sm text-fg-primary">{label(seat)}</span>
              </span>
              <div
                className="flex h-6 gap-0.5"
                role="img"
                aria-label={`${label(seat)}: ${st.total} VP`}
              >
                {SOURCES.map((s) => {
                  const v = st.sources[s.id];
                  if (v <= 0) return null;
                  const text = `${label(seat)} · ${s.label}: ${v} VP`;
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: hover readout; the same values are listed in each Vampire's column
                    <span
                      key={s.id}
                      className="h-full rounded-ui-md transition-opacity hover:opacity-80"
                      style={{ width: `${(v / max) * 100}%`, background: SOURCE_COLOR[s.id] }}
                      title={text}
                      onMouseEnter={() => setTip(text)}
                      onMouseLeave={() => setTip(null)}
                    />
                  );
                })}
              </div>
              <span className="text-right font-card text-base font-semibold tabular-nums text-fg-strong">
                {st.total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="min-h-4 text-xs text-fg-secondary">
        {tip ?? (
          <span className="text-fg-muted">
            A sunrise loss (Cemetery, Mountains) is shown in each Vampire's tally below.
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One column per Vampire: every source, then the real Mission tiles and
// End-of-game cards, each with what it was worth.
// ---------------------------------------------------------------------------

function SeatColumn({
  rank,
  winner,
  vampire,
  name,
  b,
  story,
}: {
  rank: number;
  winner: boolean;
  vampire: number;
  name: string;
  b: SeatBreakdown;
  story: SeatStory;
}) {
  const color = vampireColor(vampire);
  return (
    <Surface variant="panel" padding="none" className="flex flex-col overflow-hidden">
      <header
        className="flex items-center gap-3 px-5 py-4"
        style={{ background: `linear-gradient(120deg, ${color}33, transparent 70%)` }}
      >
        <VampireAvatar vampire={vampire} className="h-14 w-14" dim={b.fate === "ashes"} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="flex max-w-full items-center gap-2">
            <span className="truncate font-card text-lg font-semibold text-fg-strong">{name}</span>
            {winner && (
              <span role="img" aria-label="winner">
                👑
              </span>
            )}
          </span>
          <FateChip fate={b.fate} />
        </div>
        <div className="flex flex-col items-end">
          <span className="font-card text-3xl font-semibold tabular-nums text-fg-strong">
            {b.total}
          </span>
          <MicroLabel>#{rank} · VP</MicroLabel>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-5 pb-5 pt-3">
        <Section title="The tally">
          <div className="flex flex-col gap-1.5 text-sm">
            {SOURCES.map((s) => (
              <Row
                key={s.id}
                swatch={SOURCE_COLOR[s.id]}
                label={s.label}
                hint={s.hint}
                vp={story.sources[s.id]}
              />
            ))}
            {story.other !== 0 && <Row label="Other" vp={story.other} />}
            <Row label="Sunrise" vp={b.sunrise} />
            <div className="mt-1 flex items-baseline justify-between border-t border-line-soft pt-2 font-semibold text-fg-strong">
              <span>Total</span>
              <span className="font-card text-lg tabular-nums">{b.total}</span>
            </div>
          </div>
        </Section>

        {b.missions.length > 0 && (
          <Section
            title={`Missions · +${b.publicMissions + b.personalMissions}`}
            note="Dimmed: scored nothing"
          >
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {b.missions.map((m) => (
                <div
                  key={`${m.public ? "public" : "own"}-${m.id}`}
                  className={cn("relative", m.vp === 0 && "opacity-45 saturate-50")}
                >
                  <MissionTile
                    id={m.id}
                    badge={m.used ? "spent" : m.public ? "public" : undefined}
                    className="h-full"
                  />
                  <VpChip vp={m.vp} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {b.cards.length > 0 && (
          <Section title={`End-of-game cards · +${b.cardBonuses}`}>
            <div className="flex flex-wrap gap-3">
              {b.cards.map((c) => (
                <div key={c.card} className="relative w-24">
                  <CardPreview card={c.card}>
                    <HungerCard card={c.card} />
                  </CardPreview>
                  <VpChip vp={c.vp} />
                </div>
              ))}
            </div>
          </Section>
        )}
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

function Row({
  label,
  vp,
  swatch,
  hint,
}: {
  label: string;
  vp: number;
  swatch?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2" title={hint}>
      <span
        className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", !swatch && "bg-fill-strong")}
        style={swatch ? { background: swatch } : undefined}
      />
      <span
        className={cn("min-w-0 flex-1 truncate", vp === 0 ? "text-fg-muted" : "text-fg-secondary")}
      >
        {label}
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

/** What a tile or card was worth, pinned to its corner. */
function VpChip({ vp }: { vp: number }) {
  return (
    <span
      className={cn(
        "absolute -right-2 -top-2 z-lift flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 font-card text-xs font-semibold tabular-nums shadow-lg ring-2 ring-surface-900",
        vp > 0 ? "bg-rose-800 text-rose-50" : "bg-surface-700 text-fg-muted",
      )}
    >
      {vp > 0 ? `+${vp}` : vp}
    </span>
  );
}
