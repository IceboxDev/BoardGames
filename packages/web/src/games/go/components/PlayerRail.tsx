import type { Color } from "@boardgames/core/games/go/types";
import type { GoPlayerView } from "@boardgames/core/games/go/view";
import { Badge, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import GoClock from "./GoClock";

function Stone({ color }: { color: Color }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 rounded-full ring-1",
        color === 0 ? "bg-black ring-fg-strong/40" : "bg-white ring-black/40",
      )}
    />
  );
}

interface Props {
  readonly view: GoPlayerView;
  readonly names: readonly string[];
  /** One line under the cards: whose move / the scoring state. */
  readonly compact?: boolean;
}

/**
 * Both players: colour, name, prisoners and clock, with the side to move
 * lit. The scoring breakdown appears here during the scoring phase.
 */
export default function PlayerRail({ view, names, compact }: Props) {
  const toMove = view.result || view.scoring ? null : view.toMove;
  const score = view.scoring?.breakdown ?? view.result?.breakdown ?? null;
  return (
    <div className={cn("flex gap-2", compact ? "flex-row" : "flex-col")}>
      {([0, 1] as const).map((c) => (
        <Surface
          key={c}
          variant="raised"
          padding="sm"
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1 ring-1",
            toMove === c ? "ring-accent-400/70" : "ring-transparent",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Stone color={c} />
            <span className="min-w-0 truncate text-sm font-semibold text-fg-primary">
              {names[c] ?? (c === 0 ? "Black" : "White")}
              {view.you === c && <span className="text-fg-muted"> (you)</span>}
            </span>
            {view.scoring?.accepted[c] && (
              <Badge tone="emerald" size="xs">
                Accepted
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-fg-secondary">
            <span>
              Prisoners {view.captures[c]}
              {c === 1 && !compact && ` · komi ${view.komi}`}
            </span>
            {view.clock && <GoClock clock={view.clock} color={c} />}
          </div>
          {score && !compact && (
            <div className="text-xs text-fg-secondary">
              Area{" "}
              {(c === 0 ? score.black : score.white).stones +
                (c === 0 ? score.black : score.white).territory}
              {c === 1 && score.white.bonus > 0 && ` + ${score.white.bonus}`}
              {" = "}
              <span className="font-semibold text-fg-strong">
                {(c === 0 ? score.black : score.white).total}
              </span>
            </div>
          )}
        </Surface>
      ))}
      {!compact && (
        <div className="flex flex-wrap gap-1.5 text-xs text-fg-muted">
          <span>
            {view.size}×{view.size}
          </span>
          {view.handicap > 0 && <span>· {view.handicap} stones</span>}
          <span>· Chinese rules</span>
          {view.aiDegraded && (
            <Badge
              tone="amber"
              size="xs"
              title="The engine was unavailable for a move; a lighter bot stood in."
            >
              Engine fallback
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
