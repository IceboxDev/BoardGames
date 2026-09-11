import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { Input } from "../../ui/Input";
import { Surface } from "../../ui/Surface";
import { PlayerRow } from "../PlayerRow";
import {
  describeSensoTiebreak,
  EMPEROR_FACTION,
  factionsForTable,
  normalizeSensoFfa,
  SENSO_MAX_PLAYERS,
  sensoFfaAwaitingCubes,
  sensoFfaEqual,
  sensoFfaStandings,
  sensoScoresEntered,
  sensoTiedLeaders,
} from "./senso-standings";
import {
  GroupLabel,
  mergeParticipants,
  OutcomeFormShell,
  RoleChipRow,
  withOptional,
} from "./shared";

// Sensō, standard play: two to five seats, each tagged with the faction it
// played (the four clans; the Emperor joins at five). Points decide; a tie
// opens the cube count for the tied seats; a tie that survives that goes to
// the Emperor — even from outside the tie — and is otherwise shared. Ranks
// are derived by `senso-standings.ts` on every edit, never picked by hand.

type User = { id: string; name: string };
type Player = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

export function SensoForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);

  // Keep the record converged (subtitle, the Emperor's implicit 0 cubes,
  // derived ranks) — covers players arriving from the night prefill and
  // records opened for editing. Idempotent, so it settles in one pass.
  useEffect(() => {
    const normalized = normalizeSensoFfa(value);
    if (!sensoFfaEqual(value, normalized)) onChange(normalized);
  }, [value, onChange]);

  function commit(players: Player[]) {
    onChange(normalizeSensoFfa({ ...value, players }));
  }

  function setParticipants(participants: Participant[]) {
    commit(mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 })));
  }

  function parseCount(raw: string): number {
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  }

  function setScore(userId: string, raw: string) {
    const score = parseCount(raw);
    commit(value.players.map((p) => (p.userId === userId ? { ...p, score } : p)));
  }

  function setFaction(userId: string, faction: string) {
    commit(
      value.players.map((p) => {
        if (p.userId !== userId) return p;
        const next = withOptional(p, "role", p.role === faction ? undefined : faction);
        // Leaving the throne drops the implicit 0 so a real cube count is asked for.
        return next.role === undefined && p.role === EMPEROR_FACTION
          ? withOptional(next, "tiebreak", undefined)
          : next;
      }),
    );
  }

  function setCubes(userId: string, raw: string) {
    const cubes = Math.min(1000, Math.max(0, Math.trunc(parseCount(raw))));
    commit(value.players.map((p) => (p.userId === userId ? { ...p, tiebreak: cubes } : p)));
  }

  const roster = factionsForTable(value.players.length);
  const entered = sensoScoresEntered(value.players);
  const leaders = sensoTiedLeaders(value.players);
  const tie = entered && leaders.length > 1;
  // No verdict while the tie is waiting on a cube count — an untyped count
  // would read as 0 and hand the Emperor a throne it hasn't earned yet.
  const awaitingCubes = sensoFfaAwaitingCubes(value.players);
  const standings = entered && !awaitingCubes ? sensoFfaStandings(value.players) : null;
  const topScore = leaders.length > 0 ? (value.players[leaders[0] ?? 0]?.score ?? 0) : 0;

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <GroupLabel>
            Enter each player's points and tap their faction. Most points wins; a tie goes to cubes
            on the map, then to the Emperor.
            {value.players.length > SENSO_MAX_PLAYERS
              ? ` Sensō seats at most ${SENSO_MAX_PLAYERS}.`
              : ""}
          </GroupLabel>
          {value.players.map((p) => (
            <Surface key={p.userId} variant="tile" padding="sm" className="flex flex-col gap-1.5">
              <PlayerRow
                name={p.displayName}
                highlight={p.rank === 1}
                right={
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label={`${p.displayName} — points`}
                    value={p.score}
                    onChange={(e) => setScore(p.userId, e.target.value)}
                    width="score"
                  />
                }
              />
              <RoleChipRow
                roster={roster}
                current={p.role}
                onToggle={(faction) => setFaction(p.userId, faction)}
              />
            </Surface>
          ))}
        </div>
      )}

      {tie && (
        <div className="flex flex-col gap-2 rounded-card-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-amber-200">Tied at {topScore} points</span>
            <span className="text-2xs leading-snug text-fg-secondary">
              Count each tied player's cubes on the map — the most cubes wins. Still tied, the
              Emperor takes the throne whether or not it is among the tied; with no Emperor at the
              table the game is shared.
            </span>
          </div>
          {leaders.map((i) => {
            const p = value.players[i];
            if (!p) return null;
            const isEmperor = p.role === EMPEROR_FACTION;
            return (
              <PlayerRow
                key={p.userId}
                name={p.displayName}
                highlight={standings?.winners.includes(i) ?? false}
                right={
                  isEmperor ? (
                    <span className="text-xs text-fg-muted">no cubes</span>
                  ) : (
                    <Input
                      type="number"
                      inputMode="numeric"
                      aria-label={`${p.displayName} — cubes on the map`}
                      value={p.tiebreak ?? ""}
                      placeholder="cubes"
                      onChange={(e) => setCubes(p.userId, e.target.value)}
                      width="auto"
                      className="w-20 px-2 text-right tabular-nums"
                    />
                  )
                }
              />
            );
          })}
        </div>
      )}

      {standings && (
        <ResultLine standings={standings} names={value.players.map((p) => p.displayName)} />
      )}
      {entered && awaitingCubes && <AwaitingCubes />}
    </OutcomeFormShell>
  );
}

export function AwaitingCubes() {
  return (
    <span className="text-xs text-fg-muted" data-testid="senso-result">
      Tied on points — the cube count settles it.
    </span>
  );
}

export function ResultLine({
  standings,
  names,
}: {
  standings: ReturnType<typeof sensoFfaStandings>;
  names: readonly string[];
}) {
  const winners = standings.winners.map((i) => names[i] ?? "?");
  const how = describeSensoTiebreak(standings.tiebreak);
  const text =
    winners.length === 1
      ? `Winner: ${winners[0]}${how ? ` — ${how}` : ""}`
      : `Shared: ${winners.join(" & ")} — ${how ?? "tied"}`;
  return (
    <span className="text-xs text-fg-secondary" data-testid="senso-result">
      {text}
    </span>
  );
}
