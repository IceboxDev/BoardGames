import type { SevenWondersPlayerBoardView } from "@boardgames/core/games/7-wonders/machine";
import { SCIENCE_GLYPH } from "../card-utils";
import TableauDisplay from "./TableauDisplay";
import WonderBoard from "./WonderBoard";

interface PlayerPanelProps {
  player: SevenWondersPlayerBoardView;
  label: string;
  /** "left" | "right" neighbor badge relative to the viewer, if any. */
  neighborSide?: "left" | "right";
  isSelecting: boolean;
}

/** Compact opponent board: wonder, wealth, war, science and built cards. */
export default function PlayerPanel({
  player,
  label,
  neighborSide,
  isSelecting,
}: PlayerPanelProps) {
  const militarySum = player.militaryTokens.reduce((a, b) => a + b, 0);

  return (
    <div className="flex min-w-44 flex-1 flex-col gap-1 rounded-lg border border-white/10 bg-surface-900/70 p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-fg-primary">{label}</span>
        <span className="flex items-center gap-1">
          {neighborSide && (
            <span className="rounded bg-surface-700 px-1 text-4xs text-fg-secondary">
              {neighborSide === "left" ? "← left" : "right →"}
            </span>
          )}
          {isSelecting &&
            (player.hasSelected ? (
              <span className="text-3xs text-emerald-400">✓ picked</span>
            ) : (
              <span className="text-3xs italic text-fg-disabled">thinking…</span>
            ))}
        </span>
      </div>
      <WonderBoard player={player} size="sm" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-fg-secondary">
        <span>🪙 {player.coins}</span>
        <span>🛡️ {player.shields}</span>
        <span className={militarySum < 0 ? "text-rose-400" : "text-emerald-400"}>
          ⚔️ {militarySum >= 0 ? `+${militarySum}` : militarySum}
        </span>
        {(Object.keys(SCIENCE_GLYPH) as Array<keyof typeof SCIENCE_GLYPH>).map((s) =>
          player.scienceCounts[s] > 0 ? (
            <span key={s}>
              {SCIENCE_GLYPH[s]}
              {player.scienceCounts[s]}
            </span>
          ) : null,
        )}
        {player.scienceWildcards > 0 && <span>❓{player.scienceWildcards}</span>}
      </div>
      <TableauDisplay tableau={player.tableau} size="sm" />
    </div>
  );
}
