import type { MatchOutcomeLastStanding, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { heroesForSets } from "../../../games/dungeon-mayhem/characters";
import { parseMultiVariant } from "../../../games/match-variants";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import { PlayerRow } from "../PlayerRow";
import {
  GroupLabel,
  mergeParticipants,
  nextEliminationOrder,
  OutcomeFormShell,
  RoleChipRow,
  SurvivalBadge,
  withOptional,
} from "./shared";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeLastStanding;
  onChange: (next: MatchOutcomeLastStanding) => void;
};

/**
 * Match-history form for Dungeon Mayhem — an elimination game (last hero
 * standing wins). Combines the last-standing elimination model (each player
 * eliminated in order; survivor wins) with a Villainous-style per-player hero
 * picker. The sets in play (picked in the GameVariantPicker above and stored in
 * `scenario` as e.g. "Standard + Monster Madness") decide which heroes are
 * offered — see `dungeon-mayhem/characters.ts`.
 */
export function DungeonMayhemForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  const roster = heroesForSets(parseMultiVariant(value.scenario));

  // When the selected sets narrow (e.g. unchecking Monster Madness), clear any
  // hero that's no longer in the pool so a saved record never references a hero
  // outside its sets. Guarded so it only writes when something is actually
  // stale — no loop.
  useEffect(() => {
    const valid = new Set(heroesForSets(parseMultiVariant(value.scenario)));
    if (!value.players.some((p) => p.role !== undefined && !valid.has(p.role))) return;
    onChange({
      ...value,
      players: value.players.map((p) =>
        p.role !== undefined && !valid.has(p.role) ? withOptional(p, "role", undefined) : p,
      ),
    });
  }, [value, onChange]);

  function setParticipants(participants: Participant[]) {
    // Keep hero/elimination state for players who stay; new ones start clean.
    onChange({ ...value, players: mergeParticipants(value.players, participants) });
  }

  function setHero(userId: string, hero: string) {
    const players = value.players.map((p) =>
      p.userId === userId ? withOptional(p, "role", p.role === hero ? undefined : hero) : p,
    );
    onChange({ ...value, players });
  }

  function toggleEliminated(userId: string) {
    const player = value.players.find((p) => p.userId === userId);
    if (!player) return;
    if (player.eliminationOrder !== undefined) {
      // Revive: drop the elimination order so this player counts as a survivor.
      const players = value.players.map((p) =>
        p.userId === userId ? withOptional(p, "eliminationOrder", undefined) : p,
      );
      onChange({ ...value, players });
    } else {
      // Eliminate: append to the elimination order.
      const nextOrder = nextEliminationOrder(value.players);
      const players = value.players.map((p) =>
        p.userId === userId ? withOptional(p, "eliminationOrder", nextOrder) : p,
      );
      onChange({ ...value, players });
    }
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <GroupLabel>
            Tap each player's hero, then eliminate them in order. Whoever's left standing wins.
          </GroupLabel>
          {value.players.map((p) => {
            const eliminated = p.eliminationOrder !== undefined;
            return (
              <Surface key={p.userId} variant="tile" padding="sm" className="flex flex-col gap-1.5">
                <PlayerRow
                  name={p.displayName}
                  nameClassName={eliminated ? "text-fg-muted line-through" : "text-amber-100"}
                  right={
                    <>
                      <SurvivalBadge eliminationOrder={p.eliminationOrder} />
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => toggleEliminated(p.userId)}
                      >
                        {eliminated ? "Revive" : "Eliminate"}
                      </Button>
                    </>
                  }
                />
                <RoleChipRow
                  roster={roster}
                  current={p.role}
                  onToggle={(hero) => setHero(p.userId, hero)}
                />
              </Surface>
            );
          })}
        </div>
      )}
    </OutcomeFormShell>
  );
}
