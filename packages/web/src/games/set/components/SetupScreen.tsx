import { TrophyIcon } from "../../../components/icons";
import { SetupHeader, SetupLayout } from "../../../components/setup";
import { Button } from "../../../components/ui/Button";
import { SelectableCard } from "../../../components/ui/SelectableCard";

interface SetupScreenProps {
  onStart: () => void;
  onViewHighScores?: () => void;
}

export default function SetupScreen({ onStart, onViewHighScores }: SetupScreenProps) {
  return (
    <SetupLayout>
      <SetupHeader
        title="Set"
        subtitle="Find groups of three cards where each attribute (shape, color, fill, count) is either all the same or all different across the three cards."
      />

      <p className="text-sm text-fg-muted mb-8">
        Cards are dealt one-by-one. Press{" "}
        <kbd className="rounded bg-surface-700 px-2 py-0.5 text-xs font-mono text-fg-secondary">
          Space
        </kbd>{" "}
        or the SET! button anytime you spot one — even mid-deal.
      </p>

      <Button variant="primary" size="lg" onClick={onStart} className="mb-4">
        Start Game
      </Button>

      {onViewHighScores && (
        <SelectableCard
          orientation="horizontal"
          tone="accent"
          icon={<TrophyIcon className="h-4 w-4" />}
          title="High Scores"
          onClick={onViewHighScores}
        />
      )}
    </SetupLayout>
  );
}
