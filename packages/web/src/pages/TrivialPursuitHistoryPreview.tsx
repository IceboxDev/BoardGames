import type {
  MatchOutcome,
  MatchOutcomeFreeForAll,
  MatchOutcomeTeams,
  MatchRecord,
} from "@boardgames/core/history/types";
import { useState } from "react";
import { TrivialPursuitForm } from "../components/history/forms/TrivialPursuitForm";
import { TrivialPursuitTeamsForm } from "../components/history/forms/TrivialPursuitTeamsForm";
import { GameVariantPicker } from "../components/history/GameVariantPicker";
import { MatchCard } from "../components/history/MatchCard";
import { Surface } from "../components/ui/Surface";

// Dev-only preview of the Trivial Pursuit history surfaces — the edition +
// language picker, the wedges forms (free-for-all and teams) and the MatchCard
// read side, with no auth/admin session. /dev/trivial-pursuit-preview

const USERS = [
  { id: "u1", name: "Mantas" },
  { id: "u2", name: "Jaqueline" },
  { id: "u3", name: "Adrian Slamić" },
  { id: "u4", name: "Beatrice Alessandri" },
];

// Two full pies, one winner — the case the crown exists for.
const ffa: MatchOutcomeFreeForAll = {
  kind: "free-for-all",
  scenario: "Classic · English",
  players: [
    {
      userId: "u1",
      displayName: "Mantas",
      score: 0,
      rank: 1,
      wedges: ["blue", "pink", "yellow", "brown", "green", "orange"],
    },
    {
      userId: "u3",
      displayName: "Adrian Slamić",
      score: 0,
      wedges: ["blue", "pink", "yellow", "brown", "green", "orange"],
    },
    { userId: "u2", displayName: "Jaqueline", score: 0, wedges: ["pink", "green"] },
    { userId: "u4", displayName: "Beatrice Alessandri", score: 0 },
  ],
};

const teams: MatchOutcomeTeams = {
  kind: "teams",
  scenario: "Genus · German",
  teams: [
    {
      members: [
        { userId: "u1", displayName: "Mantas" },
        { userId: "u2", displayName: "Jaqueline" },
      ],
      wedges: ["blue", "yellow", "brown", "green", "orange"],
    },
    {
      members: [
        { userId: "u3", displayName: "Adrian Slamić" },
        { userId: "u4", displayName: "Beatrice Alessandri" },
      ],
      wedges: ["blue", "pink", "yellow", "brown", "green", "orange"],
    },
  ],
  winnerTeamIndices: [1],
};

const record = (id: number, outcome: MatchOutcome): MatchRecord => ({
  id,
  dateKey: null,
  playedAt: "2026-09-30T20:00:00.000Z",
  gameSlug: "trivial-pursuit",
  gameTitle: "Trivial Pursuit",
  outcome,
  notes: null,
  recordedBy: "u1",
  recordedAt: "2026-09-30 20:00:00",
  updatedAt: null,
  sortOrder: 0,
});

function Pane<T extends MatchOutcome>({
  title,
  initial,
  render,
}: {
  title: string;
  initial: T;
  render: (value: T, onChange: (next: T) => void) => React.ReactNode;
}) {
  const [outcome, setOutcome] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-fg-primary">{title}</h2>
      <GameVariantPicker
        gameSlug="trivial-pursuit"
        outcome={outcome}
        onChange={(next) => setOutcome(next as T)}
      />
      <Surface variant="tile" padding="md">
        {render(outcome, setOutcome)}
      </Surface>
      <MatchCard match={record(1, outcome)} isAdmin={false} currentUserId="u1" />
    </div>
  );
}

export default function TrivialPursuitHistoryPreview() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Pane
          title="Free-for-all — two full pies, one winner"
          initial={ffa}
          render={(value, onChange) => (
            <TrivialPursuitForm users={USERS} value={value} onChange={onChange} />
          )}
        />
        <Pane
          title="Teams — one winning team"
          initial={teams}
          render={(value, onChange) => (
            <TrivialPursuitTeamsForm
              users={USERS}
              value={value}
              onChange={onChange}
              gameSlug="trivial-pursuit"
            />
          )}
        />
      </div>
    </div>
  );
}
