import type {
  SevenWondersPlayerBoardView,
  SevenWondersPlayerView,
} from "@boardgames/core/games/7-wonders/machine";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { COLOR_HEX, TABLEAU_ORDER } from "../card-utils";
import { artUrl, WONDER_FOCUS, wonderBoardArt } from "../logic/art";
import { colorCount } from "../logic/metrics";
import {
  navKeys,
  neighbourOf,
  type SeatStatus,
  seatStatus,
  seatsFrom,
  type ViewId,
} from "../logic/table";
import AgeTracker from "./AgeTracker";
import SevenIcon from "./SevenIcon";
import WonderMedallion from "./WonderMedallion";

interface Props {
  view: SevenWondersPlayerView;
  myIndex: number;
  names: readonly string[];
  current: ViewId;
  citySeat: number;
  attention: ReadonlySet<ViewId>;
  onSelect: (view: ViewId, seat?: number) => void;
  /** Phone: a row of tabs instead of the left-panel list. */
  compact?: boolean;
}

/**
 * The left panel, spread over its full height: the age, the table views,
 * and a city for every seat — yours first, then round the table to your
 * left. A pulse marks the place holding something you need to do.
 */
export default function CityNavigator({
  view,
  myIndex,
  names,
  current,
  citySeat,
  attention,
  onSelect,
  compact = false,
}: Props) {
  const seats = seatsFrom(myIndex, view.playerCount);
  const hasEdifice = Boolean(view.edifices);
  const n = view.playerCount;
  const keys = navKeys(hasEdifice);
  // The rail packs itself to the table: roomy for three, one-line view rows
  // from four, and one-line cities for the biggest tables — every seat fits
  // the rail's height, nothing scrolls, nothing overlaps.
  const rows = n + (hasEdifice ? 1 : 0);
  const dense = rows >= 4;
  const oneLine = n >= 6 || rows >= 6;
  const openProjects = view.edifices?.filter((e) => e.status === "project").length ?? 0;
  const views: {
    id: "table" | "overview" | "chains" | "edifice";
    label: string;
    sub: string;
    nav: string;
    fallback: string | undefined;
  }[] = [
    {
      id: "table",
      label: "Table",
      sub: "Everyone around the table",
      nav: "nav-table",
      fallback: artUrl("emblem-seven-wonders"),
    },
    {
      id: "overview",
      label: "Overview",
      sub: "Every city side by side",
      nav: "nav-overview",
      fallback: artUrl("icon-laurel"),
    },
    {
      id: "chains",
      label: "Chains",
      sub: "Which card builds which for free",
      nav: "nav-chains",
      fallback: artUrl("icon-chain"),
    },
    ...(hasEdifice
      ? [
          {
            id: "edifice" as const,
            label: "Edifice",
            sub: `${openProjects} open project${openProjects === 1 ? "" : "s"}`,
            nav: "nav-edifice",
            fallback: artUrl("icon-edifice"),
          },
        ]
      : []),
  ];

  if (compact) {
    return (
      <nav
        aria-label="Game views"
        className="flex w-full shrink-0 items-center gap-1 overflow-x-auto"
      >
        <AgeTracker view={view} compact />
        <Tab
          label="Table"
          nav="nav-table"
          active={current === "table"}
          onClick={() => onSelect("table")}
        />
        <Tab
          label="Overview"
          nav="nav-overview"
          active={current === "overview"}
          onClick={() => onSelect("overview")}
        />
        <Tab
          label="Chains"
          nav="nav-chains"
          active={current === "chains"}
          onClick={() => onSelect("chains")}
        />
        {hasEdifice && (
          <Tab
            label="Edifice"
            nav="nav-edifice"
            active={current === "edifice"}
            onClick={() => onSelect("edifice")}
          />
        )}
        {seats.map((seat) => {
          const p = view.players[seat];
          const on = current === "city" && citySeat === seat;
          return (
            <Button
              key={seat}
              variant={on ? "tinted" : "ghost"}
              tone="accent"
              size="xs"
              onClick={() => onSelect("city", seat)}
              aria-label={`${names[seat]}'s city`}
              aria-current={on ? "page" : undefined}
              className={cn("relative shrink-0 px-1", !on && "border border-transparent")}
            >
              <WonderMedallion
                wonderId={p.wonderId}
                side={p.side}
                stagesBuilt={p.stagesBuilt}
                className="h-7 w-7"
              />
              {seat === myIndex && attention.has("city") && !on && <AttentionDot />}
            </Button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Game views"
      className={cn("flex h-full min-h-0 flex-col", dense ? "gap-3" : "gap-5")}
    >
      <AgeTracker view={view} />

      <Group title="The table">
        {oneLine ? (
          // The biggest tables: the views as one row of medallion tiles.
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}
          >
            {views.map((v) => (
              <Button
                key={v.id}
                variant={current === v.id ? "tinted" : "ghost"}
                tone="accent"
                onClick={() => onSelect(v.id)}
                aria-current={current === v.id ? "page" : undefined}
                title={`${v.label} — ${v.sub} (${keys.views[v.id]})`}
                className={cn(
                  "h-auto flex-col gap-1 px-0 py-1.5",
                  current !== v.id && "border border-transparent",
                )}
              >
                <Thumb nav={v.nav} fallback={v.fallback} className="h-8 w-8" />
                <span className="text-3xs font-semibold text-fg-strong">{v.label}</span>
              </Button>
            ))}
          </div>
        ) : (
          views.map((v) => (
            <Row
              key={v.id}
              active={current === v.id}
              onClick={() => onSelect(v.id)}
              shortcut={keys.views[v.id]}
              icon={
                <Thumb
                  nav={v.nav}
                  fallback={v.fallback}
                  className={dense ? "h-8 w-8" : "h-10 w-10"}
                />
              }
              label={v.label}
              sub={dense ? undefined : v.sub}
              dense={dense}
            />
          ))
        )}
      </Group>

      <Group title="Cities" grow>
        {seats.map((seat, i) => {
          const p = view.players[seat];
          const mine = seat === myIndex;
          const side = neighbourOf(myIndex, seat, n);
          const status = seatStatus(view, seat);
          const active = current === "city" && citySeat === seat;
          // Your own pick waiting while you look elsewhere: the one pulsing
          // "needs you" dot says it — the "choosing" dot would only repeat it.
          const calling = mine && attention.has("city") && !active;
          return (
            <Row
              key={seat}
              active={active}
              calling={calling}
              onClick={() => onSelect("city", seat)}
              shortcut={keys.city(i)}
              dense={dense}
              art={wonderBoardArt(p.wonderId, p.side)}
              artFocus={WONDER_FOCUS[p.wonderId].x}
              bar={oneLine ? <ColourBar tableau={p.tableau} className="h-0.5" /> : undefined}
              icon={
                <WonderMedallion
                  wonderId={p.wonderId}
                  side={p.side}
                  stagesBuilt={p.stagesBuilt}
                  className={oneLine ? "h-9 w-9" : dense ? "h-10 w-10" : "h-12 w-12"}
                />
              }
              label={
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  {side === "left" && <NeighbourArrow side="left" />}
                  <span className="truncate">{names[seat]}</span>
                  {side === "right" && <NeighbourArrow side="right" />}
                  {!calling && <StatusDot status={status} />}
                </span>
              }
              sub={
                oneLine ? (
                  <CityStats p={p} small />
                ) : (
                  <span className={cn("flex flex-col", dense ? "gap-1" : "gap-1.5")}>
                    <CityStats p={p} />
                    <ColourBar tableau={p.tableau} />
                  </span>
                )
              }
            />
          );
        })}
      </Group>
    </nav>
  );
}

/** Points, coins and shields on one dark pill — readable over the painting. */
function CityStats({ p, small = false }: { p: SevenWondersPlayerBoardView; small?: boolean }) {
  const icon = small ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={cn(
        "flex w-fit shrink-0 items-center rounded-full bg-surface-950/80 font-bold tabular-nums text-fg-strong ring-1 ring-black/40",
        small ? "gap-2 py-px pl-1 pr-1.5 text-2xs" : "gap-2.5 py-0.5 pl-1 pr-2 text-xs",
      )}
    >
      <span className="flex items-center gap-0.5" title="Victory points now">
        <SevenIcon name="laurel" className={icon} />
        {p.score.total}
      </span>
      <span className="flex items-center gap-0.5" title="Coins">
        <SevenIcon name="coin" className={icon} />
        {p.coins}
      </span>
      <span className="flex items-center gap-0.5" title="Shields">
        <SevenIcon name="shield" className={icon} />
        {p.shields}
      </span>
    </span>
  );
}

/** The city's cards as one thin bar, a segment per colour. */
export function ColourBar({
  tableau,
  className,
}: {
  tableau: readonly string[];
  className?: string;
}) {
  const total = tableau.length;
  return (
    <span
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-fill", className)}
      title={`${total} card${total === 1 ? "" : "s"} built`}
    >
      {TABLEAU_ORDER.map((c) => {
        const k = colorCount(tableau, c);
        return k > 0 ? (
          <span key={c} style={{ flexGrow: k, backgroundColor: COLOR_HEX[c] }} className="h-full" />
        ) : null;
      })}
      {/* Room for the rest of the game, so short cities read as short. */}
      <span style={{ flexGrow: Math.max(0, 18 - total) }} />
    </span>
  );
}

function NeighbourArrow({ side }: { side: "left" | "right" }) {
  return (
    <span
      className="shrink-0 text-xs text-accent-300"
      title={side === "left" ? "Your left neighbour" : "Your right neighbour"}
    >
      {side === "left" ? "◂" : "▸"}
    </span>
  );
}

export function StatusDot({ status }: { status: SeatStatus }) {
  const reduced = useReducedMotion();
  if (status === "picked") {
    return (
      <span className="shrink-0 text-2xs text-emerald-400" title="Card chosen">
        ✓
      </span>
    );
  }
  if (status === "resolving") {
    return (
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-purple-400 shadow-glow-accent"
        title="Resolving their wonder"
      />
    );
  }
  if (status === "choosing") {
    return (
      <motion.span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
        title="Choosing a card"
        animate={reduced ? undefined : { opacity: [1, 0.35, 1] }}
        transition={reduced ? undefined : { duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
      />
    );
  }
  return null;
}

function AttentionDot() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      role="img"
      aria-label="needs your attention"
      className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-400 shadow-glow-amber"
      animate={reduced ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.55, 1] }}
      transition={reduced ? undefined : { duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
    />
  );
}

function Group({
  title,
  grow = false,
  children,
}: {
  title: string;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col gap-1", grow && "flex-1 overflow-y-auto")}>
      <span className="px-2 text-3xs font-semibold uppercase tracking-label text-fg-muted">
        {title}
      </span>
      {children}
    </section>
  );
}

/**
 * A view's medallion in the rail: one matched set (`nav-*`, art batch 15),
 * all the same size. Until that art exists, the nearest round icon stands in.
 */
function Thumb({
  nav,
  fallback,
  className = "h-10 w-10",
}: {
  nav: string;
  fallback?: string;
  className?: string;
}) {
  const src = artUrl(nav) ?? fallback;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        "shrink-0 select-none object-contain drop-shadow-[0_2px_4px_rgb(0_0_0/0.5)]",
        className,
      )}
    />
  );
}

