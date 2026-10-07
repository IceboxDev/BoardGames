import type { GroupDayMatch } from "@boardgames/core/availability/group-match";
import type { ProfileDirectoryEntry } from "@boardgames/core/protocol";
import { cn } from "../../lib/cn";
import { formatDayKey } from "../../lib/date-format.ts";
import { Button } from "../ui/Button";
import { MicroLabel } from "../ui/Label";
import { MemberPicker } from "../ui/MemberPicker";
import { SelectableCard } from "../ui/SelectableCard";
import { fitLine } from "./group-fit";

// Lock mode's "Find a date": pick the people, see the nights that suit them.
// The picker and the ranked nights; the dashboard frames it (a rail beside
// the calendar on wide screens, a bottom sheet on phones).

/** How many ranked nights to offer — past that the calendar says the rest. */
const MAX_NIGHTS = 8;

type Props = {
  members: readonly ProfileDirectoryEntry[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  /** The group's best nights, best first (`rankGroupDates`). */
  ranked: readonly GroupDayMatch[];
  names: ReadonlyMap<string, string>;
  /** Lock the night (its free slot's key) for the group. */
  onPickNight: (nightKey: string) => void;
  className?: string;
};

export function GroupDatePanel({
  members,
  selectedIds,
  onToggle,
  onClear,
  ranked,
  names,
  onPickNight,
  className,
}: Props) {
  const rows = members.map((m) => ({
    id: m.id,
    name: m.name,
    image: m.image,
    accentHex: m.accentHex,
  }));
  const nights = ranked.slice(0, MAX_NIGHTS);
  const anyAll = ranked.some((m) => m.tier === "all");

  return (
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <MemberPicker
        members={rows}
        selectedIds={selectedIds}
        onToggle={onToggle}
        searchLabel="Search people to find a date for"
        selectedNoun="picked"
        // Never squeezed by the nights below: on a short phone the sheet
        // scrolls instead of shrinking the list to a row.
        className="shrink-0"
      />

      <section className="flex shrink-0 flex-col gap-1.5" aria-label="Best nights">
        <div className="flex items-center justify-between gap-2">
          <MicroLabel>Best nights</MicroLabel>
          {selectedIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
        {selectedIds.size === 0 ? (
          <p className="text-xs text-fg-muted">Pick people to see when they're free.</p>
        ) : nights.length === 0 ? (
          <p className="text-xs text-fg-muted">
            None of them has marked a night in the next six weeks.
          </p>
        ) : (
          <>
            {!anyAll && (
              <p className="text-xs text-fg-muted">
                No night suits everyone yet — these come closest.
              </p>
            )}
            <ul className="space-y-0.5">
              {nights.map((m) => (
                <li key={m.date}>
                  <SelectableCard
                    variant="row"
                    padding="sm"
                    onClick={() => m.nightKey && onPickNight(m.nightKey)}
                    aria-label={`Lock ${formatDayKey(m.date, "weekday")} — ${fitLine(m, names)}`}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        m.tier === "all"
                          ? "bg-ok"
                          : m.tier === "most"
                            ? "bg-warn-gold"
                            : "bg-fg-disabled",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg-primary">
                        {formatDayKey(m.date, "short")}
                        {m.nightKey !== m.date && (
                          <span className="text-fg-muted"> · 2nd night</span>
                        )}
                      </span>
                      <span className="block truncate text-3xs text-fg-muted">
                        {fitLine(m, names)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-fg-secondary">
                      {m.can.length + m.maybe.length}/
                      {m.can.length + m.maybe.length + m.missing.length}
                    </span>
                  </SelectableCard>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
