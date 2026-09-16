import { LockedDateSchema } from "@boardgames/core/protocol";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Calendar from "../components/offline/Calendar";
import { NightInviteCard } from "../components/offline/NightInviteCard";
import PrivateNightPeek from "../components/offline/PrivateNightPeek";
import { Button } from "../components/ui/Button";
import { PageMain, PageShell } from "../components/ui/PageShell";
import { Section } from "../components/ui/Section";
import { Surface } from "../components/ui/Surface";
import type { LockedDate } from "../lib/calendar-locks";
import { DND_SLUG } from "../lib/dnd-night";
import type { AvailabilityCounts, AvailabilityMap } from "../lib/offline-availability";
import { dateKey } from "../lib/offline-availability";
import { build42Days } from "../lib/offline-week";

// Dev-only visual harness for the private-night treatment: /dev/private-preview
// (unguarded, like /dev/dnd-preview). One private night per viewer state on a
// mock calendar — outsider, invited, seated, waitlisted, host, full table —
// plus the outsider's peek and the "you're invited" card. `?viewer=<id>`
// switches whose eyes the grid is drawn for; `?open=peek|invite` starts
// with that dialog up; `?frame=WxH` boxes the page.

const ME = "u-me";
const HOST = "u-host";

function mkLock(over: Partial<LockedDate>): LockedDate {
  return LockedDateSchema.parse({
    lockedBy: "u-admin",
    lockedAt: "2026-09-10 12:00:00",
    expectedUserIds: [HOST, ME, "u-a", "u-b", "u-c"],
    rsvps: { [HOST]: "yes" },
    host: { userId: HOST, name: "Victor" },
    eventTime: "19:30",
    address: "Musterstraße 1, Munich",
    picksLockedAt: null,
    hostAtHome: true,
    attendance: { definite: 1, tentative: 0 },
    topGameSlug: null,
    isPrivate: true,
    title: null,
    pickMode: "host",
    seats: { total: 5, taken: 1, waitlisted: 0 },
    seatedUserIds: [HOST],
    waitlistUserIds: [],
    redacted: false,
    ...over,
  });
}

