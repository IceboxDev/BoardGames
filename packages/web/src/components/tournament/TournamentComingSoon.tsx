import { TrophyIcon } from "../icons";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

/**
 * Placeholder shown at `/play/:slug/tournament` for games that expose the
 * tournament button but don't have their AI `tournamentStrategies` wired up
 * yet. Keeps the button meaningful (a "coming soon" screen) instead of
 * silently bouncing back to the menu.
 */
export default function TournamentComingSoon({
  gameTitle,
  onBack,
}: {
  gameTitle: string;
  onBack: () => void;
}) {
  return (
    // `relative z-10` lifts the block above the fixed game background image
    // (same stacking fix as MatchResultsLayout).
    <div className="relative z-10 flex min-h-full flex-1 flex-col px-6 py-16">
      <EmptyState
        fillHeight
        tone="amber"
        icon={<TrophyIcon className="h-5 w-5" />}
        title="AI Tournament"
        titleAs="h2"
        description={`Tournament support for ${gameTitle} is coming soon — the AIs will face off to see which strategy wins more.`}
        action={
          <Button variant="secondary" size="sm" shape="pill" onClick={onBack}>
            Back to menu
          </Button>
        }
      />
    </div>
  );
}