function Row({
  active,
  calling = false,
  onClick,
  shortcut,
  icon,
  label,
  sub,
  art,
  artFocus = 0.5,
  dense = false,
  bar,
}: {
  /** Big tables: tighter rows, so every seat fits the rail. */
  dense?: boolean;
  /** A hairline along the row's foot (a one-line city's colour bar). */
  bar?: ReactNode;
  /** The city's wonder painting, faded in behind the row. */
  art?: string;
  artFocus?: number;
  active: boolean;
  calling?: boolean;
  onClick: () => void;
  shortcut?: string;
  icon: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Button
      variant={active ? "tinted" : "ghost"}
      tone="accent"
      align="start"
      block
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Rows never shrink: a full rail packs them (dense), never overlaps them.
        "relative isolate h-auto shrink-0 overflow-hidden",
        dense ? "gap-2.5 py-1.5" : "gap-3 py-2.5",
        !active && "border border-transparent",
      )}
    >
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          draggable={false}
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 select-none object-cover transition-opacity",
            active ? "opacity-50" : "opacity-25",
          )}
          style={{
            objectPosition: `${artFocus * 100}% 50%`,
            // The painting only colours the far edge; the words sit on dark.
            maskImage: "linear-gradient(90deg, transparent 10%, black 95%)",
            WebkitMaskImage: "linear-gradient(90deg, transparent 10%, black 95%)",
          }}
        />
      )}
      <span className="relative flex min-w-10 shrink-0 justify-center">{icon}</span>
      <span
        className={cn(
          // Clear of the shortcut digit in the corner.
          "relative flex min-w-0 flex-1 flex-col items-start pr-3 text-left",
          dense ? "gap-0.5" : "gap-1",
        )}
      >
        <span
          className="flex w-full min-w-0 items-center gap-2 text-sm font-semibold text-fg-strong"
          style={{ textShadow: "0 1px 4px rgb(0 0 0 / 0.9)" }}
        >
          {label}
          {calling && !active && (
            <motion.span
              role="img"
              aria-label="needs your attention"
              className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-glow-amber"
              animate={reduced ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.55, 1] }}
              transition={reduced ? undefined : { duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
            />
          )}
        </span>
        {sub !== undefined && (
          <span className="w-full text-2xs font-normal text-fg-muted">{sub}</span>
        )}
      </span>
      {bar && <span className="absolute inset-x-3 bottom-0.5 flex">{bar}</span>}
      {shortcut && (
        <span
          className="absolute right-2 top-1.5 text-3xs tabular-nums text-fg-disabled"
          aria-hidden
          title={`Shortcut: ${shortcut}`}
        >
          {shortcut}
        </span>
      )}
    </Button>
  );
}

function Tab({
  label,
  nav,
  active,
  onClick,
}: {
  label: string;
  nav: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "tinted" : "ghost"}
      tone="accent"
      size="xs"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn("shrink-0", !active && "border border-transparent")}
    >
      <Thumb nav={nav} className="h-6 w-6" />
    </Button>
  );
}
