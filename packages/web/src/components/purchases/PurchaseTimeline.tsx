import type { Purchase, PurchaseEventType } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatDayKey } from "../../lib/date-format";
import { ArrowRightIcon, ClockIcon, EditIcon, MegaphoneIcon, TruckIcon } from "../icons";
import { ButtonLink } from "../ui/Button.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { MicroLabel } from "../ui/Label.tsx";
import { Surface } from "../ui/Surface.tsx";
import { TONE_BUBBLE } from "../ui/tones";
import { EVENT_META, formatEtaMonth } from "./purchase-rows";

// Month-grouped timeline of a purchase's digested campaign posts, in
// MatchTimeline's image (compact Surface rows, newest first). Events arrive
// ascending from the data module; this renders them latest-first.

const EVENT_ICON: Record<PurchaseEventType, ReactNode> = {
  "status-change": <ArrowRightIcon className="h-3.5 w-3.5" />,
  "campaign-update": <MegaphoneIcon className="h-3.5 w-3.5" />,
  "shipping-notice": <TruckIcon className="h-3.5 w-3.5" />,
  delay: <ClockIcon className="h-3.5 w-3.5" />,
  note: <EditIcon className="h-3.5 w-3.5" />,
};

export function PurchaseTimeline({ events }: { events: Purchase["events"] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon className="h-4 w-4" />}
        title="No updates yet"
        description="Campaign updates will build this timeline as they land."
      />
    );
  }

  // Group consecutive events (rendered newest-first) by "YYYY-MM".
  const newestFirst = [...events].reverse();
  const groups: { key: string; items: typeof newestFirst }[] = [];
  for (const event of newestFirst) {
    const key = event.occurredOn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(event);
    else groups.push({ key, items: [event] });
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section key={group.key}>
          <MicroLabel className="mb-1 block font-semibold">{formatEtaMonth(group.key)}</MicroLabel>
          <ul className="space-y-1">
            {group.items.map((event) => {
              const meta = EVENT_META[event.type];
              return (
                <Surface
                  as="li"
                  key={event.id}
                  variant="tile"
                  padding="none"
                  className="flex items-start gap-2.5 px-3 py-2"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      TONE_BUBBLE[meta.tone],
                    )}
                  >
                    {EVENT_ICON[event.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-fg-primary">
                      {event.title}
                    </p>
                    <p className="text-3xs text-fg-muted">
                      {formatDayKey(event.occurredOn, "compact")}
                      {" · "}
                      {meta.label}
                    </p>
                    {event.details && (
                      <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-fg-secondary">
                        {event.details}
                      </p>
                    )}
                  </div>
                  {event.sourceUrl && (
                    <ButtonLink
                      href={event.sourceUrl}
                      external
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                    >
                      Source ↗
                    </ButtonLink>
                  )}
                </Surface>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
