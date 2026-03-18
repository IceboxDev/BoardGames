import { useCallback, useState } from "react";
import { shuffle } from "../logic/deck";
import { ROLE_DEFS } from "../logic/roles";
import type { SetupConfig } from "../logic/types";

interface SetupScreenProps {
  onStart: (config: SetupConfig) => void;
}

const ALL_ROLE_IDS = ROLE_DEFS.map((r) => r.id);

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [numPlayers, setNumPlayers] = useState<2 | 3 | 4>(2);
  const [difficulty, setDifficulty] = useState<4 | 5 | 6>(4);
  const [previewRoles, setPreviewRoles] = useState(() => shuffle(ALL_ROLE_IDS).slice(0, 2));

  const handlePlayerChange = useCallback((n: 2 | 3 | 4) => {
    setNumPlayers(n);
    setPreviewRoles(shuffle(ALL_ROLE_IDS).slice(0, n));
  }, []);

  const handleShuffle = useCallback(() => {
    setPreviewRoles(shuffle(ALL_ROLE_IDS).slice(0, numPlayers));
  }, [numPlayers]);

  const handleStart = useCallback(() => {
    onStart({ numPlayers, difficulty });
  }, [numPlayers, difficulty, onStart]);

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-surface-950 p-4">
      <div className="w-full max-w-lg rounded-xl bg-surface-900 p-8 shadow-2xl">
        <h1 className="mb-6 text-center text-3xl font-bold text-white">Pandemic</h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Cooperative disease-fighting board game
        </p>

        {/* Player count */}
        <div className="mb-6">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-2 block text-sm font-medium text-gray-300">
              Number of Players (roles)
            </legend>
            <div className="flex gap-3">
              {([2, 3, 4] as const).map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => handlePlayerChange(n)}
                  className={`flex-1 rounded-lg py-3 text-lg font-bold transition-colors ${
                    numPlayers === n
                      ? "bg-blue-600 text-white"
                      : "bg-surface-800 text-gray-400 hover:bg-surface-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Difficulty */}
        <div className="mb-6">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-2 block text-sm font-medium text-gray-300">Difficulty</legend>
            <div className="flex gap-3">
              {(
                [
                  { val: 4, label: "Introductory" },
                  { val: 5, label: "Standard" },
                  { val: 6, label: "Heroic" },
                ] as const
              ).map(({ val, label }) => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setDifficulty(val)}
                  className={`flex-1 rounded-lg py-3 text-sm font-medium transition-colors ${
                    difficulty === val
                      ? "bg-red-700 text-white"
                      : "bg-surface-800 text-gray-400 hover:bg-surface-700"
                  }`}
                >
                  {label}
                  <div className="mt-1 text-xs opacity-60">{val} epidemics</div>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Role preview */}
        <div className="mb-6">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-2 flex items-center justify-between text-sm font-medium text-gray-300">
              <span>Assigned Roles</span>
              <button
                type="button"
                onClick={handleShuffle}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Shuffle
              </button>
            </legend>
            <div className="space-y-2">
              {previewRoles.map((roleId, i) => {
                const role = ROLE_DEFS.find((r) => r.id === roleId)!;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-800 p-3">
                    <div
                      className="h-6 w-6 rounded-full border-2 border-black"
                      style={{ backgroundColor: role.pawnColor }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">
                        Player {i + 1}: {role.name}
                      </div>
                      <div className="text-xs text-gray-500">{role.abilities[0]}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Start button */}
        <button
          type="button"
          onClick={handleStart}
          className="w-full rounded-xl bg-green-700 py-4 text-lg font-bold text-white transition-colors hover:bg-green-600"
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
