import { shuffle } from "@boardgames/core/games/pandemic/deck";
import { createRng, randomSeed } from "@boardgames/core/games/pandemic/rng";
import { ROLE_DEFS } from "@boardgames/core/games/pandemic/roles";
import type { SetupConfig } from "@boardgames/core/games/pandemic/types";
import { useCallback, useState } from "react";
import {
  SetupBriefing,
  SetupChoiceCards,
  SetupFooter,
  SetupOptions,
  SetupSection,
} from "../../../components/setup";
import { Button } from "../../../components/ui/Button";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import RoleCard from "./RoleCard";

// Pandemic's briefing: co-op, so the main choice is the difficulty (how many
// epidemics are shuffled in), not an AI. You control every role.

interface SetupScreenProps {
  onStart: (config: SetupConfig) => void;
}

const ALL_ROLE_IDS = ROLE_DEFS.map((r) => r.id);

// Preview-only shuffle: role cards shown on the setup screen are decorative,
// not game state, so a throwaway rng per call is fine.
function previewShuffle<T>(arr: readonly T[]): T[] {
  return shuffle(arr, createRng(randomSeed()));
}

const PLAYER_OPTIONS = [2, 3, 4].map((n) => ({
  value: n as 2 | 3 | 4,
  label: `${n}`,
}));

const DIFFICULTIES = [
  { id: "4", label: "Introductory", description: "A gentler introduction.", tier: "Easy" },
  { id: "5", label: "Standard", description: "The intended challenge.", tier: "Medium" },
  { id: "6", label: "Heroic", description: "Near-impossible odds.", tier: "Hard" },
] as const;

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [numPlayers, setNumPlayers] = useState<2 | 3 | 4>(2);
  const [difficulty, setDifficulty] = useState<4 | 5 | 6>(4);
  const [previewRoles, setPreviewRoles] = useState(() => previewShuffle(ALL_ROLE_IDS).slice(0, 2));

  const handlePlayerChange = useCallback((n: 2 | 3 | 4) => {
    setNumPlayers(n);
    setPreviewRoles(previewShuffle(ALL_ROLE_IDS).slice(0, n));
  }, []);

  const handleShuffle = useCallback(() => {
    setPreviewRoles(previewShuffle(ALL_ROLE_IDS).slice(0, numPlayers));
  }, [numPlayers]);

  const level = DIFFICULTIES.find((d) => d.id === String(difficulty));

  return (
    <SetupBriefing
      title="Pandemic"
      eyebrow="Solo · you control every role"
      blurb="Cooperative disease-fighting board game. Cure four diseases before they overwhelm the world."
      footer={
        <SetupFooter
          summary={`${numPlayers} roles · ${level?.label ?? ""} · ${difficulty} epidemics`}
          onStart={() => onStart({ numPlayers, difficulty })}
        />
      }
    >
      <SetupSection label="Difficulty">
        <SetupChoiceCards
          label="Difficulty"
          choices={DIFFICULTIES.map((d) => ({
            id: d.id,
            label: d.label,
            description: d.description,
            tier: d.tier,
            meta: <span className="text-fg-muted">{d.id} epidemics</span>,
          }))}
          value={String(difficulty)}
          onChange={(id) => setDifficulty(Number(id) as 4 | 5 | 6)}
        />
      </SetupSection>
      <SetupSection label="Game">
        <SetupOptions
          options={[
            {
              id: "players",
              label: "Players",
              span: "s",
              note: "Each player is a role; you play them all.",
              control: (
                <SegmentedControl
                  shape="rounded"
                  selectionMode="toggle"
                  aria-label="Number of players"
                  options={PLAYER_OPTIONS}
                  value={numPlayers}
                  onChange={handlePlayerChange}
                />
              ),
            },
            {
              id: "roles",
              label: "Assigned roles",
              span: "l",
              control: (
                <div className="flex w-full items-center gap-3">
                  <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto">
                    {previewRoles.map((roleId, i) => {
                      const role = ROLE_DEFS.find((r) => r.id === roleId);
                      if (!role) return null;
                      return (
                        <RoleCard
                          key={roleId}
                          role={role}
                          playerIndex={i}
                          variant="compact"
                          width={72}
                        />
                      );
                    })}
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleShuffle}>
                    Shuffle
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </SetupSection>
    </SetupBriefing>
  );
}
