import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { DiseaseColor, GameState } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";
import RoleCard from "./RoleCard";

interface GameOverScreenProps {
  state: GameState;
  onRestart: () => void;
  onMenu: () => void;
}

const DISEASE_CSS: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#555",
  red: "#ff3333",
};

const RESULT_MESSAGES: Record<string, { title: string; subtitle: string }> = {
  win: {
    title: "Victory!",
    subtitle: "All four diseases have been cured!",
  },
  loss_outbreaks: {
    title: "Defeat",
    subtitle: "Too many outbreaks occurred (8 outbreaks reached)",
  },
  loss_cubes: {
    title: "Defeat",
    subtitle: "A disease spread too far (ran out of cubes)",
  },
  loss_cards: {
    title: "Defeat",
    subtitle: "Ran out of time (player deck exhausted)",
  },
};

export default function GameOverScreen({ state, onRestart, onMenu }: GameOverScreenProps) {
  const result = state.result ?? "loss_outbreaks";
  const msg = RESULT_MESSAGES[result];
  const isWin = result === "win";

  const totalCubesOnBoard = Object.values(state.cityCubes).reduce(
    (total, cubes) => total + DISEASE_COLORS.reduce((s, c) => s + cubes[c], 0),
    0,
  );

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-surface-900 p-8 text-center shadow-2xl">
        <div className={`mb-4 text-5xl font-black ${isWin ? "text-green-400" : "text-red-500"}`}>
          {msg.title}
        </div>
        <p className="mb-8 text-gray-400">{msg.subtitle}</p>

        {/* Disease status */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          {DISEASE_COLORS.map((color) => {
            const status = state.diseaseStatus[color];
            return (
              <div key={color} className="rounded-lg bg-surface-800 p-3 text-center">
                <div
                  className="mx-auto mb-2 h-6 w-6 rounded-full"
                  style={{ backgroundColor: DISEASE_CSS[color] }}
                />
                <div className="text-xs font-medium capitalize text-white">{color}</div>
                <div
                  className={`text-xs ${
                    status === "eradicated"
                      ? "text-green-400"
                      : status === "cured"
                        ? "text-yellow-400"
                        : "text-gray-500"
                  }`}
                >
                  {status}
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-surface-800 p-3">
            <div className="text-2xl font-bold text-white">{state.turnNumber}</div>
            <div className="text-xs text-gray-500">Turns</div>
          </div>
          <div className="rounded-lg bg-surface-800 p-3">
            <div className="text-2xl font-bold text-white">{state.outbreakCount}</div>
            <div className="text-xs text-gray-500">Outbreaks</div>
          </div>
          <div className="rounded-lg bg-surface-800 p-3">
            <div className="text-2xl font-bold text-white">{totalCubesOnBoard}</div>
            <div className="text-xs text-gray-500">Cubes Left</div>
          </div>
        </div>

        {/* Players */}
        <div className="mb-6 flex justify-center gap-3">
          {state.players.map((p) => (
            <RoleCard
              key={p.id}
              role={getRoleDef(p.role)}
              playerIndex={p.id}
              variant="compact"
              width={80}
              height={110}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onMenu}
            className="flex-1 rounded-lg bg-surface-800 py-3 font-medium text-white transition-colors hover:bg-surface-700"
          >
            Back to Menu
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 rounded-lg bg-blue-700 py-3 font-medium text-white transition-colors hover:bg-blue-600"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
