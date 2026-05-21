import { buildPlayerView } from "@boardgames/core/games/sky-team/player-view";
import { createRng } from "@boardgames/core/games/sky-team/rng";
import { SCENARIO_YUL } from "@boardgames/core/games/sky-team/scenarios";
import { createGame } from "@boardgames/core/games/sky-team/setup";
import type { Die, DieValue, PlayerIndex, SlotId } from "@boardgames/core/games/sky-team/types";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import Cockpit from "../../games/sky-team/components/board/Cockpit";

function die(id: number, value: DieValue, owner: PlayerIndex): Die {
  return { id, color: owner === 0 ? "blue" : "orange", value, owner, source: "rolled" };
}

export default function SkyTeamLab() {
  const [selectedDieId, setSelectedDieId] = useState<number | null>(null);
  const [debugGrid, setDebugGrid] = useState(false);
  const [lastSlot, setLastSlot] = useState<SlotId | null>(null);

  const view = useMemo(() => {
    const state = createGame({ scenario: SCENARIO_YUL, seed: 1 }, createRng(1));
    state.phase = "placement";
    state.toPlace = 0;

    state.unplacedDice[0] = [die(1, 4, 0), die(2, 6, 0), die(3, 2, 0)];
    state.unplacedDice[1] = [die(11, 3, 1), die(12, 5, 1)];

    state.slots["pilot-engine"].die = die(20, 5, 0);
    state.slots["copilot-engine"].die = die(21, 3, 1);
    state.slots["pilot-axis"].die = die(22, 4, 0);
    state.slots["copilot-axis"].die = die(23, 4, 1);
    state.slots["landing-gear-1"].die = die(24, 1, 0);
    state.slots["landing-gear-1"].switchOn = true;
    state.slots["flaps-1"].die = die(25, 2, 1);
    state.slots["flaps-1"].switchOn = true;
    state.slots["brakes-2"].die = die(26, 2, 0);
    state.coffeeTokens = 2;
    state.axis.position = 1;

    return buildPlayerView(state, 0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "g" || e.key === "G") setDebugGrid((d) => !d);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="grid min-h-screen place-items-center p-4" style={{ background: "#08aeea" }}>
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <header className="text-white">
          <h1 className="text-xl font-bold">Sky Team — Cockpit Lab</h1>
          <p className="text-sm opacity-80">
            Mounts the production <code>&lt;Cockpit&gt;</code> with a mock player view. Geometry
            flows from <code>games/sky-team/components/board/geometry.ts</code>; no parallel
            coordinate system. Press <kbd className="rounded bg-white/20 px-1">G</kbd> for a 5%
            grid.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedDieId((id) => (id === 1 ? null : 1))}
            >
              Selected die: {selectedDieId == null ? "—" : `#${selectedDieId} (value 4)`}
            </Button>
            <span className="opacity-70">Last slot clicked: {lastSlot ?? "—"}</span>
          </div>
        </header>
        <div className="relative">
          <Cockpit
            view={view}
            selectedDieId={selectedDieId}
            coffeeAdjust={0}
            onSelectSlot={setLastSlot}
          />
          {debugGrid && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-50"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255, 0, 128, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 0, 128, 0.25) 1px, transparent 1px)",
                backgroundSize: "5% 5%",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
