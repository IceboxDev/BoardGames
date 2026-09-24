import { useEffect, useRef } from "react";
import { GameDialogPanel } from "../../../../components/game-layout/GameDialogPanel";
import { PromptRow } from "../../../../components/game-layout/PromptRow";
import { Button, Kbd } from "../../../../components/ui";

// "Was that right?" — the active seat's verdict on the table's answer. The
// engine already knows the card's answer; this is the human call (surnames,
// slash alternatives, near-misses). Everyone else sees who is judging.

type Props = {
  isActive: boolean;
  canJudge: boolean;
  activeName: string;
  onJudge: (correct: boolean) => void;
};

export default function JudgePanel({ isActive, canJudge, activeName, onJudge }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const show = isActive && canJudge;

  useEffect(() => {
    if (show) firstRef.current?.focus();
  }, [show]);

  if (!show) {
    return <PromptRow tone="waiting" pulse title={`${activeName} is judging`} />;
  }

  return (
    <GameDialogPanel
      tone="warning"
      title="Was that right?"
      subtitle="Compare the table's answer with the card — a surname or any slash alternative counts."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          ref={firstRef}
          variant="solid"
          tone="emerald"
          size="md"
          onClick={() => onJudge(true)}
        >
          Correct <Kbd>Y</Kbd>
        </Button>
        <Button variant="tinted" tone="rose" size="md" onClick={() => onJudge(false)}>
          Wrong <Kbd>N</Kbd>
        </Button>
      </div>
    </GameDialogPanel>
  );
}
