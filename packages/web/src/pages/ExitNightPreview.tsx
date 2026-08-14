import ExitNightPanel from "../components/offline/ExitNightPanel";
import { PageMain, PageShell } from "../components/ui/PageShell";
import { Section } from "../components/ui/Section";
import { Surface } from "../components/ui/Surface";
import type { Attendee } from "../lib/calendar-games";
import type { ExitNightState } from "../lib/exit-night";

// Dev-only visual harness for the EXIT-night RSVP-modal panel. Reached at
// /dev/exit-preview (unguarded, like /dev/dnd-preview). The panel renders
// from a preview state instead of hitting /api/calendar/exit, so the
// second-stage vote UI can be eyeballed without a sealed night in the DB.

const ATTENDEES: Attendee[] = [
  {
    userId: "u1",
    name: "Mara",
    isHost: true,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    votes: { hype: 1, teach: 0, learn: 0 },
    bringing: [],
  },
  {
    userId: "u2",
    name: "Borin",
    isHost: false,
    isAdmin: true,
    status: "definite",
    hasRsvped: true,
    votes: { hype: 1, teach: 0, learn: 0 },
    bringing: [],
  },
  {
    userId: "u3",
    name: "Lyra",
    isHost: false,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    votes: { hype: 0, teach: 0, learn: 1 },
    bringing: [],
  },
  {
    userId: "u4",
    name: "Finn",
    isHost: false,
    isAdmin: false,
    status: "tentative",
    hasRsvped: false,
    votes: { hype: 0, teach: 0, learn: 0 },
    bringing: [],
  },
];

const STATE: ExitNightState = {
  owners: {
    "exit-abandoned-cabin": ["u1", "u3"],
    "exit-pharaohs-tomb": ["u1"],
    "exit-dead-man-orient-express": ["u2"],
    "exit-advent-silent-storm": ["u3"],
  },
  votes: {
    "exit-abandoned-cabin": ["u2", "u3"],
    "exit-dead-man-orient-express": ["u1"],
    "exit-venice-conspiracy": ["u3"],
  },
};

export default function ExitNightPreview() {
  return (
    <PageShell background="plain">
      <PageMain width="6xl" padding="spacious" className="flex flex-col gap-10 text-fg-primary">
        <header>
          <h1 className="text-2xl font-bold text-white">EXIT Night — visual preview</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            The sealed-night narrowing vote: owned boxes ranked by votes, the full release list
            behind the toggle.
          </p>
        </header>

        <Section title="Modal panel (owned boxes + votes)">
          <Surface className="mx-auto h-[640px] w-full max-w-2xl overflow-hidden">
            <ExitNightPanel
              date="2026-08-21"
              attendees={ATTENDEES}
              partyCount={3}
              previewState={STATE}
            />
          </Surface>
        </Section>
      </PageMain>
    </PageShell>
  );
}
