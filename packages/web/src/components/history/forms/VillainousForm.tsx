import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { parseMultiVariant } from "../../../games/match-variants";
import { villainsForBoxes } from "../../../games/villainous/villains";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";

type User = { id: string; name: string };
type FfaPlayer = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: User[];
  /** Which Villainous box was played — decides the villain roster. */
  gameSlug: string;
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

/**
 * Match-history form for Villainous — a point-less free-for-all where exactly
 * one player wins by completing their villain's objective. We don't track
 * scores; instead each player is tagged with the villain they played (`role`)
 * and the sole winner is marked with `rank: 1`. The boxes in play (picked in
 * the GameVariantPicker above and stored in `scenario`) decide which villains
 * are offered, falling back to the catalog game's own roster while no box is
 * checked — see `villainous/villains.ts`.
 */
export function VillainousForm({ users, gameSlug, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  const roster = villainsForBoxes(parseMultiVariant(value.scenario), gameSlug);

  // When the boxes in play narrow (e.g. unchecking The Worst Takes It All,
  // which drops Jafar / Queen of Hearts), clear any now-invalid villain so a
  // saved record can never reference a villain outside its boxes. Guarded so
  // it only writes when something is actually stale.
  useEffect(() => {
    const valid = new Set(roster);
    if (!value.players.some((p) => p.role !== undefined && !valid.has(p.role))) return;
    onChange({
      ...value,
      players: value.players.map((p) =>
        p.role !== undefined && !valid.has(p.role) ? withRole(p, undefined) : p,
      ),
    });
  }, [value, onChange, roster]);

  function setParticipants(participants: Participant[]) {
    const byId = new Map(value.players.map((p) => [p.userId, p] as const));
    const players = participants.map((p) => {
      const prev = byId.get(p.userId);
      // Keep score/role/rank for players that stay; new ones start point-less.
      return prev ? { ...prev, ...p } : { ...p, score: 0 };
    });
    onChange({ ...value, players });
  }

  function setVillain(userId: string, villain: string) {
    const players = value.players.map((p) =>
      p.userId === userId ? withRole(p, p.role === villain ? undefined : villain) : p,
    );
    onChange({ ...value, players });
  }

  function setWinner(userId: string) {
    const players = value.players.map((p) =>
      p.userId === userId ? withRank(p, p.rank === 1 ? undefined : 1) : withRank(p, undefined),
    );
    onChange({ ...value, players });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="villainous-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>

      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
            Tap each player's villain, then crown the one who won.
          </span>
          {value.players.map((p) => {
            const isWinner = p.rank === 1;
            return (
              <Surface key={p.userId} variant="tile" padding="sm" className="flex flex-col gap-1.5">
                <PlayerRow
                  name={p.displayName}
                  highlight={isWinner}
                  right={
                    <Chip
                      pressed={isWinner}
                      tone="amber"
                      size="xs"
                      onClick={() => setWinner(p.userId)}
                      icon={<span aria-hidden="true">👑</span>}
                    >
                      Winner
                    </Chip>
                  }
                />
                <div className="flex flex-wrap gap-1.5">
                  {roster.map((villain) => (
                    <Chip
                      key={villain}
                      pressed={p.role === villain}
                      tone="accent"
                      variant="outlined"
                      size="xs"
                      onClick={() => setVillain(p.userId, villain)}
                    >
                      {villain}
                    </Chip>
                  ))}
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
// Set or clear the optional `role` / `rank` keys without leaving `undefined`
// values on the wire object (the schema and MatchCard both key off presence).

function withRole(p: FfaPlayer, role: string | undefined): FfaPlayer {
  if (role === undefined) {
    const { role: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, role };
}

function withRank(p: FfaPlayer, rank: number | undefined): FfaPlayer {
  if (rank === undefined) {
    const { rank: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, rank };
}
