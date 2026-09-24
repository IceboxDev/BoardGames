import { useEffect, useRef } from "react";
import { GameDialogPanel } from "../../../../components/game-layout/GameDialogPanel";
import { Button } from "../../../../components/ui";

// The win is banked; the active seat decides whether to keep going for all
// twelve buildings. The run ends at the first lost building or an empty
// holder — the win itself can't be lost any more.

type Props = {
  isActive: boolean;
  canDecide: boolean;
  deciderName: string;
  won: number;
  deckRemaining: number;
  onDecide: (accept: boolean) => void;
};

export default function BakeryPanel({
  isActive,
  canDecide,
  deciderName,
  won,
  deckRemaining,
  onDecide,
}: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const show = isActive && canDecide;

  useEffect(() => {
    if (show) firstRef.current?.focus();
  }, [show]);

  return (
    <GameDialogPanel
      tone="success"
      center
      spacious
      title="Quiztopia is saved!"
      subtitle={`No building lost, ${won} of 12 won, ${deckRemaining} cards left — go for the whole bakery? The win stays banked either way.`}
    >
      {show ? (
        <div className="flex flex-wrap justify-center gap-2">
          <Button ref={firstRef} variant="solid" tone="emerald" onClick={() => onDecide(false)}>
            Take the win
          </Button>
          <Button variant="tinted" tone="amber" onClick={() => onDecide(true)}>
            Go for all 12
          </Button>
        </div>
      ) : (
        <p className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg-strong">{deciderName}</span> decides — take the win
          or go for all 12.
        </p>
      )}
    </GameDialogPanel>
  );
}
