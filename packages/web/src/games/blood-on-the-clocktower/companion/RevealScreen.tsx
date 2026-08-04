import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { beginNight } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useState } from "react";
import { Button, useConfirm } from "../../../components/ui";
import type { UpdateState } from "./Companion";
import { Panel, Screen } from "./common";
import { TYPE_LABEL, TYPE_TEXT, trueCharacterLabel } from "./labels";

/**
 * Pass-the-phone character reveal. Each player sees ONLY what their token
 * would show — the Drunk sees the Townsfolk they believe they are, never the
 * word "Drunk". After the last player, the Storyteller gets the true Grimoire
 * summary and starts the first night.
 */
export default function RevealScreen({
  state,
  update,
  onAbandon,
}: {
  state: CompanionState;
  update: UpdateState;
  onAbandon: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const done = index >= state.players.length;

  if (done) {
    return (
      <Screen>
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-white">Storyteller's Grimoire</h1>
          <p className="text-sm text-fg-secondary">
            All characters are out. This summary is for <b>your eyes only</b>.
          </p>
        </header>
        <Panel title="True characters" tone="danger">
          <ul className="flex flex-col gap-1">
            {state.players.map((p) => (
              <li key={p.seat} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-fg-primary">{p.name}</span>
                <span
                  className={`shrink-0 font-semibold ${TYPE_TEXT[CHARACTERS[p.character].type]}`}
                >
                  {trueCharacterLabel(p)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Button variant="primary" size="lg" block onClick={() => update(beginNight)}>
          Begin the first night
        </Button>
        {confirmDialog}
      </Screen>
    );
  }

  const player = state.players[index];
  // What the PLAYER is shown: the Drunk gets their believed Townsfolk.
  const shownId = player.believedCharacter ?? player.character;
  const shown = CHARACTERS[shownId];

  return (
    <Screen>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-white">
          Reveal {index + 1} / {state.players.length}
        </h1>
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            if (await confirm({ title: "Abandon this setup?", tone: "danger" })) onAbandon();
          }}
        >
          Abandon
        </Button>
      </header>

      {!revealed ? (
        <Panel tone="night" className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-fg-secondary">Pass the phone to</p>
          <p className="text-3xl font-bold text-white">{player.name}</p>
          <Button variant="primary" size="lg" block onClick={() => setRevealed(true)}>
            Tap to see your character
          </Button>
          <p className="text-xs text-fg-muted">Make sure nobody else can see the screen.</p>
        </Panel>
      ) : (
        <Panel tone="night" className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-xs font-bold uppercase tracking-pill text-fg-secondary">
            {player.name}, you are the
          </p>
          <p className={`text-3xl font-bold ${TYPE_TEXT[shown.type]}`}>{shown.name}</p>
          <p className="text-xs font-bold uppercase tracking-pill text-fg-muted">
            {TYPE_LABEL[shown.type]}
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-fg-primary">{shown.ability}</p>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              setRevealed(false);
              setIndex(index + 1);
            }}
          >
            Hide &amp; pass back
          </Button>
        </Panel>
      )}
      {confirmDialog}
    </Screen>
  );
}
