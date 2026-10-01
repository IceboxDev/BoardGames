import type { ResistancePlayerView } from "@boardgames/core/games/the-resistance/types";
import { Badge } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

interface SeatGridProps {
  view: ResistancePlayerView;
  names: readonly string[];
  /** The team on the table (or the leader's picks while proposing). */
  team: readonly number[];
  /** The last revealed vote, by seat. */
  lastVotes: readonly boolean[] | null;
  /** Leader picking: tapping a seat toggles it. */
  onToggle?: (seat: number) => void;
}

/** Everyone at the table: leader, team tokens, who has submitted, the last vote. */
export function SeatGrid({ view, names, team, lastVotes, onToggle }: SeatGridProps) {
  const knownSpies = new Set(view.knownSpies);
  const roles = view.record.roles;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {view.seats.map(({ seat, isAi, submitted }) => {
        const onTeam = team.includes(seat);
        const me = seat === view.seat;
        const spy = roles ? roles[seat] === "spy" : knownSpies.has(seat) && !me;
        const vote = lastVotes?.[seat];
        const body = (
          <>
            <span className="flex w-full items-center gap-1.5">
              <span
                className={cn(
                  "min-w-0 truncate text-sm font-semibold",
                  me ? "text-fg-strong" : "text-fg-primary",
                )}
              >
                {names[seat] ?? `P${seat + 1}`}
              </span>
              {isAi && <span className="text-2xs text-fg-muted">AI</span>}
              {seat === view.leader && view.phase !== "game-over" && (
                <Badge size="xs" tone="amber" className="ml-auto">
                  Leader
                </Badge>
              )}
            </span>
            <span className="flex min-h-5 w-full flex-wrap items-center gap-1">
              {me && (
                <Badge size="xs" tone="accent">
                  You
                </Badge>
              )}
              {spy && (
                <Badge size="xs" tone="rose">
                  Spy
                </Badge>
              )}
              {onTeam && (
                <Badge size="xs" tone="sky">
                  Team
                </Badge>
              )}
              {submitted && <span className="text-2xs text-emerald-400">✓ ready</span>}
              {!submitted && vote !== undefined && view.phase === "proposing" && (
                <span className={cn("text-2xs", vote ? "text-fg-secondary" : "text-rose-300")}>
                  {vote ? "approved" : "rejected"}
                </span>
              )}
            </span>
          </>
        );
        const chrome = cn(
          "flex flex-col items-start gap-1.5 rounded-card-md border p-2.5 text-left transition-colors",
          onTeam ? "border-sky-400/60 bg-sky-500/10" : "border-line bg-fill-soft",
          spy && !onTeam && "border-rose-500/40",
        );
        return (
          <li key={seat}>
            {onToggle ? (
              // biome-ignore lint/correctness/noRestrictedElements: a seat tile on the table — a game piece the leader taps to pick the team
              <button
                type="button"
                onClick={() => onToggle(seat)}
                aria-pressed={onTeam}
                className={cn(chrome, "w-full hover:border-line-strong")}
              >
                {body}
              </button>
            ) : (
              <div className={chrome}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
