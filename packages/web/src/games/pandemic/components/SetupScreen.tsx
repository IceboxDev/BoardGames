import { shuffle } from "@boardgames/core/games/pandemic/deck";
import { createRng, randomSeed } from "@boardgames/core/games/pandemic/rng";
import { ROLE_DEFS } from "@boardgames/core/games/pandemic/roles";
import type { SetupConfig } from "@boardgames/core/games/pandemic/types";
import { useCallback, useState } from "react";
import { SectionLabel, SetupHeader, SetupLayout, ToggleGroup } from "../../../components/setup";
import RoleCard from "./RoleCard";

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

const DIFFICULTY_META = [
  {
    value: 4 as const,
    label: "Introductory",
    accent: "#22c55e",
    stars: 1,
    desc: "A gentler introduction",
  },
  {
    value: 5 as const,
    label: "Standard",
    accent: "#f59e0b",
    stars: 2,
    desc: "The intended challenge",
  },
  { value: 6 as const, label: "Heroic", accent: "#ef4444", stars: 3, desc: "Near-impossible odds" },
];

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

  const handleStart = useCallback(() => {
    onStart({ numPlayers, difficulty });
  }, [numPlayers, difficulty, onStart]);

  return (
    <SetupLayout>
      <SetupHeader
        title="Pandemic"
        subtitle="Cooperative disease-fighting board game. Cure four diseases before they overwhelm the world."
      />

      <div className="w-full max-w-5xl grid grid-cols-[1fr_auto] gap-12 items-start">
        {/* Left: setup controls */}
        <div className="space-y-6">
          <div>
            <SectionLabel>Players</SectionLabel>
            <ToggleGroup
              options={PLAYER_OPTIONS}
              value={numPlayers}
              onChange={handlePlayerChange}
              accentClass="bg-blue-600 text-white"
            />
          </div>

          <div>
            <SectionLabel>Difficulty</SectionLabel>
            <div className="space-y-2">
              {DIFFICULTY_META.map((d) => {
                const active = difficulty === d.value;
                return (
                  <button
                    type="button"
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={`group relative w-full flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-all duration-200 overflow-hidden ${
                      active
                        ? "border-white/20 bg-gray-800/80 shadow-lg"
                        : "border-gray-700/80 bg-gray-800/50 hover:bg-gray-800/80 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
                    }`}
                    style={{
                      borderLeftWidth: "3px",
                      borderLeftColor: d.accent,
                    }}
                  >
                    <div
                      className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: d.accent }}
                    />

                    {/* Epidemic count */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                      style={{ backgroundColor: `${d.accent}20`, color: d.accent }}
                    >
                      {d.value}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{d.label}</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((n) => (
                            <svg
                              key={n}
                              viewBox="0 0 20 20"
                              fill={n <= d.stars ? d.accent : "currentColor"}
                              className={`h-3 w-3 ${n <= d.stars ? "" : "text-gray-700"}`}
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ))}
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">{d.desc}</span>
                    </div>

                    {/* Epidemics label */}
                    <span className="text-xs text-gray-600 shrink-0">{d.value} epidemics</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleStart}
            className="rounded-xl bg-emerald-600 px-8 py-3 font-semibold text-white transition hover:bg-emerald-500"
          >
            Start Game
          </button>
        </div>

        {/* Right: role cards — fixed width so it doesn't shift with player count */}
        <div className="w-[676px]">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Assigned roles</SectionLabel>
            <button
              type="button"
              onClick={handleShuffle}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              Shuffle
            </button>
          </div>
          <div className="flex justify-center gap-3">
            {previewRoles.map((roleId, i) => {
              const role = ROLE_DEFS.find((r) => r.id === roleId);
              if (!role) return null;
              return (
                <RoleCard key={roleId} role={role} playerIndex={i} variant="full" width={160} />
              );
            })}
          </div>
        </div>
      </div>
    </SetupLayout>
  );
}
