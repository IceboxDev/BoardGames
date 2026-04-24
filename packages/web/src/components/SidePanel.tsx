import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Shared turn header — always at the top of the left column
// ---------------------------------------------------------------------------

interface TurnHeaderProps {
  turnCount: number;
  extra?: ReactNode;
}

function TurnHeader({ turnCount, extra }: TurnHeaderProps) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        Turn {turnCount}
      </span>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player list panel — Durak & Exploding Kittens
// ---------------------------------------------------------------------------

export interface PlayerEntry {
  index: number;
  label: string;
  handCount: number;
  alive?: boolean;
  isActive: boolean;
  role?: "attacker" | "defender";
}

interface PlayerListPanelProps {
  turnCount: number;
  players: PlayerEntry[];
  extra?: ReactNode;
}

const ROLE_STYLE = {
  attacker: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  defender: "bg-sky-500/15 text-sky-400 ring-sky-500/30",
} as const;

export function PlayerListPanel({ turnCount, players, extra }: PlayerListPanelProps) {
  const hasRoles = players.some((p) => p.role);

  return (
    <div className="relative flex h-full flex-col items-stretch px-2 py-2">
      <div className="absolute left-2 top-2">
        <TurnHeader turnCount={turnCount} extra={extra} />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {players.map((p) => (
          <div
            key={p.index}
            className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
              p.alive === false
                ? "bg-gray-800/50 text-gray-600 line-through"
                : p.isActive
                  ? "bg-indigo-900/60 text-white ring-1 ring-indigo-500"
                  : "bg-gray-800/60 text-gray-300"
            }`}
          >
            <span className="flex-1 truncate font-medium">{p.label}</span>

            {hasRoles && (
              <span className="w-7 shrink-0 text-center">
                {p.role && (
                  <span
                    className={`rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase leading-none ring-1 ring-inset ${ROLE_STYLE[p.role]}`}
                  >
                    {p.role === "attacker" ? "ATK" : "DEF"}
                  </span>
                )}
              </span>
            )}

            {p.alive !== false ? (
              <span className="shrink-0 rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none">
                {p.handCount}
              </span>
            ) : (
              <span className="shrink-0 text-[10px]">💀</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score grid panel — Lost Cities
// ---------------------------------------------------------------------------

export interface ExpeditionScoreEntry {
  color: string;
  hex: string;
  label: string;
  playerScore: number;
  opponentScore: number;
  playerStarted: boolean;
  opponentStarted: boolean;
}

interface ScoreGridPanelProps {
  turnCount: number;
  playerName?: string;
  opponentName?: string;
  expeditions: ExpeditionScoreEntry[];
  playerTotal: number;
  opponentTotal: number;
}

export function ScoreGridPanel({
  turnCount,
  playerName = "You",
  opponentName = "AI",
  expeditions,
  playerTotal,
  opponentTotal,
}: ScoreGridPanelProps) {
  return (
    <div className="relative flex h-full flex-col items-stretch px-2 py-2">
      <div className="absolute left-2 top-2">
        <TurnHeader turnCount={turnCount} />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-2">
        {/* Grid */}
        <div className="flex w-full flex-col gap-px overflow-hidden rounded-lg border border-gray-700/50 bg-gray-700/30 text-[10px]">
          {/* Header row */}
          <div className="grid grid-cols-[1rem_1fr_1fr] bg-gray-800/80 px-2 py-1 font-semibold uppercase tracking-wider text-gray-500">
            <span />
            <span className="text-center">{playerName}</span>
            <span className="text-center">{opponentName}</span>
          </div>

          {/* Expedition rows */}
          {expeditions.map((e) => (
            <div
              key={e.color}
              className="grid grid-cols-[1rem_1fr_1fr] items-center bg-gray-900/60 px-2 py-1"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: e.hex }}
                title={e.label}
              />
              <span
                className={`text-center font-bold tabular-nums ${
                  !e.playerStarted
                    ? "text-gray-600"
                    : e.playerScore >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                }`}
              >
                {e.playerStarted ? e.playerScore : "-"}
              </span>
              <span
                className={`text-center font-bold tabular-nums ${
                  !e.opponentStarted
                    ? "text-gray-600"
                    : e.opponentScore >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                }`}
              >
                {e.opponentStarted ? e.opponentScore : "-"}
              </span>
            </div>
          ))}

          {/* Total row */}
          <div className="grid grid-cols-[1rem_1fr_1fr] items-center bg-gray-800/80 px-2 py-1.5 font-bold">
            <span />
            <span className="text-center tabular-nums text-white">{playerTotal}</span>
            <span className="text-center tabular-nums text-white">{opponentTotal}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
