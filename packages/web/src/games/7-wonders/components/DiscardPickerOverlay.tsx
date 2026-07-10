import type { SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { Button, Modal } from "../../../components/ui";
import CardFace from "./CardFace";

interface DiscardPickerOverlayProps {
  /** pick-discard legal actions (already de-duplicated by the engine). */
  pickActions: Extract<SevenWondersAction, { type: "pick-discard" }>[];
  onPick: (action: SevenWondersAction) => void;
  onSkip: () => void;
}

/** Halikarnassos: build one card from the discard pile for free, or pass. */
export default function DiscardPickerOverlay({
  pickActions,
  onPick,
  onSkip,
}: DiscardPickerOverlayProps) {
  return (
    <Modal
      onClose={onSkip}
      size="lg"
      title="Mausoleum of Halikarnassos"
      eyebrow="Build one discarded card for free"
    >
      <div className="flex flex-col gap-3 pt-2">
        {pickActions.length === 0 ? (
          <p className="text-sm text-fg-secondary">Nothing in the discard pile you can build.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {pickActions.map((action) => (
              <div key={action.cardId} className="aspect-[2/3]">
                <CardFace cardId={action.cardId} onClick={() => onPick(action)} />
              </div>
            ))}
          </div>
        )}
        <Button variant="secondary" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </Modal>
  );
}
