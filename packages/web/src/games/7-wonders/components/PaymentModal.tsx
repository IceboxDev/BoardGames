import type { CardId, Payment } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import { Button } from "../../../components/ui";
import { paymentTotal } from "../logic/affordability";
import { artUrl } from "../logic/art";
import CardArt from "./CardArt";
import ChoiceOverlay from "./ChoiceOverlay";
import SevenIcon from "./SevenIcon";

interface PaymentModalProps {
  cardId: CardId;
  /** What the payment buys — shown in the title. */
  intent: "play" | "wonder";
  /** Already sorted cheapest first. */
  options: Payment[];
  leftName: string;
  rightName: string;
  onPick: (payment: Payment) => void;
  onClose: () => void;
}

/**
 * Shown when a build has more than one way to pay: a chain or Olympia's free
 * build against coins, or the same goods bought from different neighbours.
 * One row per way, the coins going left and right drawn on either side.
 */
export default function PaymentModal({
  cardId,
  intent,
  options,
  leftName,
  rightName,
  onPick,
  onClose,
}: PaymentModalProps) {
  return (
    <ChoiceOverlay
      eyebrow="Choose how to pay"
      title={intent === "play" ? `Build ${cardIdName(cardId)}` : "Build your next wonder stage"}
      returnLabel="Back to paying"
      className="max-w-lg"
      footer={
        <Button variant="link" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="flex gap-4">
        <div className="w-24 shrink-0">
          <CardArt cardId={cardId} variant="stack" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {options.map((payment, i) => (
            <Button
              key={key(payment)}
              variant={i === 0 ? "tinted" : "secondary"}
              tone={i === 0 ? "emerald" : undefined}
              size="md"
              block
              autoFocus={i === 0}
              onClick={() => onPick(payment)}
              className="justify-between"
            >
              <PaymentRow payment={payment} leftName={leftName} rightName={rightName} />
            </Button>
          ))}
        </div>
      </div>
    </ChoiceOverlay>
  );
}

function key(p: Payment): string {
  return p.kind === "resources" ? `r:${p.left}:${p.right}` : p.kind;
}

function PaymentRow({
  payment,
  leftName,
  rightName,
}: {
  payment: Payment;
  leftName: string;
  rightName: string;
}) {
  if (payment.kind === "chain") {
    return (
      <span className="flex w-full items-center gap-2">
        <SevenIcon name="chain" className="h-5 w-5" />
        Free — chained
      </span>
    );
  }
  if (payment.kind === "free-build") {
    return (
      <span className="flex w-full items-center gap-2">
        <SevenIcon name="cards" className="h-5 w-5" />
        Free — Statue of Zeus
      </span>
    );
  }
  const total = paymentTotal(payment);
  if (total === 0) return <span>Free</span>;
  return (
    <span className="flex w-full items-center gap-2 text-sm">
      <Coins n={payment.left} />
      <span className="min-w-0 flex-1 truncate text-left text-xs text-fg-secondary">
        {payment.left > 0 ? `◂ ${leftName}` : ""}
        {payment.left > 0 && payment.right > 0 ? " · " : ""}
        {payment.right > 0 ? `${rightName} ▸` : ""}
      </span>
      <Coins n={payment.right} />
      <span className="ml-2 flex items-center gap-0.5 font-bold tabular-nums">
        −{total}
        <SevenIcon name="coin" className="h-4 w-4" />
      </span>
    </span>
  );
}

/** The coins going to one neighbour, as silver pieces. */
function Coins({ n }: { n: number }) {
  if (n === 0) return <span className="w-8" />;
  const silver = artUrl("coin-1");
  return (
    <span className="flex w-8 items-center gap-0.5 tabular-nums text-amber-200">
      {n}
      {silver ? (
        <img
          src={silver}
          alt=""
          aria-hidden
          draggable={false}
          className="h-4 w-4 select-none object-contain drop-shadow"
        />
      ) : (
        <SevenIcon name="coin" className="h-3.5 w-3.5" />
      )}
    </span>
  );
}
