import { isApproved } from "@boardgames/core/games/the-resistance/rules";
import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import type { SolverEvent } from "@boardgames/core/games/the-resistance/solver/posterior";
import { Button, Eyebrow } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

interface TimelineProps {
  events: readonly SolverEvent[];
  playerCount: number;
  name: SeatNamer;
  /** Events applied so far. */
  at: number;
  onSeek: (count: number) => void;
}

function describe(event: SolverEvent, playerCount: number, name: SeatNamer): string {
  const team = event.proposal.team.map(name).join(", ");
  switch (event.kind) {
    case "proposal":
      return `${name(event.proposal.leader)} proposes ${team}`;
    case "vote": {
      const yes = event.votes.filter(Boolean).length;
      return `${isApproved(event.votes, playerCount) ? "Approved" : "Rejected"} ${yes}–${playerCount - yes}`;
    }
    case "mission":
      return event.success
        ? `Success${event.fails > 0 ? ` (${event.fails} fail)` : ""}`
        : `Failed — ${event.fails} fail${event.fails === 1 ? "" : "s"}`;
  }
}

/** The game as a list of events; clicking one scrubs the whole dashboard there. */
export function Timeline({ events, playerCount, name, at, onSeek }: TimelineProps) {
  const rounds = new Map<number, SolverEvent[]>();
  for (const e of events) rounds.set(e.round, [...(rounds.get(e.round) ?? []), e]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="xs" variant="secondary" onClick={() => onSeek(0)} disabled={at === 0}>
          Start
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => onSeek(Math.max(0, at - 1))}
          disabled={at === 0}
        >
          ‹
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => onSeek(Math.min(events.length, at + 1))}
          disabled={at >= events.length}
        >
          ›
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => onSeek(events.length)}
          disabled={at >= events.length}
        >
          Now
        </Button>
      </div>
      {events.length === 0 && <p className="text-xs text-fg-muted">No events yet.</p>}
      <ol className="flex flex-col gap-3">
        {[...rounds.entries()].map(([round, list]) => (
          <li key={round} className="flex flex-col gap-1">
            <Eyebrow size="sm">
              Round {round + 1} · Mission {(list[0]?.proposal.mission ?? 0) + 1}
            </Eyebrow>
            <ol className="flex flex-col">
              {list.map((e) => {
                const applied = e.index < at;
                const isCurrent = e.index === at - 1;
                return (
                  <li key={e.index}>
                    {/* biome-ignore lint/correctness/noRestrictedElements: a dense timeline row (dot + label), a scrubber stop rather than an action */}
                    <button
                      type="button"
                      onClick={() => onSeek(e.index + 1)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-ui-md px-2 py-1 text-left text-xs transition-colors hover:bg-fill",
                        isCurrent && "bg-fill-strong",
                        applied ? "text-fg-secondary" : "text-fg-disabled",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          e.kind === "mission"
                            ? e.success
                              ? "bg-sky-400"
                              : "bg-rose-500"
                            : e.kind === "vote"
                              ? "bg-fg-muted"
                              : "bg-fg-disabled",
                        )}
                      />
                      <span className="min-w-0 truncate">{describe(e, playerCount, name)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
