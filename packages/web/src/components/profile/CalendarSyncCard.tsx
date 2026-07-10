// Profile-page row that opens the Calendar Sync modal. Mirrors
// GalleryPreview's visual language (full-width rounded card, accent icon on
// the left, status pill on the right, chevron at the end).

import { useQuery } from "@tanstack/react-query";
import { fetchCalendarFeedStatus } from "../../lib/calendar-feed.ts";
import { qk } from "../../lib/query-keys.ts";
import { ArrowRightIcon } from "../icons";
import { InteractiveCard } from "../ui/InteractiveCard.tsx";
import { QueryBoundary } from "../ui/QueryBoundary.tsx";

type Props = {
  onClick: () => void;
};

export default function CalendarSyncCard({ onClick }: Props) {
  const statusQuery = useQuery({
    queryKey: qk.calendarFeed(),
    queryFn: ({ signal }) => fetchCalendarFeedStatus(signal),
  });

  return (
    <InteractiveCard
      onClick={onClick}
      padding="lg"
      className="mt-6 flex w-full items-center gap-4 text-left"
    >
      <div className="flex shrink-0 items-center gap-2 text-fg-secondary transition-colors group-hover:text-white">
        <CalendarSyncIcon />
        <span className="text-xs font-semibold uppercase tracking-eyebrow">Calendar Sync</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <QueryBoundary
          query={statusQuery}
          loading={<span className="text-xs text-fg-muted">…</span>}
          errorFallback={() => <SyncStatus connected={false} />}
        >
          {(data) => <SyncStatus connected={data.connected} />}
        </QueryBoundary>
      </div>

      <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-300" />
    </InteractiveCard>
  );
}

function SyncStatus({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <span className="truncate text-xs text-fg-muted">
        Subscribe to your game nights in Apple / Google / Outlook
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs text-emerald-300">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-glow-emerald"
      />
      <span className="truncate">
        Connected
        <span className="hidden sm:inline"> — game nights sync to your calendar</span>
      </span>
    </span>
  );
}

function CalendarSyncIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="14" height="13" rx="2" />
      <path d="M3 8h14" />
      <path d="M7 2.5v3" />
      <path d="M13 2.5v3" />
    </svg>
  );
}
