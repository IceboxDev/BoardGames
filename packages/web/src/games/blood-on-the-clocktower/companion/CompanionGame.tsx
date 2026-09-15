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
import { EyeIcon, EyeOffIcon, RedoIcon, UndoIcon } from "../../../components/icons";
import { Button, IconButton, SegmentedControl, useConfirm } from "../../../components/ui";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import type { HistoryActions } from "./Companion";
import { CharacterIcon, Panel, Screen } from "./common";
import DayPanel from "./DayPanel";
import GrimoirePanel from "./GrimoirePanel";
import LogPanel from "./LogPanel";
import { TYPE_TEXT, trueCharacterLabel } from "./labels";
import NightPanel from "./night/NightPanel";
import PortToHistoryModal from "./PortToHistoryModal";
import { PrivacyProvider } from "./privacy";
import { usePrivacy } from "./privacy-context";
import type { UpdateState } from "./store";
import { Hint } from "./ui";

type Tab = "phase" | "grimoire" | "log";

/** No history — for hosts (tests, previews) that render the game without the store. */
const NO_HISTORY: HistoryActions = {
  canUndo: false,
  canRedo: false,
  canBackToNight: false,
  undo: () => {},
  redo: () => {},
  backToNight: () => {},
};

/**
 * The running game: a phase tab (night wizard / day tracker), the Grimoire,
 * and the event log. Win-condition prompts surface as banners above the tabs —
 * the Storyteller always makes the final call.
 */
export default function CompanionGame({
  initialHandOver,
  ...props
}: {
  state: CompanionState;
  update: UpdateState;
  history?: HistoryActions;
  onAbandon: () => void;
  /** Test seam: start in hand-over mode instead of the persisted switch. */
  initialHandOver?: boolean;
}) {
  return (
    <PrivacyProvider initial={initialHandOver}>
      <CompanionGameBody {...props} />
    </PrivacyProvider>
  );
}

function CompanionGameBody({
  state,
  update,
  history = NO_HISTORY,
  onAbandon,
}: {
  state: CompanionState;
  update: UpdateState;
  history?: HistoryActions;
  onAbandon: () => void;
}) {
  const [tab, setTab] = useState<Tab>("phase");
  const [portOpen, setPortOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const { isAdmin } = useCurrentUser();
  const { handOver, setHandOver } = usePrivacy();

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
          <p className="text-3xl font-bold text-fg-strong">
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
            <Hint tone="emerald" align="center" className="text-sm">
              ✓ Recorded to match history
            </Hint>
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
        <h1 className="min-w-0 truncate text-lg font-bold text-fg-strong">{phaseLabel}</h1>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            icon={<UndoIcon />}
            aria-label={history.undoLabel ? `Undo: ${history.undoLabel}` : "Undo"}
            title={history.undoLabel ? `Undo: ${history.undoLabel}` : "Undo the last change"}
            variant="ghost"
            size="md"
            disabled={!history.canUndo || handOver}
            onClick={history.undo}
          />
          <IconButton
            icon={<RedoIcon />}
            aria-label="Redo"
            title="Redo"
            variant="ghost"
            size="md"
            disabled={!history.canRedo || handOver}
            onClick={history.redo}
          />
          <IconButton
            icon={handOver ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            aria-label={
              handOver ? "Show roles again (phone is back)" : "Hide roles to hand the phone over"
            }
            title={
              handOver
                ? "Roles hidden — tap when the phone is back in your hands"
                : "Hide every role and hint so a player can tap a name themselves"
            }
            variant="ghost"
            tone={handOver ? "amber" : "neutral"}
            size="md"
            pressed={handOver}
            onClick={() => setHandOver(!handOver)}
          />
          {!handOver && (
            <Button
              variant="ghost"
              size="xs"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Abandon this game?",
                    description: "The current game is deleted and you return to setup.",
                    variant: "danger",
                  })
                ) {
                  onAbandon();
                }
              }}
            >
              New game
            </Button>
          )}
        </div>
      </header>
      {handOver && (
        <Panel tone="gold">
          <p className="text-sm font-semibold text-fg-primary">
            Hand-over mode: roles, hints and the Grimoire are hidden. The player may tap names on
            this screen; tap the eye when the phone is back.
          </p>
        </Panel>
      )}

      <SegmentedControl<Tab>
        options={[
          { value: "phase", label: phaseLabel, tone: phase.kind === "night" ? "accent" : "amber" },
          { value: "grimoire", label: "Grimoire", tone: "rose" },
          { value: "log", label: "Log", tone: "sky" },
        ]}
        value={tab}
        onChange={setTab}
        shape="rounded"
        size="sm"
        fullWidth
        selectionMode="tabs"
        aria-label="Companion sections"
      />

      {/* Win prompts sit BELOW the tab bar so persistent navigation never
          jumps at the game's most stressful moment. */}
      {!handOver &&
        prompts.map((p) => (
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

      {tab === "phase" && phase.kind === "night" && <NightPanel state={state} update={update} />}
      {tab === "phase" && phase.kind === "day" && (
        <DayPanel state={state} update={update} history={history} />
      )}
      {tab === "grimoire" &&
        (handOver ? (
          <HiddenTab what="The Grimoire" />
        ) : (
          <GrimoirePanel state={state} update={update} />
        ))}
      {tab === "log" && (handOver ? <HiddenTab what="The log" /> : <LogPanel state={state} />)}
      {confirmDialog}
    </Screen>
  );
}

/** What the Grimoire and the log show while the phone is in a player's hands. */
function HiddenTab({ what }: { what: string }) {
  return (
    <Panel tone="danger">
      <p className="text-sm text-fg-secondary">
        {what} is hidden in hand-over mode. Tap the eye in the header once the phone is back with
        the Storyteller.
      </p>
    </Panel>
  );
}
