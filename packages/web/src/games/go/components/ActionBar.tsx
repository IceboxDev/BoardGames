import type { GoAction, GoPlayerView } from "@boardgames/core/games/go/view";
import { GameActionBar } from "../../../components/game-layout";
import { Button, useConfirm } from "../../../components/ui";
import { findAction } from "../logic/actions";

interface Props {
  readonly view: GoPlayerView;
  readonly legal: readonly GoAction[];
  readonly vsAi: boolean;
  readonly send: (action: GoAction) => void;
}

/**
 * The bar under the board. Buttons and nothing else: whose move it is shows in
 * the player rail; what a button does lives in its tooltip.
 */
export default function ActionBar({ view, legal, vsAi, send }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const pass = findAction(legal, "pass");
  const undo = findAction(legal, "undo");
  const allow = findAction(legal, "undo-accept");
  const refuse = findAction(legal, "undo-decline");
  const accept = findAction(legal, "accept-score");
  const resume = findAction(legal, "resume");
  const resign = findAction(legal, "resign");

  const onResign = async () => {
    if (!resign) return;
    const ok = await confirm({
      title: "Resign this game?",
      description: "Your opponent wins by resignation.",
      confirmLabel: "Resign",
    });
    if (ok) send(resign);
  };

  return (
    <GameActionBar
      start={
        undo && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => send(undo)}
            title={
              vsAi
                ? "Take back your last move"
                : "Ask your opponent to let you take back your last move"
            }
          >
            ↶ {vsAi ? "Undo" : "Ask to undo"}
          </Button>
        )
      }
      end={
        resign && (
          <Button size="xs" variant="ghost" onClick={onResign} title="Concede the game">
            Resign
          </Button>
        )
      }
    >
      {allow && refuse && (
        <>
          <Button
            size="xs"
            variant="primary"
            onClick={() => send(allow)}
            title="Let your opponent take back their last move"
          >
            Allow undo
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => send(refuse)}
            title="Keep the move on the board"
          >
            Refuse
          </Button>
        </>
      )}
      {pass && (
        <Button
          size="xs"
          variant={view.moves.at(-1)?.point === null ? "primary" : "secondary"}
          onClick={() => send(pass)}
          title={
            view.moves.at(-1)?.point === null
              ? "Your opponent passed — passing too ends the game and starts counting"
              : "Pass your turn (two passes in a row end the game)"
          }
        >
          Pass
        </Button>
      )}
      {accept && (
        <Button
          size="xs"
          variant="primary"
          onClick={() => send(accept)}
          title="Agree to the marked dead stones and count"
        >
          Accept score
        </Button>
      )}
      {resume && (
        <Button
          size="xs"
          variant="secondary"
          onClick={() => send(resume)}
          title={
            view.scoring?.locked
              ? "Keep playing — every stone now counts as alive, so capture what you think is dead"
              : "Disagree? Resume play and settle it on the board"
          }
        >
          Resume play
        </Button>
      )}
      {confirmDialog}
    </GameActionBar>
  );
}
