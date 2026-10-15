import type { SevenWondersPlayerBoardView } from "@boardgames/core/games/7-wonders/machine";
import type { Age } from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import type { ReactNode } from "react";
import { cn } from "../../../../lib/cn";
import { AGE_NUMERAL } from "../../card-utils";
import { artUrl, WONDER_FOCUS, wonderBoardArt } from "../../logic/art";
import { wonderBackdrop, wonderStyle } from "../../logic/wonder-style";
import SevenIcon from "../SevenIcon";
import WonderStages from "./WonderStages";

interface Props {
  player: SevenWondersPlayerBoardView;
  /** The next stage can be built with the card in your hand: it glows and builds on click. */
  buildable?: boolean;
  /** Why the next stage can't be built with the selected card (tooltip). */
  blockedReason?: string;
  onBuild?: () => void;
  /** Edifice: the ages this city holds a participation pawn for. */
  pawns?: readonly Age[];
  /** The Age each built stage was built in, for the card tucked under it. */
  stageAges?: readonly Age[];
  /** Whose city — a line under the wonder's name. */
  owner?: ReactNode;
  /** Headline numbers on the right of the title row. */
  stats?: ReactNode;
  className?: string;
}

/**
 * A wonder board, laid out like the printed one: the wonder painted across
 * the whole board — by day on side A, by night on side B — its name and
 * starting resource top left, and its stages as carved sandstone plaques
 * along the bottom edge — each with its cost in a recessed well, or, once
 * built, gilded and sealed with the Age it was built in.
 */
export default function WonderBoard({
  player,
  buildable = false,
  blockedReason,
  onBuild,
  pawns = [],
  stageAges = [],
  owner,
  stats,
  className,
}: Props) {
  const def = getWonderDef(player.wonderId);
  const side = def.sides[player.side];
  const style = wonderStyle(player.wonderId);
  const painting = wonderBoardArt(player.wonderId, player.side);
  const focus = WONDER_FOCUS[player.wonderId];
  const night = player.side === "B";
  const corner = artUrl("ornament-corner");

  return (
    <section
      aria-label={`${def.name}, side ${player.side}: ${player.stagesBuilt} of ${side.stages.length} stages built`}
      className={cn(
        "relative isolate flex shrink-0 flex-col overflow-hidden rounded-card-xl shadow-xl ring-1 ring-black/60",
        className,
      )}
      style={{ background: wonderBackdrop(player.wonderId) }}
    >
      {painting ? (
        <img
          src={painting}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          style={{
            objectPosition: `${focus.x * 100}% ${focus.y * 100}%`,
            // A touch quieter than the raw painting: the board's words sit on it.
            filter: "brightness(0.82) saturate(0.88)",
          }}
        />
      ) : (
        <svg
          viewBox="0 0 100 64"
          preserveAspectRatio="xMaxYMax meet"
          className="pointer-events-none absolute bottom-0 right-4 h-[85%] w-1/2"
          aria-hidden="true"
        >
          <path d={style.silhouette} fill={style.accent} fillOpacity="0.13" />
        </svg>
      )}
      {/* Light for the name (top left) and the plaques (bottom). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            // A dark band behind the header, deepest behind the name and the numbers.
            "linear-gradient(180deg, rgb(8 6 4 / 0.7) 0%, rgb(8 6 4 / 0.35) 24%, transparent 40%)",
            "radial-gradient(ellipse 55% 75% at 0% 0%, rgb(8 6 4 / 0.7), transparent 70%)",
            "radial-gradient(ellipse 45% 70% at 100% 0%, rgb(8 6 4 / 0.55), transparent 70%)",
            "linear-gradient(0deg, rgb(8 6 4 / 0.82) 0%, rgb(8 6 4 / 0.35) 38%, transparent 62%)",
          ].join(", "),
        }}
      />
      {/* An inner gilt edge, and acanthus corners as on a framed panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-1.5 rounded-card-lg"
        style={{
          boxShadow: "inset 0 0 0 1px rgb(217 165 32 / 0.45), inset 0 0 40px rgb(0 0 0 / 0.35)",
        }}
      />
      {corner &&
        (["tl", "tr", "bl", "br"] as const).map((c) => (
          <img
            key={c}
            src={corner}
            alt=""
            aria-hidden
            draggable={false}
            className={cn(
              "pointer-events-none absolute h-11 w-11 select-none opacity-90 drop-shadow",
              c[0] === "t" ? "top-0.5" : "bottom-0.5",
              c[1] === "l" ? "left-0.5" : "right-0.5",
            )}
            style={{ transform: `scale(${c[1] === "r" ? -1 : 1}, ${c[0] === "b" ? -1 : 1})` }}
          />
        ))}

      <header className="relative flex flex-wrap items-start gap-3 px-5 pt-4 lg:flex-nowrap">
        <span
          className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-950/60 shadow-lg"
          style={{ boxShadow: "0 0 0 2px rgb(217 165 32 / 0.85), 0 4px 10px rgb(0 0 0 / 0.5)" }}
          title={`Produces ${side.initialResource} from the start`}
        >
          <SevenIcon name={side.initialResource} className="h-9 w-9" />
        </span>
        {/* Phones: the name keeps its room, and the numbers wrap below it. */}
        <div className="flex min-w-0 flex-1 basis-48 flex-col lg:basis-auto">
          <span
            // One size on every board, so switching cities never moves the header.
            className="truncate font-fantasy text-xl font-bold leading-tight"
            style={{
              color: "#f8e7bf",
              textShadow: "0 2px 8px rgb(0 0 0 / 0.85), 0 0 22px rgb(0 0 0 / 0.6)",
            }}
          >
            {def.name}
          </span>
          <span className="flex h-5 min-w-0 items-center gap-2 text-2xs text-fg-strong/85">
            <span
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-4xs font-bold uppercase tracking-label"
              style={{
                background: night ? "rgb(30 40 90 / 0.75)" : "rgb(120 80 20 / 0.7)",
                color: night ? "#cfdcff" : "#ffe6a8",
                boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.15)",
              }}
              title={night ? "Side B — the night side" : "Side A — the day side"}
            >
              <span aria-hidden>{night ? "☾" : "☀"}</span>
              {night ? "Night" : "Day"} · {player.side}
            </span>
            {owner}
          </span>
        </div>
        {pawns.length > 0 && (
          <span
            className="flex shrink-0 items-center gap-1 self-center rounded-full bg-surface-950/55 px-2 py-0.5"
            title="Edifice participation pawns"
          >
            {pawns.map((age) => (
              <span key={age} className="flex items-center text-3xs font-bold text-fg-strong/85">
                <SevenIcon name="pawn" className="h-6 w-6" />
                {AGE_NUMERAL[age as 1 | 2 | 3]}
              </span>
            ))}
          </span>
        )}
        {stats}
      </header>

      <WonderStages
        player={player}
        stages={side.stages}
        stageAges={stageAges}
        buildable={buildable}
        blockedReason={blockedReason}
        onBuild={onBuild}
      />
    </section>
  );
}
