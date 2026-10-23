import { CAMPAIGN_NIGHTS } from "@boardgames/core/ical/campaign";
import type { LockedDate } from "@boardgames/core/protocol";
import { useState } from "react";
import Calendar from "../components/offline/Calendar";
import CampaignNightPanel from "../components/offline/CampaignNightPanel";
import { CampaignRelic } from "../components/offline/CampaignRelic";
import { Chip } from "../components/ui/Chip";
import { PageMain, PageShell } from "../components/ui/PageShell";
import { Section } from "../components/ui/Section";
import type { Attendee } from "../lib/calendar-games";
import { relicUrl } from "../lib/campaign-relics";
import type { AvailabilityCounts, AvailabilityMap } from "../lib/offline-availability";
import { dateKey } from "../lib/offline-availability";
import { build42Days } from "../lib/offline-week";

// Dev-only visual harness for the campaign-night calendar treatment (D&D and
// every other campaign game). Reached at /dev/campaign-preview (and the old
// /dev/dnd-preview), unguarded like /dev/deck-preview. Renders the real
// Calendar with mock locks for the picked game — every headcount it has a
// relic for, and a split two-night date — plus the modal panel and the game's
// relics.

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
    isPrivate: false,
    title: null,
    pickMode: "group",
    seats: null,
    seatedUserIds: [],
    waitlistUserIds: [],
    redacted: false,
    ...over,
  };
}

// Borin is the admin and is coming → the DM on a D&D night; Mara hosts and owns
// every campaign box → "Brings the box" on the others.
const ATTENDEES: Attendee[] = [
  {
    userId: "u-host",
    name: "Mara the Wise",
    isHost: true,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    isGuest: false,
    votes: { hype: 1, teach: 1, learn: 0 },
    bringing: CAMPAIGN_NIGHTS.map((c) => c.slug),
    seat: null,
    staleVotes: null,
  },
  {
    userId: "u2",
    name: "Borin Stonefist",
    isHost: false,
    isAdmin: true,
    status: "definite",
    hasRsvped: true,
    isGuest: false,
    votes: { hype: 1, teach: 0, learn: 1 },
    bringing: [],
    seat: null,
    staleVotes: null,
  },
  {
    userId: "u3",
    name: "Lyra Quickfoot",
    isHost: false,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    isGuest: false,
    votes: { hype: 1, teach: 0, learn: 0 },
    bringing: [],
    seat: null,
    staleVotes: null,
  },
  {
    userId: "u4",
    name: "Finn",
    isHost: false,
    isAdmin: false,
    status: "definite",
    hasRsvped: false,
    isGuest: false,
    votes: { hype: 0, teach: 0, learn: 0 },
    bringing: [],
    seat: null,
    staleVotes: null,
  },
  {
    userId: "u5",
    name: "Senna",
    isHost: false,
    isAdmin: false,
    status: "tentative",
    hasRsvped: false,
    isGuest: false,
    votes: { hype: 0, teach: 0, learn: 0 },
    bringing: [],
    seat: null,
    staleVotes: null,
  },
];

const COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);
const NIGHT_CELLS = [8, 9, 10, 11, 15, 16, 17];

export default function CampaignNightPreview() {
  const [slug, setSlug] = useState(CAMPAIGN_NIGHTS[0]?.slug ?? "");
  const campaign = CAMPAIGN_NIGHTS.find((c) => c.slug === slug) ?? CAMPAIGN_NIGHTS[0];
  if (!campaign) return null;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 7);
  const keys = build42Days(weekStart).map(dateKey);

  // The picked campaign at every headcount it has a relic for (repeating to
  // fill the row), a split date with it beside a plain night, a plain
  // picks-locked night for the N/N comparison, and a heat day.
  const relicCounts = COUNTS.filter((n) => relicUrl(campaign.slug, n));
  const at = (i: number) => keys[i] ?? "";
  const night = (definite: number, tentative = 1) =>
    mkLock({ topGameSlug: campaign.slug, attendance: { definite, tentative } });
  const locks = {
    ...Object.fromEntries(
      NIGHT_CELLS.map((cell, i) => [at(cell), night(relicCounts[i % relicCounts.length] ?? 2)]),
    ),
    [at(18)]: night(relicCounts[0] ?? 2),
    [`${at(18)}_2`]: mkLock({
      topGameSlug: "lost-cities",
      attendance: { definite: 3, tentative: 1 },
    }),
    [at(12)]: mkLock({ topGameSlug: "lost-cities", attendance: { definite: 4, tentative: 3 } }),
  };

  const availability: AvailabilityMap = { [at(3)]: "can", [at(4)]: "maybe" };
  const counts: AvailabilityCounts = {
    [at(23)]: { can: 5, maybe: 2 },
    [at(22)]: { can: 3, maybe: 1 },
  };
  const viewerRsvpByDate = { [at(10)]: "yes" as const, [at(11)]: "no" as const };

  return (
    <PageShell background="plain">
      <PageMain width="6xl" padding="spacious" className="flex flex-col gap-10 text-fg-primary">
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg-strong">Campaign nights — visual preview</h1>
            <p className="mt-1 text-sm text-fg-secondary">
              Mock calendar for the picked campaign at every headcount it has a relic for, a split
              date, a plain picks-locked night and heat days.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CAMPAIGN_NIGHTS.map((c) => (
              <Chip
                key={c.slug}
                pressed={c.slug === campaign.slug}
                tone="accent"
                size="xs"
                flat
                onClick={() => setSlug(c.slug)}
              >
                {c.night}
              </Chip>
            ))}
          </div>
        </header>

        <Section title="Calendar grid (full)">
          <div className="flex h-[680px] flex-col rounded-card-2xl border border-line bg-surface-900/40 p-4 max-sm:h-[520px] max-sm:p-2">
            <Calendar
              weekStart={weekStart}
              availability={availability}
              counts={counts}
              locks={locks}
              viewerRsvpByDate={viewerRsvpByDate}
              onLockedClick={() => {}}
            />
          </div>
        </Section>

        <Section title="Calendar grid (compact / side-drawer)">
          <div className="w-72 rounded-card-2xl border border-line bg-surface-900/40 p-3">
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
        </Section>

        <Section title="Every relic">
          <div
            data-campaign={campaign.slug}
            className="flex flex-wrap items-end gap-4 rounded-card-2xl border border-line bg-surface-900/40 p-6"
          >
            {relicCounts.map((n) => (
              <div key={n} className="flex flex-col items-center gap-1">
                <CampaignRelic slug={campaign.slug} count={n} className="h-20 w-20" />
                <span className="text-2xs text-fg-muted">{n}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Modal panel">
          <div className="mx-auto h-[640px] w-full max-w-2xl overflow-hidden rounded-card-2xl border border-line bg-surface-950 p-4">
            <CampaignNightPanel campaign={campaign} attendees={ATTENDEES} partyCount={4} />
          </div>
        </Section>
      </PageMain>
    </PageShell>
  );
}
