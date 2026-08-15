import type { ProfileNightItem } from "@boardgames/core/protocol";
import { cn } from "../../../lib/cn.ts";
import { compactAddress } from "../../../lib/compact-address.ts";
import { formatDayKey } from "../../../lib/date-format.ts";
import { CheckIcon } from "../../icons";
import { Badge } from "../../ui/Badge.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";

// Month-grouped log of every past night: date, host + address, RSVP chip,
// attended check, and the games tally. Attended rows carry a faint emerald
// left border so the eye can skim the streaks.

function monthLabel(dateKey: string): string {
  const [y, m] = dateKey.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function rsvpChip(night: ProfileNightItem): {
  label: string;
  tone: "emerald" | "rose" | "neutral";
} {
  if (night.rsvp === "yes") {
    return { label: night.rsvpAuto ? "Yes · auto" : "Yes", tone: "emerald" };
  }
  if (night.rsvp === "no") return { label: "No", tone: "rose" };
  return { label: "—", tone: "neutral" };
}

export function NightLog({
  items,
  userId,
}: {
  items: readonly ProfileNightItem[];
  userId: string;
}) {
  const groups: { key: string; label: string; items: ProfileNightItem[] }[] = [];
  for (const night of items) {
    const key = night.dateKey.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(night);
    else groups.push({ key, label: monthLabel(night.dateKey), items: [night] });
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          <MicroLabel className="mb-1.5 block font-semibold">{group.label}</MicroLabel>
          <ul className="space-y-1">
            {group.items.map((night) => {
              const chip = rsvpChip(night);
              return (
                <Surface
                  as="li"
                  key={night.dateKey}
                  variant="tile"
                  padding="none"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    night.attended && "border-l-2 border-l-emerald-400/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      night.attended
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-white/[0.04] text-fg-disabled",
                    )}
                    title={
                      night.attended
                        ? night.attendedVia === "played"
                          ? "Attended — played a recorded game"
                          : "Attended — RSVP'd yes, no games recorded that night"
                        : "Not attended"
                    }
                  >
                    {night.attended ? <CheckIcon className="h-3.5 w-3.5" /> : <span>–</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-fg-primary">
                      {formatDayKey(night.dateKey)}
                      {night.host?.userId === userId && (
                        <Badge tone="amber" size="xs">
                          Hosted
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-3xs text-fg-muted">
                      {night.host ? `at ${night.host.name}'s` : "no host recorded"}
                      {night.address && ` · ${compactAddress(night.address)}`}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-3xs tabular-nums text-fg-muted sm:block">
                    {night.totalMatches} game{night.totalMatches === 1 ? "" : "s"} · played{" "}
                    {night.matchesPlayedByUser}
                  </span>
                  <Badge tone={chip.tone} size="xs">
                    {chip.label}
                  </Badge>
                </Surface>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
