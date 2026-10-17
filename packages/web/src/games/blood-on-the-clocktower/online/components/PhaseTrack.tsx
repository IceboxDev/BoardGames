import type { BotcView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { ProgressBar } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type DayPartId, dayPartOf, formatCountdown, TRACK, trackStepOf } from "../day-parts";
import { useServerNow } from "../server-clock";

const STEP_ICON = { night: "🌙", discussion: "☀️", nominations: "☝️", dusk: "🌆" } as const;

/** The right-hand status: what's going on now, and how long it lasts. */
function Status({ view, part, now }: { view: BotcView; part: DayPartId; now: number }) {
  const vote = view.day.vote;
  const name = (seat: number) => view.names[seat] ?? `Player ${seat}`;

  if (part === "voting" && vote) {
    const at = vote.order[vote.locked];
    return (
      <StatusRow
        label={vote.status === "paused" ? "The clock is paused" : `Clock at ${name(at ?? 0)}`}
        value={`${vote.locked} / ${vote.order.length}`}
        progress={vote.locked / Math.max(1, vote.order.length)}
        tone="amber"
      />
    );
  }
  if (part === "counting") return <StatusRow label="The Storyteller counts the hands" />;

  const timer = view.day.timer;
  if (view.phase.kind === "day" && timer) {
    const left = timer.endsAt - now;
    const total = Math.max(1, timer.endsAt - timer.startedAt);
    const ready = view.day.ready?.length ?? 0;
    return (
      <StatusRow
        label={left > 0 ? timer.label : `${timer.label} — time's up`}
        value={left > 0 ? formatCountdown(left) : null}
        progress={Math.max(0, left) / total}
        tone={left <= 10_000 ? "rose" : "sky"}
        note={ready > 0 ? `${ready} ready` : undefined}
      />
    );
  }
  switch (part) {
    case "setup":
      return <StatusRow label="The Storyteller is preparing the town" />;
    case "reveal":
      return <StatusRow label="Everyone looks at their character" />;
    case "night":
      return <StatusRow label="The town sleeps" />;
    case "over":
      return <StatusRow label="The game is over" />;
    default:
      return <StatusRow label="Waiting for the Storyteller" />;
  }
}

function StatusRow({
  label,
  value,
  progress,
  tone = "sky",
  note,
}: {
  label: string;
  value?: string | null;
  progress?: number;
  tone?: "sky" | "amber" | "rose";
  note?: string | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 sm:max-w-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-fg-primary">{label}</span>
        <span className="shrink-0 text-xs text-fg-muted">{note}</span>
        {value && (
          <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-fg-strong">
            {value}
          </span>
        )}
      </div>
      {progress !== undefined && (
        <ProgressBar value={progress} tone={tone} size="sm" animate={false} label={label} />
      )}
    </div>
  );
}

/**
 * The day's steps, pinned above the square — Night, Discussion, Nominations,
 * Dusk — with the current one lit and its countdown beside it. One fixed
 * height whatever the step, so the board never moves.
 */
export function PhaseTrack({ view }: { view: BotcView }) {
  const now = useServerNow();
  const part = dayPartOf(view);
  const current = trackStepOf(part);
  const currentAt = TRACK.findIndex((t) => t.step === current);
  const night = part === "night";
  return (
    <div
      data-testid="phase-track"
      data-part={part}
      className={cn(
        "flex h-16 shrink-0 items-center gap-3 rounded-card-xl border px-3 transition-colors duration-700",
        night ? "border-purple-400/30 bg-purple-950/50" : "border-line-soft bg-surface-900/60",
      )}
    >
      <ol className="flex shrink-0 items-center gap-1" aria-label="Parts of the day">
        {TRACK.map((t, i) => {
          const on = t.step === current;
          return (
            <li key={t.step} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="h-px w-2 bg-line sm:w-4" />}
              <span
                aria-current={on ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                  on
                    ? t.step === "night"
                      ? "bg-purple-400/20 text-fg-strong ring-1 ring-purple-300/60"
                      : "bg-amber-400/15 text-fg-strong ring-1 ring-amber-300/60"
                    : currentAt !== -1 && i < currentAt
                      ? "text-fg-secondary"
                      : "text-fg-muted",
                )}
              >
                <span aria-hidden>{STEP_ICON[t.step]}</span>
                <span className={cn(!on && "hidden md:inline")}>{t.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <span className="flex-1" />
      <Status view={view} part={part} now={now} />
    </div>
  );
}
