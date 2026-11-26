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
      summary={({ playerCount, strategy }) =>
        `${playerCount} players · ${playerCount - 1} × ${strategy?.label ?? ""}${edifice ? " · Edifice" : ""}`
      }
      onStart={(playerCount, strategy) => onStart({ playerCount, strategy, edifice })}
      options={[
        {
          id: "edifice",
          label: "Expansion",
          span: "l",
          note: "Co-fund communal projects while building your Wonder for shared rewards — or a penalty if they fail.",
          control: (
            <span className="flex items-center gap-3">
              {artUrl("emblem-seven-wonders") && (
                <img
                  src={artUrl("emblem-seven-wonders")}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="h-9 w-9 select-none"
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
            </span>
          ),
        },
      ]}
    />
  );
}
