import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  beginMastermindDay,
  changeCharacter,
  endGame,
  nameAt,
  winPrompts,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useState } from "react";
import { Button, SegmentedControl, useConfirm } from "../../../components/ui";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import type { UpdateState } from "./Companion";
import { CharacterIcon, Panel, Screen } from "./common";
import DayPanel from "./DayPanel";
import GrimoirePanel from "./GrimoirePanel";
import LogPanel from "./LogPanel";
import { TYPE_TEXT, trueCharacterLabel } from "./labels";
import NightPanel from "./NightPanel";
import PortToHistoryModal from "./PortToHistoryModal";

type Tab = "phase" | "grimoire" | "log";

/**
 * The running game: a phase tab (night wizard / day tracker), the Grimoire,
 * and the event log. Win-condition prompts surface as banners above the tabs —
 * the Storyteller always makes the final call.
 */
export default function CompanionGame({
  state,
  update,
  onAbandon,
}: {
  state: CompanionState;
  update: UpdateState;
  onAbandon: () => void;
}) {
  const [tab, setTab] = useState<Tab>("phase");
  const [portOpen, setPortOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const { isAdmin } = useCurrentUser();

  const phase = state.phase;
  const phaseLabel =
    phase.kind === "night"
      ? `Night ${phase.night}`
      : phase.kind === "day"
        ? `Day ${phase.day}`
        : "Game over";

  if (phase.kind === "ended") {
    return (
      <Screen>
        <Panel
          tone={phase.winner === "good" ? "gold" : "danger"}
          className="flex flex-col items-center gap-2 py-8 text-center"
        >
          <p className="text-3xl font-bold text-white">
            {phase.winner === "good" ? "Good wins!" : "Evil wins!"}
          </p>
          <p className="text-sm text-fg-secondary">{phase.reason}</p>
        </Panel>
        <Panel title="The truth of Ravenswood Bluff">
          <ul className="flex flex-col gap-1">
            {state.players.map((p) => (
              <li key={p.seat} className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={`min-w-0 truncate ${p.alive ? "text-fg-primary" : "text-fg-muted line-through"}`}
                >
                  {p.name}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <CharacterIcon character={p.character} size="sm" />
                  <span className={`font-semibold ${TYPE_TEXT[CHARACTERS[p.character].type]}`}>
                    {trueCharacterLabel(p)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <LogPanel state={state} />
        {isAdmin &&
          (state.historyMatchId !== undefined ? (
            <p className="text-center text-sm font-semibold text-emerald-300">
              ✓ Recorded to match history
            </p>
          ) : (
            <Button variant="secondary" size="lg" block onClick={() => setPortOpen(true)}>
              Record to match history
            </Button>
          ))}
        <Button variant="primary" size="lg" block onClick={onAbandon}>
          Start a new game
        </Button>
        {portOpen && (
          <PortToHistoryModal state={state} update={update} onClose={() => setPortOpen(false)} />
        )}
      </Screen>
    );
  }

  const prompts = winPrompts(state);

  return (
    <Screen>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-white">{phaseLabel}</h1>
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            if (
              await confirm({
                title: "Abandon this game?",
                description: "The current game is deleted and you return to setup.",
                tone: "danger",
              })
            ) {
              onAbandon();
            }
          }}
        >
          New game
        </Button>
      </header>

      {prompts.map((p) => (
        <Panel key={p.kind} tone={p.kind === "evil-wins" ? "danger" : "gold"}>
          {p.kind === "scarlet-woman" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-fg-primary">
                The Demon is dead, but <b>{nameAt(state, p.seat)}</b> is the Scarlet Woman with 5+
                players alive — she becomes the Imp.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="danger"
                  block
                  onClick={() => update((s) => changeCharacter(s, p.seat, "imp"))}
                >
                  She becomes the Imp
                </Button>
                <Button
                  variant="secondary"
                  block
                  onClick={() => update((s) => endGame(s, "good", "the Demon is dead"))}
                >
                  Good wins anyway
                </Button>
              </div>
            </div>
          ) : p.kind === "mastermind" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-fg-primary">
                The Demon died by execution — but <b>{nameAt(state, p.seat)}</b> is the sober
                Mastermind. Say NOTHING: the game secretly continues for one more day. If a good
                player is then executed, evil wins; if an evil player (or nobody) is, good wins.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="danger" block onClick={() => update(beginMastermindDay)}>
                  Play one more day (Mastermind)
                </Button>
                <Button
                  variant="secondary"
                  block
                  onClick={() => update((s) => endGame(s, "good", "the Demon is dead"))}
                >
                  Good wins anyway
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-fg-primary">
                {p.kind === "good-wins" ? "Good wins" : "Evil wins"} — {p.reason}. Declare it?
              </p>
              <Button
                variant={p.kind === "good-wins" ? "primary" : "danger"}
                block
                onClick={() =>
                  update((s) => endGame(s, p.kind === "good-wins" ? "good" : "evil", p.reason))
                }
              >
                Declare {p.kind === "good-wins" ? "good" : "evil"} victory
              </Button>
            </div>
          )}
        </Panel>
      ))}

      <SegmentedControl<Tab>
        options={[
          { value: "phase", label: phaseLabel, tone: phase.kind === "night" ? "accent" : "amber" },
          { value: "grimoire", label: "Grimoire", tone: "rose" },
          { value: "log", label: "Log", tone: "sky" },
        ]}
        value={tab}
        onChange={setTab}
        shape="rect"
        size="sm"
        fullWidth
        selectionMode="tabs"
        aria-label="Companion sections"
      />

      {tab === "phase" && phase.kind === "night" && <NightPanel state={state} update={update} />}
      {tab === "phase" && phase.kind === "day" && <DayPanel state={state} update={update} />}
      {tab === "grimoire" && <GrimoirePanel state={state} update={update} />}
      {tab === "log" && <LogPanel state={state} />}
      {confirmDialog}
    </Screen>
  );
}
