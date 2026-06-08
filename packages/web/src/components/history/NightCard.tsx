import type { MatchRecord } from "@boardgames/core/history/types";
import type { LockedDate } from "../../lib/calendar-locks";
import { Button } from "../ui/Button";
import { MatchCard } from "./MatchCard";

type Props = {
  /** YYYY-MM-DD when grouped by lock; otherwise null + dayLabel for standalone day. */
  dateKey: string | null;
  /** Pre-formatted day label, used for both lock cards and standalone cards. */
  dayLabel: string;
  lock: LockedDate | null;
  matches: MatchRecord[];
  isAdmin: boolean;
  /** Logged-in user id — passed down so each match row can highlight you. */
  currentUserId: string | null;
  onAddMatch?: () => void;
  onEditMatch?: (m: MatchRecord) => void;
  onDeleteMatch?: (m: MatchRecord) => void;
};

export function NightCard({
  dateKey,
  dayLabel,
  lock,
  matches,
  isAdmin,
  currentUserId,
  onAddMatch,
  onEditMatch,
  onDeleteMatch,
}: Props) {
  const subtitleBits: string[] = [];
  if (lock?.host?.name) subtitleBits.push(lock.host.name);
  if (lock?.eventTime) subtitleBits.push(lock.eventTime);

  return (
    <section className="rounded-xl border border-white/5 bg-surface-900/30 p-2.5">
      <header className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-sm font-semibold text-fg-primary">{dayLabel}</h3>
          {subtitleBits.length > 0 && (
            <span className="truncate text-xs text-fg-muted">{subtitleBits.join(" · ")}</span>
          )}
          {!dateKey && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-3xs uppercase tracking-wider text-fg-muted">
              standalone
            </span>
          )}
        </div>
        {isAdmin && onAddMatch && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onAddMatch}
            className="shrink-0 text-accent-300 hover:bg-accent-500/10"
          >
            + Match
          </Button>
        )}
      </header>
      <div className="flex flex-col gap-1">
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onEdit={onEditMatch}
            onDelete={onDeleteMatch}
          />
        ))}
      </div>
    </section>
  );
}
