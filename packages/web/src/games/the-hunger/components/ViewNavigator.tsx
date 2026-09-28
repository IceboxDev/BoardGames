import type { HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Button, Eyebrow } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import type { ArtName } from "../logic/art";
import type { ViewId } from "../logic/attention";
import { seatShortLabel, spaceLabel } from "../logic/labels";
import { speedReadout } from "../logic/speed";
import HungerIcon from "./HungerIcon";
import SpeedGauge from "./SpeedGauge";
import VampireAvatar from "./VampireAvatar";

interface Props {
  view: HungerPlayerView;
  names: readonly (string | null)[];
  current: ViewId;
  /** Whose board the Player view shows. */
  boardSeat: number;
  /** The seat whose turn it is (or who is deciding). */
  activeSeat: number;
  attention: ReadonlySet<ViewId>;
  onSelect: (view: ViewId, seat?: number) => void;
  /** Phone: a row of tabs instead of the left-panel list. */
  compact?: boolean;
}

/**
 * The left panel, spread over its full height: the Map, a board for every
 * Vampire at the table (yours first), the Hunt and the Overview. A pulse
 * marks each place holding something you need to do.
 */
export default function ViewNavigator({
  view,
  names,
  current,
  boardSeat,
  activeSeat,
  attention,
  onSelect,
  compact = false,
}: Props) {
  const speed = speedReadout(view);
  // Your own board first, then the table in seat order.
  const seats = view.players
    .map((p) => p.index)
    .sort((a, b) => (a === view.me ? -1 : b === view.me ? 1 : a - b));

  if (compact) {
    return (
      <nav aria-label="Game views" className="flex w-full items-center gap-1">
        {speed && <SpeedGauge readout={speed} compact />}
        <Tab
          label="Map"
          icon="icon-road"
          active={current === "map"}
          onClick={() => onSelect("map")}
        />
        {seats.map((seat) => (
          <Button
            key={seat}
            variant={current === "player" && boardSeat === seat ? "tinted" : "ghost"}
            tone="accent"
            size="xs"
            onClick={() => onSelect("player", seat)}
            aria-label={`${seatShortLabel(view, seat, names)}'s board`}
            aria-current={current === "player" && boardSeat === seat ? "page" : undefined}
            className={cn(
              "shrink-0 px-1",
              !(current === "player" && boardSeat === seat) && "border border-transparent",
            )}
          >
            <VampireAvatar vampire={view.players[seat].vampire} className="h-6 w-6" />
          </Button>
        ))}
        <Tab
          label="Hunt"
          icon="icon-hunt"
          active={current === "shop"}
          onClick={() => onSelect("shop")}
        />
        <Tab
          label="Overview"
          icon="icon-majority"
          active={current === "overview"}
          onClick={() => onSelect("overview")}
        />
      </nav>
    );
  }

  return (
    <nav aria-label="Game views" className="flex h-full min-h-0 flex-col gap-6">
      {speed ? <SpeedGauge readout={speed} /> : <Eyebrow size="sm">The Hunger</Eyebrow>}

      <Group title="The night">
        <Row
          active={current === "map"}
          calling={attention.has("map")}
          onClick={() => onSelect("map")}
          shortcut="1"
          icon={<HungerIcon name="icon-road" className="h-5 w-5" />}
          label="Map"
          sub="Everyone on the board"
        />
        <Row
          active={current === "shop"}
          calling={attention.has("shop")}
          onClick={() => onSelect("shop")}
          shortcut="2"
          icon={<HungerIcon name="icon-hunt" className="h-5 w-5" />}
          label="Hunt"
          sub="The Hunt Track"
        />
        <Row
          active={current === "overview"}
          calling={attention.has("overview")}
          onClick={() => onSelect("overview")}
          shortcut="3"
          icon={<HungerIcon name="icon-majority" className="h-5 w-5" />}
          label="Overview"
          sub="Everyone side by side"
        />
      </Group>

      <Group title="Boards" grow>
        {seats.map((seat, i) => {
          const p = view.players[seat];
          const mine = seat === view.me;
          return (
            <Row
              key={seat}
              active={current === "player" && boardSeat === seat}
              calling={mine && attention.has("player")}
              onClick={() => onSelect("player", seat)}
              shortcut={i < 6 ? String(4 + i) : undefined}
              icon={
                <VampireAvatar
                  vampire={p.vampire}
                  className="h-14 w-14"
                  dim={p.castleTile !== null && seat !== activeSeat}
                />
              }
              label={
                <span className="flex items-center gap-1.5 text-base">
                  {seatShortLabel(view, seat, names)}
                  {seat === activeSeat && (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" title="Their turn" />
                  )}
                </span>
              }
              sub={
                <span className="flex flex-col gap-0.5 tabular-nums">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-fg-secondary">{p.vp} VP</span>
                    <span className="truncate">
                      {p.castleTile !== null
                        ? "Home in the Castle"
                        : spaceLabel(view.options, p.pos)}
                    </span>
                  </span>
                  <span>
                    {p.handCount} in hand · {p.missionCount} Mission
                    {p.missionCount === 1 ? "" : "s"}
                  </span>
                </span>
              }
            />
          );
        })}
      </Group>
    </nav>
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
    <section className={cn("flex min-h-0 flex-col gap-1.5", grow && "flex-1 overflow-y-auto")}>
      <span className="px-2 text-3xs font-semibold uppercase tracking-label text-fg-muted">
        {title}
      </span>
      {children}
    </section>
  );
}

function Row({
  active,
  calling,
  onClick,
  shortcut,
  icon,
  label,
  sub,
}: {
  active: boolean;
  calling: boolean;
  onClick: () => void;
  shortcut?: string;
  icon: ReactNode;
  label: ReactNode;
  sub: ReactNode;
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
      className={cn("relative h-auto gap-3 py-3", !active && "border border-transparent")}
    >
      <span className="flex min-w-10 shrink-0 justify-center">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg-strong">
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
        <span className="w-full truncate text-2xs font-normal text-fg-muted">{sub}</span>
      </span>
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
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ArtName;
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
      className={cn("flex-1", !active && "border border-transparent")}
    >
      <HungerIcon name={icon} className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Button>
  );
}
