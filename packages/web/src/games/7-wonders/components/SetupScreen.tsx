import { sevenWondersManifest } from "@boardgames/core/games/7-wonders/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { Chip } from "../../../components/ui";
import { artUrl } from "../logic/art";
import SevenIcon from "./SevenIcon";

interface SetupScreenProps {
  onStart: (setup: { playerCount: number; strategy: string; edifice: boolean }) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [edifice, setEdifice] = useState(false);

  return (
    <PvAISetupScreen
      title="7 Wonders"
      manifest={sevenWondersManifest}
      onStart={(playerCount, strategy) => onStart({ playerCount, strategy, edifice })}
      extraControls={
        <div className="flex flex-col items-center gap-1.5">
          {artUrl("emblem-seven-wonders") && (
            <img
              src={artUrl("emblem-seven-wonders")}
              alt=""
              aria-hidden
              draggable={false}
              className="mb-2 h-24 w-24 select-none drop-shadow-[0_8px_18px_rgb(0_0_0/0.6)]"
            />
          )}
          <Chip
            pressed={edifice}
            tone="amber"
            variant="outlined"
            size="md"
            onClick={() => setEdifice((v) => !v)}
          >
            <span className="flex items-center gap-1.5">
              <SevenIcon name="edifice" className="h-5 w-5" />
              Edifice expansion{edifice ? " · on" : ""}
            </span>
          </Chip>
          <span className="max-w-xs text-center text-2xs text-fg-secondary">
            Co-fund communal projects while building your Wonder for shared rewards — or a penalty
            if they fail.
          </span>
        </div>
      }
    />
  );
}