export default function PrivateNightPreview() {
  const [params] = useSearchParams();
  const frame = params.get("frame");
  // `?open=peek|invite` starts with a dialog up (for headless captures).
  const [peekOpen, setPeekOpen] = useState(params.get("open") === "peek");
  const [inviteOpen, setInviteOpen] = useState(params.get("open") === "invite");

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 7);
  const keys = build42Days(weekStart).map(dateKey);
  const at = (i: number) => keys[i] ?? "";

  const locks: Record<string, LockedDate> = {
    // Outsider: the redacted shape the server sends.
    [at(9)]: mkLock({
      redacted: true,
      expectedUserIds: [],
      rsvps: {},
      seatedUserIds: [],
      eventTime: null,
      address: null,
      seats: { total: 5, taken: 3, waitlisted: 0 },
      attendance: { definite: 3, tentative: 0 },
    }),
    // Invited, no answer yet.
    [at(11)]: mkLock({
      title: "TI4 marathon",
      seats: { total: 5, taken: 2, waitlisted: 0 },
      seatedUserIds: [HOST, "u-a"],
      rsvps: { [HOST]: "yes", "u-a": "yes" },
      attendance: { definite: 2, tentative: 0 },
    }),
    // Seated (seat 3 of 5).
    [at(13)]: mkLock({
      seats: { total: 5, taken: 3, waitlisted: 0 },
      seatedUserIds: [HOST, "u-a", ME],
      rsvps: { [HOST]: "yes", "u-a": "yes", [ME]: "yes" },
      attendance: { definite: 3, tentative: 0 },
    }),
    // Full table, viewer on the waitlist.
    [at(17)]: mkLock({
      seats: { total: 4, taken: 4, waitlisted: 2 },
      seatedUserIds: [HOST, "u-a", "u-b", "u-c"],
      waitlistUserIds: ["u-d", ME],
      rsvps: { [HOST]: "yes", "u-a": "yes", "u-b": "yes", "u-c": "yes", "u-d": "yes", [ME]: "yes" },
      attendance: { definite: 4, tentative: 0 },
    }),
    // Hosting.
    [at(19)]: mkLock({
      host: { userId: ME, name: "You" },
      expectedUserIds: [ME, "u-a", "u-b"],
      rsvps: { [ME]: "yes", "u-a": "yes" },
      seats: { total: 6, taken: 2, waitlisted: 0 },
      seatedUserIds: [ME, "u-a"],
      attendance: { definite: 2, tentative: 0 },
    }),
    // Declined.
    [at(25)]: mkLock({
      rsvps: { [HOST]: "yes", [ME]: "no" },
      seats: { total: 3, taken: 1, waitlisted: 0 },
    }),
    // Big table — numerals only, no pips.
    [at(27)]: mkLock({
      seats: { total: 12, taken: 7, waitlisted: 0 },
      seatedUserIds: [HOST, "u-a", "u-b", "u-c", "u-d", "u-e", ME],
      rsvps: { [HOST]: "yes", [ME]: "yes" },
      attendance: { definite: 7, tentative: 0 },
    }),
    // An open locked night, for contrast.
    [at(30)]: mkLock({
      isPrivate: false,
      seats: null,
      seatedUserIds: [],
      picksLockedAt: "2026-09-10 13:00:00",
      attendance: { definite: 4, tentative: 2 },
    }),
    // ── Two nights on one date: the cell splits ───────────────────────
    // A sealed open night the viewer is going to, beside a private table
    // they are seated at.
    [at(31)]: mkLock({
      isPrivate: false,
      seats: null,
      seatedUserIds: [],
      rsvps: { [ME]: "yes" },
      picksLockedAt: "2026-09-10 13:00:00",
      attendance: { definite: 6, tentative: 2 },
    }),
    [`${at(31)}_2`]: mkLock({
      seats: { total: 4, taken: 3, waitlisted: 1 },
      seatedUserIds: [HOST, "u-a", ME],
      waitlistUserIds: ["u-b"],
      rsvps: { [HOST]: "yes", "u-a": "yes", [ME]: "yes", "u-b": "yes" },
      attendance: { definite: 3, tentative: 0 },
    }),
    // An unsealed open night still wanting an RSVP, beside a D&D night.
    [at(33)]: mkLock({
      isPrivate: false,
      seats: null,
      seatedUserIds: [],
      attendance: { definite: 3, tentative: 1 },
    }),
    [`${at(33)}_2`]: mkLock({
      isPrivate: false,
      seats: null,
      seatedUserIds: [],
      rsvps: { [ME]: "yes" },
      picksLockedAt: "2026-09-10 13:00:00",
      topGameSlug: DND_SLUG,
      attendance: { definite: 5, tentative: 0 },
    }),
    // Two big tables — the numerals have to fit "12/14".
    [at(35)]: mkLock({
      isPrivate: false,
      seats: null,
      seatedUserIds: [],
      rsvps: { [ME]: "no" },
      picksLockedAt: "2026-09-10 13:00:00",
      attendance: { definite: 12, tentative: 2 },
    }),
    [`${at(35)}_2`]: mkLock({
      seats: { total: 12, taken: 11, waitlisted: 0 },
      seatedUserIds: [HOST],
      rsvps: { [HOST]: "yes" },
      attendance: { definite: 11, tentative: 0 },
    }),
  };

  const availability: AvailabilityMap = { [at(3)]: "can", [at(4)]: "maybe" };
  const counts: AvailabilityCounts = {
    [at(23)]: { can: 5, maybe: 2 },
    [at(22)]: { can: 3, maybe: 1 },
  };
  const viewer = { id: params.get("viewer") ?? ME, isAdmin: false };

  const body = (
    <PageMain width="6xl" padding="spacious" className="flex flex-col gap-10 text-fg-primary">
      <header>
        <h1 className="text-2xl font-bold text-fg-strong">Private night — visual preview</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          Left to right: outsider (redacted), invited, seated, waitlisted, hosting, declined, a
          12-seat table, an open sealed night for contrast — then three dates carrying TWO nights
          (open + private, open + D&D, two big tables), which split the cell.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPeekOpen(true)}>
            Open the outsider peek
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
            Open the invitation card
          </Button>
        </div>
      </header>

      <Section title="Calendar grid (full)">
        <Surface variant="tile" padding="md" className="flex h-[680px] flex-col">
          <Calendar
            weekStart={weekStart}
            availability={availability}
            counts={counts}
            locks={locks}
            viewer={viewer}
            onLockedClick={() => {}}
          />
        </Surface>
      </Section>

      <Section title="Calendar grid (lock mode, admin)">
        <Surface variant="tile" padding="md" className="flex h-[680px] flex-col">
          <Calendar
            weekStart={weekStart}
            availability={availability}
            counts={counts}
            locks={locks}
            viewer={viewer}
            lockMode
            onLockToggle={() => {}}
          />
        </Surface>
      </Section>

      <Section title="Calendar grid (compact / side-drawer)">
        <Surface variant="tile" padding="sm" className="w-72">
          <Calendar
            weekStart={weekStart}
            availability={availability}
            counts={counts}
            locks={locks}
            viewer={viewer}
            onLockedClick={() => {}}
            compact
          />
        </Surface>
      </Section>

      {peekOpen && locks[at(9)] && (
        <PrivateNightPeek date={at(9)} lock={locks[at(9)]} onClose={() => setPeekOpen(false)} />
      )}
      {inviteOpen && (
        <NightInviteCard
          greeting={{
            kind: "night-invite",
            date: at(11) as never,
            hostUserId: HOST,
            title: "TI4 marathon",
            eventTime: "19:30" as never,
            seats: { total: 5, taken: 2, waitlisted: 0 },
            pickMode: "host",
          }}
          host={{ name: "Victor", image: null }}
          onDismiss={() => setInviteOpen(false)}
          onCta={() => setInviteOpen(false)}
        />
      )}
    </PageMain>
  );

  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    return (
      <PageShell background="plain">
        <Surface
          variant="tile"
          padding="none"
          className="mx-auto overflow-hidden"
          style={{ width: w, height: h }}
        >
          <iframe
            title="framed"
            src={`/dev/private-preview?viewer=${viewer.id}`}
            style={{ width: w, height: h, border: 0 }}
          />
        </Surface>
      </PageShell>
    );
  }

  return <PageShell background="plain">{body}</PageShell>;
}
