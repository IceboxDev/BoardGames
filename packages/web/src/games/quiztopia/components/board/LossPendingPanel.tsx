import { useEffect, useRef } from "react";
import { GameDialogPanel } from "../../../../components/game-layout/GameDialogPanel";
import { Button } from "../../../../components/ui";

// One lost building too many, but Besetzung is face-up: the table may return
// a building and play on, or accept the loss. Any seat may do either.

type Props = {
  lost: number;
  canBesetzung: boolean;
  canAccept: boolean;
  onBesetzung: () => void;
  onAccept: () => void;
};

export default function LossPendingPanel({
  lost,
  canBesetzung,
  canAccept,
  onBesetzung,
  onAccept,
}: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <GameDialogPanel
      tone="danger"
      title="Quiztopia is falling"
      subtitle={`${lost} buildings have gone to the dark side. Besetzung is face-up — return one to keep playing, or accept the loss.`}
    >
      <div className="flex flex-wrap gap-2">
        {canBesetzung && (
          <Button ref={firstRef} variant="solid" tone="purple" onClick={onBesetzung}>
            Play Besetzung
          </Button>
        )}
        <Button
          ref={canBesetzung ? undefined : firstRef}
          variant="danger"
          disabled={!canAccept}
          onClick={onAccept}
        >
          Accept the loss
        </Button>
      </div>
    </GameDialogPanel>
  );
}
