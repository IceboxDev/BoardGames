import {
  describeRaceLimit,
  isRaceTotalsOnly,
  type RaceStatus,
  raceStatus,
  runningTotals,
  SCORE_RACE_MAX_ROUNDS,
  type ScoreRace,
} from "@boardgames/core/history/score-race";
import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { Button } from "../../ui/Button";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Surface } from "../../ui/Surface";
import type { PickerUser } from "../ParticipantPicker";
import { ScoreInput } from "../ScoreInput";
import { hasScoreTie, placementOrder } from "./free-for-all-placement";
import { normalizeRace, sameRace } from "./score-race-rounds";
import { GroupLabel, OutcomeFormShell } from "./shared";
import { TieBreakPanel } from "./TieBreakPanel";

// Score-limit races (Take 5, Bandit): the game is a run of hands, each adding
// penalty points, until somebody's total crosses the limit — then the lowest
// total wins. Entered like a score sheet, hand by hand (Decrypto-style): the
// form keeps every player's `raceRounds` and the summed `score`, stops
// offering hands once the limit is crossed, and only a finished game saves.
// A tie at the bottom opens the shared tie-break arrows.

type Player = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: PickerUser[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
  race: ScoreRace;
};

export function ScoreRaceForm({ users, value, onChange, race }: Props) {
  const players = value.players;
  const selectedIds = players.map((p) => p.userId);
  const hand = race.roundLabel.toLowerCase();

  // Players arriving from the night prefill (or a kind switch) carry no hands
  // yet — give them hand 1. Idempotent, so it settles in one pass.
  useEffect(() => {
    const normalized = normalizeRace(value.players);
    if (!sameRace(value.players, normalized)) onChange({ ...value, players: normalized });
  }, [value, onChange]);

  function commit(next: Player[]) {
    onChange({ ...value, players: normalizeRace(next) });
  }

  function setParticipants(participants: Participant[]) {
    const byId = new Map(players.map((p) => [p.userId, p] as const));
    commit(participants.map((p) => byId.get(p.userId) ?? { ...p, score: 0, raceRounds: [] }));
  }

  function setHand(userId: string, round: number, points: number) {
    commit(
      players.map((p) =>
        p.userId === userId
          ? { ...p, raceRounds: (p.raceRounds ?? []).map((s, r) => (r === round ? points : s)) }
          : p,
      ),
    );
  }

  const totalsOnly = isRaceTotalsOnly(players);
  const rounds = players[0]?.raceRounds?.length ?? 0;
  const status: RaceStatus = raceStatus(race, players);
  const totals = runningTotals(players);
  const finished = status.status === "finished";
  const crossed = new Set(finished ? status.crossed : []);
  const winner = finished ? placementOrder(players, true)[0] : undefined;
  const tie = finished && hasScoreTie(players);

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {totalsOnly && (
        <Surface variant="tile" padding="sm" className="flex flex-col gap-2">
          <span className="text-2xs leading-snug text-fg-secondary">
            Recorded before {hand}-by-{hand} entry — final totals only:{" "}
            {players.map((p) => `${p.displayName} ${p.score}`).join(", ")}.
          </span>
          <div>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => commit(players.map((p) => ({ ...p, score: 0, raceRounds: [0] })))}
            >
              Re-enter {hand} by {hand}
            </Button>
          </div>
        </Surface>
      )}

      {!totalsOnly && players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>
            Enter each {hand}'s points. The game ends when a total {describeRaceLimit(race)}; lowest
            total wins.
          </GroupLabel>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="w-8" />
                  {players.map((p) => (
                    <th
                      key={p.userId}
                      className="max-w-16 truncate px-1 text-center text-2xs font-medium text-fg-muted"
                      title={p.displayName}
                    >
                      {p.displayName.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rounds }, (_, r) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: hands are positional by nature.
                  <tr key={r}>
                    <td className="text-2xs font-bold text-fg-secondary">
                      {race.roundLabel[0]}
                      {r + 1}
                    </td>
                    {players.map((p) => (
                      <td key={p.userId}>
                        <ScoreInput
                          aria-label={`${p.displayName} — ${hand} ${r + 1}`}
                          value={p.raceRounds?.[r] ?? 0}
                          onValueChange={(n) => setHand(p.userId, r, n)}
                          width="auto"
                          className="w-16 px-2 text-right tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-2xs font-bold text-fg-secondary">Σ</td>
                  {players.map((p, i) => (
                    <td
                      key={p.userId}
                      className={`px-2 text-right font-semibold tabular-nums ${
                        crossed.has(i)
                          ? "text-rose-300"
                          : winner?.userId === p.userId
                            ? "text-amber-300"
                            : "text-fg-primary"
                      }`}
                      title={`Running total: ${(totals[i] ?? []).join(" → ")}`}
                    >
                      {p.score}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="xs"
              disabled={finished || status.status === "invalid" || rounds >= SCORE_RACE_MAX_ROUNDS}
              onClick={() =>
                commit(players.map((p) => ({ ...p, raceRounds: [...(p.raceRounds ?? []), 0] })))
              }
            >
              + Add {hand}
            </Button>
            {rounds > 1 && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() =>
                  commit(
                    players.map((p) => ({ ...p, raceRounds: (p.raceRounds ?? []).slice(0, -1) })),
                  )
                }
              >
                − Remove last
              </Button>
            )}
          </div>
        </div>
      )}

      {tie && <TieBreakPanel players={players} lowestWins onChange={(next) => commit(next)} />}

      {!totalsOnly && players.length > 0 && (
        <RaceResult race={race} status={status} players={players} winner={winner} />
      )}
    </OutcomeFormShell>
  );
}

function RaceResult({
  race,
  status,
  players,
  winner,
}: {
  race: ScoreRace;
  status: RaceStatus;
  players: readonly Player[];
  winner: Player | undefined;
}) {
  const hand = race.roundLabel.toLowerCase();
  if (status.status === "invalid") return <ErrorAlert message={status.reason} />;
  if (status.status === "finished") {
    const enders = status.crossed.map((i) => players[i]?.displayName).join(" and ");
    return (
      <p className="text-xs font-semibold text-emerald-300">
        Game over after {hand} {status.rounds} — {enders} {describeRaceLimit(race, "past")}.
        {winner ? ` ${winner.displayName} wins with ${winner.score}.` : ""}
      </p>
    );
  }
  const top = Math.max(...players.map((p) => p.score));
  return (
    <p className="text-xs italic text-fg-muted">
      {status.status === "running" && top > 0
        ? `Highest total ${top} — keep adding ${hand}s until one ${describeRaceLimit(race)}.`
        : `Fill in ${hand} 1.`}
    </p>
  );
}
