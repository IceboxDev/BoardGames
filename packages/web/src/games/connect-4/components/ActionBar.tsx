import type { Action } from "@boardgames/core/games/connect-4/types";
import type { ReactNode } from "react";
import { SoundToggle } from "../../../components/game-layout";
import { FlagIcon, GaugeIcon, LightbulbIcon } from "../../../components/icons";
import { Button, Surface, useConfirm } from "../../../components/ui";
import type { Assists } from "../logic/useAssists";

interface Props {
  legal: readonly Action[];
  send: (action: Action) => void;
  assists: Assists;
  muted: boolean;
  onToggleMute: () => void;
  extra?: ReactNode;
}

/**
 * The bar under the board. Buttons only — what you can do right now; whose
 * turn it is shows in the players rail and on the board, guidance in tooltips.
 */
export function ActionBar({ legal, send, assists, muted, onToggleMute, extra }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const resign = legal.find((a) => a.type === "resign");
  const next = legal.find((a) => a.type === "continue");

  const onResign = async () => {
    if (!resign) return;
    const ok = await confirm({
      title: "Resign this game?",
      description: "Your opponent wins this game.",
      confirmLabel: "Resign",
    });
    if (ok) send(resign);
  };

  return (
    <Surface
      variant="raised"
      padding="sm"
      className="grid min-h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2"
    >
      <div className="flex items-center gap-1">
        <SoundToggle muted={muted} onToggle={onToggleMute} />
        {assists.evalAvailable && (
          <Button
            size="xs"
            variant="ghost"
            onClick={assists.toggleEval}
            aria-pressed={assists.evalOn}
            title="Show the solver's verdict on the position (E)"
          >
            <GaugeIcon className="h-3.5 w-3.5" />
            {assists.evalOn ? "Eval on" : "Eval"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {next && (
          <Button
            size="xs"
            variant="primary"
            onClick={() => send(next)}
            title="Start the next game now"
          >
            Next game
          </Button>
        )}
        {assists.requestHint && (
          <Button
            size="xs"
            variant="tinted"
            tone="emerald"
            onClick={assists.requestHint}
            loading={assists.hintBusy}
            title="Light up the best column (H)"
          >
            <LightbulbIcon className="h-3.5 w-3.5" />
            Hint
          </Button>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {extra}
        {resign && (
          <Button size="xs" variant="ghost" onClick={onResign} title="Give up this game">
            <FlagIcon />
            Resign
          </Button>
        )}
      </div>
      {confirmDialog}
    </Surface>
  );
}
