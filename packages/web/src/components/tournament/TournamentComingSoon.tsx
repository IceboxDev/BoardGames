import { Button } from "../ui/Button";

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
    <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8" aria-hidden="true">
          <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 18.9V21H7v2h10v-2h-4v-2.1a5.01 5.01 0 0 0 3.61-2.96C19.08 13.63 21 11.55 21 9V7c0-1.1-.9-2-2-2zM5 9V7h2v3.82C5.84 10.4 5 9.3 5 9zm14 0c0 .3-.84 1.4-2 1.82V7h2v2z" />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">AI Tournament</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-400">
        Tournament support for {gameTitle} is coming soon — the AIs will face off to see which
        strategy wins more.
      </p>
      <Button variant="secondary" size="sm" shape="pill" onClick={onBack} className="mt-6">
        Back to menu
      </Button>
    </div>
  );
}
