import { codenamesManifest } from "@boardgames/core/games/codenames/manifest";
import { LANGUAGE_LABELS } from "@boardgames/core/games/codenames/words/index";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { SegmentedControl } from "../../../components/ui";
import { type TableOptions, tableOptionFields } from "../table";

export type SoloRole = "spymaster" | "operative";

export interface CodenamesSetup extends TableOptions {
  role: SoloRole;
  players: number;
  modelId: string;
}

const ROLE_NOTE: Record<SoloRole, string> = {
  operative: "You guess your AI spymaster's clues.",
  spymaster: "You give clues to your AI operatives.",
};

const timers = (o: TableOptions) =>
  o.clueTimerSec || o.guessTimerSec
    ? `clue ${o.clueTimerSec || "∞"}s · guess ${o.guessTimerSec || "∞"}s`
    : "no timers";

// Solo: you play for Red — as its spymaster (an AI operative guesses) or as
// its operative (an AI spymaster clues for you) — against an all-AI Blue team.
// Always the four-seat table: extra AI operatives would only add seats to
// watch, never a decision for you (a bigger table is a room's choice).
export default function SetupScreen({ onStart }: { onStart: (setup: CodenamesSetup) => void }) {
  const [role, setRole] = useState<SoloRole>("operative");
  const [options, setOptions] = useState<TableOptions>({
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
  });

  return (
    <PvAISetupScreen
      title="Codenames"
      manifest={codenamesManifest}
      playerCounts={[4]}
      eyebrow="Solo briefing · Red team"
      fileWord="File"
      stamp="Assigned"
      startLabel="Begin mission"
      summary={({ strategy }) =>
        `Red ${role} · 3 × ${strategy?.label ?? ""} · ${LANGUAGE_LABELS[options.language]} · ${timers(options)}`
      }
      onStart={(players, modelId) => onStart({ ...options, role, players, modelId })}
      options={[
        {
          id: "role",
          label: "Your seat",
          span: "s",
          note: ROLE_NOTE[role],
          control: (
            <SegmentedControl
              options={[
                { value: "operative", label: "Operative" },
                { value: "spymaster", label: "Spymaster" },
              ]}
              value={role}
              onChange={setRole}
              selectionMode="toggle"
              size="sm"
            />
          ),
        },
        ...tableOptionFields(options, setOptions),
      ]}
    />
  );
}
