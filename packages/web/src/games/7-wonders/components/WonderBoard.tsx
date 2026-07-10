import type { SevenWondersPlayerBoardView } from "@boardgames/core/games/7-wonders/machine";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import { costText, effectLabel, RESOURCE_GLYPH } from "../card-utils";

interface WonderBoardProps {
  player: SevenWondersPlayerBoardView;
  /** Compact rendering for opponent panels. */
  size?: "sm" | "md";
}

/** Wonder name, initial resource and stage track with built/unbuilt states. */
export default function WonderBoard({ player, size = "md" }: WonderBoardProps) {
  const def = getWonderDef(player.wonderId);
  const side = def.sides[player.side];
  const compact = size === "sm";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={`font-semibold text-fg-primary ${compact ? "text-2xs" : "text-sm"}`}>
          {def.name}
        </span>
        <span className="rounded bg-surface-700 px-1 text-4xs font-bold text-fg-secondary">
          {player.side}
        </span>
        <span className={compact ? "text-2xs" : "text-sm"}>
          {RESOURCE_GLYPH[side.initialResource]}
        </span>
      </div>
      <div className="flex gap-1">
        {side.stages.map((stage, i) => {
          const built = i < player.stagesBuilt;
          // Cost + effects uniquely identify a stage on every base-game side.
          const stageKey = `${costText(stage.cost)}|${stage.effects.map(effectLabel).join(",")}`;
          return (
            <div
              key={stageKey}
              className={`flex-1 rounded border px-1 py-0.5 ${
                built ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-surface-800/60"
              }`}
              title={stage.effects.map(effectLabel).join(", ")}
            >
              <p className={`leading-tight text-fg-secondary ${compact ? "text-4xs" : "text-3xs"}`}>
                {costText(stage.cost)}
              </p>
              <p
                className={`leading-tight ${compact ? "text-4xs" : "text-2xs"} ${
                  built ? "text-amber-200" : "text-fg-primary"
                }`}
              >
                {stage.effects.map(effectLabel).join(" · ")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
