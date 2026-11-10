import type { ExpeditionScore, PlayerScore } from "@boardgames/core/games/lost-cities/types";
import {
  COLOR_HEX,
  COLOR_LABELS,
  EXPEDITION_COLORS,
} from "@boardgames/core/games/lost-cities/types";
import { type GameOverAction, GameOverLayout } from "../../../components/game-over";
import { cn } from "../../../lib/cn";
import { trailArt } from "../logic/art";
import { ExpeditionGlyph } from "./Card";

interface GameOverScreenProps {
  /** Both seats' scores, by seat. */
  scores: readonly [PlayerScore, PlayerScore];
  /** This player's seat — the table reads from their side. */
  myIndex: number;
  /** The other seat's name (a room name, or the AI's label). */
  opponentName: string;
  actions: readonly GameOverAction[];
}

/** "(27 − 20) × 2 + 20": how a line scored, or "not started". */
function formula(e: ExpeditionScore): string {
  if (!e.started) return "not started";
  const base = `(${e.cardValues} − 20)`;
  const mult = e.wagerMultiplier > 1 ? ` × ${e.wagerMultiplier}` : "";
  const bonus = e.lengthBonus ? " + 20" : "";
  return `${base}${mult}${bonus}`;
}

function Line({ who, e, strong }: { who: string; e: ExpeditionScore; strong: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-2xs text-fg-secondary">{who}</span>
        <b
          className={cn(
            "font-card tabular-nums",
            strong ? "text-xl" : "text-base",
            !e.started ? "text-fg-muted" : e.total < 0 ? "text-rose-400" : "text-emerald-400",
          )}
        >
          {e.started ? e.total : "–"}
        </b>
      </div>
      <span className="text-3xs tabular-nums text-fg-muted">
        {formula(e)}
        {e.started && ` · ${e.cardCount} card${e.cardCount === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

export default function GameOverScreen({
  scores,
  myIndex,
  opponentName,
  actions,
}: GameOverScreenProps) {
  const mine = scores[myIndex === 1 ? 1 : 0];
  const theirs = scores[myIndex === 1 ? 0 : 1];
  const diff = mine.total - theirs.total;
  const won = diff > 0;
  const tied = diff === 0;

  return (
    <GameOverLayout
      headline={won ? "You win" : tied ? "A tie" : `${opponentName} wins`}
      headlineColor={won ? "win" : tied ? "draw" : "lose"}
      subtitle={`${mine.total} – ${theirs.total}`}
      actions={actions}
      wide
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {EXPEDITION_COLORS.map((color) => {
          const me = mine.expeditions.find((e) => e.color === color);
          const them = theirs.expeditions.find((e) => e.color === color);
          if (!me || !them) return null;
          const art = trailArt(color);
          const hex = COLOR_HEX[color];
          return (
            <section
              key={color}
              className="flex min-w-0 flex-col overflow-hidden rounded-card-lg border border-line-soft bg-surface-900/80"
            >
              <div
                className="relative h-28 bg-cover bg-center"
                style={{
                  backgroundImage: art ? `url("${art}")` : undefined,
                  backgroundColor: art ? undefined : `color-mix(in srgb, ${hex} 25%, black)`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-900" />
                <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1.5 font-fantasy text-xs font-semibold uppercase tracking-label text-fg-strong">
                  <ExpeditionGlyph color={color} className="h-3.5 w-3.5" />
                  {COLOR_LABELS[color]}
                </div>
              </div>
              <div className="flex flex-col gap-2.5 p-3">
                <Line who="You" e={me} strong />
                <Line who={opponentName} e={them} strong={false} />
              </div>
            </section>
          );
        })}
      </div>
    </GameOverLayout>
  );
}
