import type { CardId, Payment } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import { Button, Modal } from "../../../components/ui";
import { paymentCost, paymentLabel } from "../card-utils";

interface PaymentModalProps {
  cardId: CardId;
  /** What the payment buys — shown in the title. */
  intent: "play" | "wonder";
  options: Payment[];
  onPick: (payment: Payment) => void;
  onClose: () => void;
}

/**
 * Shown when a build has more than one way to pay (chain vs coins, left vs
 * right neighbor splits, Olympia free build). Single-option builds never
 * open this — the board plays them directly.
 */
export default function PaymentModal({
  cardId,
  intent,
  options,
  onPick,
  onClose,
}: PaymentModalProps) {
  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={intent === "play" ? `Build ${cardIdName(cardId)}` : "Build wonder stage"}
      eyebrow="Choose payment"
    >
      <div className="flex flex-col gap-2 pt-2">
        {options.map((payment) => (
          <Button
            key={paymentLabel(payment)}
            variant="secondary"
            size="md"
            onClick={() => onPick(payment)}
            className="justify-between"
          >
            <span>{paymentLabel(payment)}</span>
            {paymentCost(payment) > 0 && (
              <span className="text-fg-secondary">-{paymentCost(payment)}🪙</span>
            )}
          </Button>
        ))}
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
