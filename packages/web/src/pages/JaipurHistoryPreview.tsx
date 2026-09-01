import type { MatchOutcomeFreeForAll, MatchRecord } from "@boardgames/core/history/types";
import { useState } from "react";
import { JaipurForm } from "../components/history/forms/JaipurForm";
import { MatchCard } from "../components/history/MatchCard";
import { Surface } from "../components/ui/Surface";

// Dev-only preview of the Jaipur best-of-three history surfaces — the
// RecordMatchModal's JaipurForm (interactive, both formats + the seal-tie
// crown picker) and the MatchCard read side, with no auth/admin session.
// /dev/jaipur-preview

const USERS = [
  { id: "u1", name: "Mantas" },
  { id: "u2", name: "Jaqueline" },
];

// A comes back 2–1 on seals despite the lower rupee total — the case the
// round record exists for.
const standard: MatchOutcomeFreeForAll = {
  kind: "free-for-all",
  scenario: "Standard",
  players: [
    { userId: "u1", displayName: "Mantas", score: 97, rank: 1, roundScores: [52, 10, 35] },
    { userId: "u2", displayName: "Jaqueline", score: 110, rank: 2, roundScores: [48, 60, 2] },
  ],
};

// Round 1 ties at 50 rupees — the rulebook tiebreak fields open (bonus
// tokens, then goods tokens while those tie too).
const tied: MatchOutcomeFreeForAll = {
  kind: "free-for-all",
  scenario: "Standard",
  players: [
    { userId: "u1", displayName: "Mantas", score: 90, roundScores: [50, 10, 30] },
    { userId: "u2", displayName: "Jaqueline", score: 112, roundScores: [50, 60, 2] },
  ],
};

// The same tie already settled by bonus tokens (3 vs 1) — Mantas takes round
// 1's seal and the match 2–1.
const tiedSettled: MatchOutcomeFreeForAll = {
  kind: "free-for-all",
  scenario: "Standard",
  players: [
    { userId: "u1", displayName: "Mantas", score: 90, rank: 1, roundScores: [50, 10, 30] },
    { userId: "u2", displayName: "Jaqueline", score: 112, rank: 2, roundScores: [50, 60, 2] },
  ],
  roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
};

const bestOfOne: MatchOutcomeFreeForAll = {
  kind: "free-for-all",
  scenario: "Best of 1",
  players: [
    { userId: "u1", displayName: "Mantas", score: 61 },
    { userId: "u2", displayName: "Jaqueline", score: 74 },
  ],
};

const record = (id: number, outcome: MatchOutcomeFreeForAll): MatchRecord => ({
  id,
  dateKey: null,
  playedAt: "2026-08-30T20:00:00.000Z",
  gameSlug: "jaipur",
  gameTitle: "Jaipur",
  outcome,
  notes: null,
  recordedBy: "u1",
  recordedAt: "2026-08-30 20:00:00",
  updatedAt: null,
  sortOrder: 0,
});

const sweep: MatchOutcomeFreeForAll = {
  kind: "free-for-all",
  scenario: "Standard",
  players: [
    { userId: "u2", displayName: "Jaqueline", score: 118, rank: 1, roundScores: [58, 60] },
    { userId: "u1", displayName: "Mantas", score: 93, rank: 2, roundScores: [48, 45] },
  ],
};

function FormPane({ title, initial }: { title: string; initial: MatchOutcomeFreeForAll }) {
  const [outcome, setOutcome] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-fg-primary">{title}</h2>
      <Surface variant="tile" padding="md">
        <JaipurForm users={USERS} value={outcome} onChange={setOutcome} />
      </Surface>
      <pre className="overflow-x-auto rounded-lg bg-surface-900/60 p-2 text-3xs text-fg-muted">
        {JSON.stringify(
          { players: outcome.players, roundTiebreaks: outcome.roundTiebreaks },
          null,
          1,
        )}
      </pre>
    </div>
  );
}

export default function JaipurHistoryPreview() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <FormPane title="Standard — 2–1 on seals" initial={standard} />
        <FormPane title="Standard — round 1 tied (tiebreak fields)" initial={tied} />
        <FormPane title="Standard — tie settled by bonus tokens" initial={tiedSettled} />
        <FormPane title="Best of 1 — plain score" initial={bestOfOne} />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-fg-primary">MatchCard read side</h2>
        <MatchCard match={record(1, standard)} isAdmin={false} currentUserId="u1" />
        <MatchCard match={record(2, sweep)} isAdmin={false} currentUserId="u1" />
        <MatchCard match={record(3, tiedSettled)} isAdmin={false} currentUserId="u1" />
        <MatchCard match={record(4, bestOfOne)} isAdmin={false} currentUserId="u1" />
      </div>
    </div>
  );
}
