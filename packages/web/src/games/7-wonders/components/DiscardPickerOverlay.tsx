import type { SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import { Button } from "../../../components/ui";
import { defOf, TABLEAU_ORDER } from "../card-utils";
import { artBg } from "../logic/art";
import CardArt from "./CardArt";
import CardPreview from "./CardPreview";
import ChoiceOverlay from "./ChoiceOverlay";

interface DiscardPickerOverlayProps {
  /** pick-discard legal actions (already de-duplicated by the engine). */
  pickActions: Extract<SevenWondersAction, { type: "pick-discard" }>[];
  onPick: (action: SevenWondersAction) => void;
  onSkip: () => void;
}

/**
 * Halikarnassos: build one card from the discard pile for free, or pass —
 * over the board, which stays a peek away while you weigh the pile.
 */
export default function DiscardPickerOverlay({
  pickActions,
  onPick,
  onSkip,
}: DiscardPickerOverlayProps) {
  // Grouped by colour, in the city's order.
  const sorted = [...pickActions].sort(
    (a, b) =>
      TABLEAU_ORDER.indexOf(defOf(a.cardId).color) - TABLEAU_ORDER.indexOf(defOf(b.cardId).color),
  );
  return (
    <ChoiceOverlay
      eyebrow="Mausoleum of Halikarnassos"
      title="Build a discarded card for free"
      subtitle={`${pickActions.length} card${pickActions.length === 1 ? "" : "s"} in the pile you can build — hover one to read it.`}
      returnLabel="Back to the discard pile"
      className="max-w-5xl"
      footer={
        <Button variant="secondary" onClick={onSkip}>
          Build nothing
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-fg-secondary">Nothing in the discard pile you can build.</p>
      ) : (
        // The pile laid out on the architect's papyrus.
        <div
          className="grid grid-cols-4 gap-3 rounded-card-lg p-4 shadow-inner ring-1 ring-black/40 sm:grid-cols-6 lg:grid-cols-8"
          style={{
            backgroundImage: `radial-gradient(ellipse at 50% 50%, transparent 55%, rgb(60 40 15 / 0.35)), ${artBg("tex-papyrus")}`,
            backgroundSize: "cover, 420px",
          }}
        >
          {sorted.map((action) => (
            <CardPreview key={action.cardId} cardId={action.cardId}>
              <Button
                variant="plain"
                bleed
                onClick={() => onPick(action)}
                aria-label={`Build ${cardIdName(action.cardId)} for free`}
                className="h-auto transition-transform hover:-translate-y-1"
              >
                <CardArt cardId={action.cardId} variant="stack" />
              </Button>
            </CardPreview>
          ))}
        </div>
      )}
    </ChoiceOverlay>
  );
}
