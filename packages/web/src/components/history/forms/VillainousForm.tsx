import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { parseMultiVariant } from "../../../games/match-variants";
import { villainsForBoxes } from "../../../games/villainous/villains";
import { Chip } from "../../ui/Chip";
import { Surface } from "../../ui/Surface";
import { PlayerRow } from "../PlayerRow";
import {
  GroupLabel,
  mergeParticipants,
  OutcomeFormShell,
  RoleChipRow,
  withOptional,
} from "./shared";

type User = { id: string; name: string };

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
        p.role !== undefined && !valid.has(p.role) ? withOptional(p, "role", undefined) : p,
      ),
    });
  }, [value, onChange, roster]);

  function setParticipants(participants: Participant[]) {
    // Keep score/role/rank for players that stay; new ones start point-less.
    const players = mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 }));
    onChange({ ...value, players });
  }

  function setVillain(userId: string, villain: string) {
    const players = value.players.map((p) =>
      p.userId === userId ? withOptional(p, "role", p.role === villain ? undefined : villain) : p,
    );
    onChange({ ...value, players });
  }

  function setWinner(userId: string) {
    const players = value.players.map((p) =>
      p.userId === userId
        ? withOptional(p, "rank", p.rank === 1 ? undefined : 1)
        : withOptional(p, "rank", undefined),
    );
    onChange({ ...value, players });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <GroupLabel>Tap each player's villain, then crown the one who won.</GroupLabel>
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
                <RoleChipRow
                  roster={roster}
                  current={p.role}
                  onToggle={(villain) => setVillain(p.userId, villain)}
                />
              </Surface>
            );
          })}
        </div>
      )}
    </OutcomeFormShell>
  );
}
