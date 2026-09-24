import { GameDialogPanel } from "../../../../components/game-layout/GameDialogPanel";
import { PromptRow } from "../../../../components/game-layout/PromptRow";
import { Button } from "../../../../components/ui";

// Expert mode's two interruptions: the table has no active tip card left
// (discard a question card to get one back), and the Plenum — the second
// flip of a turn opens the floor to everyone bar the reader and a peeker.

type Props = {
  /** Question phase with every tip card face-down. */
  noTips: boolean;
  deckRemaining: number;
  canReactivate: boolean;
  onReactivate: () => void;
  plenum: boolean;
  activeName: string;
  /** Names of the seats who sit the Plenum out. */
  barredNames: readonly string[];
};

export default function ExpertPanels({
  noTips,
  deckRemaining,
  canReactivate,
  onReactivate,
  plenum,
  activeName,
  barredNames,
}: Props) {
  if (!noTips && !plenum) return null;
  return (
    <>
      {noTips && (
        <GameDialogPanel
          tone="warning"
          title="No tip cards left"
          subtitle="Every tip card is face-down. Discard a question card from the holder to reactivate one — the game gets a card shorter."
        >
          <Button
            variant="tinted"
            tone="amber"
            size="sm"
            disabled={!canReactivate}
            onClick={onReactivate}
          >
            Discard a question ({deckRemaining} left) to reactivate one
          </Button>
        </GameDialogPanel>
      )}
      {plenum && (
        <GameDialogPanel tone="interrupt">
          <PromptRow
            tone="waiting"
            pulse
            title="Plenum"
            message={`open discussion, ${activeName} decides`}
          >
            {barredNames.length > 0 && (
              <span className="text-2xs text-fg-muted">
                {barredNames.join(" and ")} {barredNames.length === 1 ? "sits" : "sit"} this one out
              </span>
            )}
          </PromptRow>
        </GameDialogPanel>
      )}
    </>
  );
}
