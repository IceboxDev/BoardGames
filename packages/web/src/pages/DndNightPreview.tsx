import type { LockedDate } from "@boardgames/core/protocol";
import Calendar from "../components/offline/Calendar";
import { D20Die } from "../components/offline/D20Die";
import DndNightPanel from "../components/offline/DndNightPanel";
import { PageMain, PageShell } from "../components/ui/PageShell";
import type { Attendee } from "../lib/calendar-games";
import { DND_SLUG } from "../lib/dnd-night";
import type { AvailabilityCounts, AvailabilityMap } from "../lib/offline-availability";
import { dateKey } from "../lib/offline-availability";
import { build42Days } from "../lib/offline-week";

// Dev-only visual harness for the D&D-night calendar treatment. Reached at
// /dev/dnd-preview (unguarded, like /dev/deck-preview). Renders the real
// Calendar with mock locks so the day-card states can be eyeballed at every
// breakpoint, plus the standalone modal panel and a row of bare dice.

function mkLock(over: Partial<LockedDate>): LockedDate {
  return {
    lockedBy: "u-host",
    lockedAt: "2026-06-20 12:00:00",
    expectedUserIds: [],
    rsvps: {},
    host: { userId: "u-host", name: "Mara" },
    eventTime: null,
    address: null,
    picksLockedAt: "2026-06-20 12:30:00",
    hostAtHome: true,
    attendance: { definite: 5, tentative: 2 },
    topGameSlug: null,
    ...over,
  };
}

// Borin is the admin and is coming → he's the DM; Mara hosts the venue → "Host".
const ATTENDEES: Attendee[] = [
  {
    userId: "u-host",
    name: "Mara the Wise",
    isHost: true,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    votes: { hype: 1, teach: 1, learn: 0 },
    bringing: [],
  },
  {
    userId: "u2",
    name: "Borin Stonefist",
    isHost: false,
    isAdmin: true,
    status: "definite",
    hasRsvped: true,
    votes: { hype: 1, teach: 0, learn: 1 },
    bringing: [],
  },
  {
    userId: "u3",
    name: "Lyra Quickfoot",
    isHost: false,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    votes: { hype: 1, teach: 0, learn: 0 },
    bringing: [],
  },
  {
    userId: "u4",
    name: "Finn",
    isHost: false,
    isAdmin: false,
    status: "definite",
    hasRsvped: false,
    votes: { hype: 0, teach: 0, learn: 0 },
    bringing: [],
  },
  {
    userId: "u5",
    name: "Senna",
    isHost: false,
    isAdmin: false,
    status: "tentative",
    hasRsvped: false,
    votes: { hype: 0, teach: 0, learn: 0 },
    bringing: [],
  },
];

export default function DndNightPreview() {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 7);
  const keys = build42Days(weekStart).map(dateKey);

  // Place a few notable cells: a D&D night, a bigger D&D night, a plain
  // picks-locked night (for the N/N comparison), and a heat day.
  const dnd = keys[10] ?? "";
  const dndBig = keys[17] ?? "";
  const plainLocked = keys[12] ?? "";
  const hot = keys[23] ?? "";

  const locks = {
    [dnd]: mkLock({ topGameSlug: DND_SLUG, attendance: { definite: 5, tentative: 2 } }),
    [dndBig]: mkLock({ topGameSlug: DND_SLUG, attendance: { definite: 6, tentative: 0 } }),
    [plainLocked]: mkLock({
      topGameSlug: "lost-cities",
      attendance: { definite: 4, tentative: 3 },
    }),
  };

  const availability: AvailabilityMap = { [keys[3] ?? ""]: "can", [keys[4] ?? ""]: "maybe" };
  const counts: AvailabilityCounts = {
    [hot]: { can: 5, maybe: 2 },
    [keys[22] ?? ""]: { can: 3, maybe: 1 },
  };
  const viewerRsvpByDate = { [dnd]: "yes" as const, [dndBig]: undefined };

  return (
    <PageShell background="plain">
      <PageMain width="6xl" padding="spacious" className="flex flex-col gap-10 text-fg-primary">
        <header>
          <h1 className="text-2xl font-bold text-white">D&amp;D Night — visual preview</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Mock calendar with two D&amp;D nights, a plain picks-locked night, and heat days.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Calendar grid (full)
          </h2>
          <div className="h-[680px] rounded-2xl border border-white/10 bg-surface-900/40 p-4">
            <Calendar
              weekStart={weekStart}
              availability={availability}
              counts={counts}
              locks={locks}
              viewerRsvpByDate={viewerRsvpByDate}
              onLockedClick={() => {}}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Calendar grid (compact / side-drawer)
          </h2>
          <div className="w-72 rounded-2xl border border-white/10 bg-surface-900/40 p-3">
            <Calendar
              weekStart={weekStart}
              availability={availability}
              counts={counts}
              locks={locks}
              viewerRsvpByDate={viewerRsvpByDate}
              onLockedClick={() => {}}
              compact
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Bare dice (counts 1 / 4 / 12 / 20)
          </h2>
          <div className="flex items-end gap-6 rounded-2xl border border-white/10 bg-surface-900/40 p-6">
            {[1, 4, 12, 20].map((n) => (
              <D20Die key={n} count={n} className="dnd-die h-20 w-20" />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Modal panel
          </h2>
          <div className="mx-auto h-[640px] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-surface-950 p-4">
            <DndNightPanel attendees={ATTENDEES} partyCount={4} />
          </div>
        </section>
      </PageMain>
    </PageShell>
  );
}
