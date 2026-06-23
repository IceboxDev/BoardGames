import type { SkyTeamResult } from "@boardgames/core/games/sky-team/types";
import { GameOverLayout } from "../../../components/game-over/GameOverLayout";

interface Props {
  result: SkyTeamResult;
  onPlayAgain?: () => void;
  onBackToMenu: () => void;
}

const OUTCOME_LABELS: Record<string, { headline: string; sub: string; tone: "win" | "lose" }> = {
  win: { headline: "Smooth landing!", sub: "Passengers burst into applause.", tone: "win" },
  "loss-spin": {
    headline: "Crash — axis spin",
    sub: "The plane went into a spin.",
    tone: "lose",
  },
  "loss-collision": {
    headline: "Crash — collision",
    sub: "You collided with another aircraft on approach.",
    tone: "lose",
  },
  "loss-overshoot": {
    headline: "Crash — overshot the airport",
    sub: "You couldn't slow the approach in time.",
    tone: "lose",
  },
  "loss-overrun": {
    headline: "Crash — runway overrun",
    sub: "Your speed exceeded the brake setting on landing.",
    tone: "lose",
  },
  "loss-undershoot": {
    headline: "Crash — undershoot",
    sub: "You ran out of altitude before reaching the runway.",
    tone: "lose",
  },
  "loss-mandatory": {
    headline: "Crash — controls left unset",
    sub: "Round ended without both axis and engine dice committed.",
    tone: "lose",
  },
  "loss-airliners-remain": {
    headline: "Crash — air traffic on approach",
    sub: "Airliners still on the approach corridor.",
    tone: "lose",
  },
  "loss-gear-or-flaps": {
    headline: "Crash — gear or flaps not fully deployed",
    sub: "Final approach with incomplete configuration.",
    tone: "lose",
  },
  "loss-axis-not-level": {
    headline: "Crash — axis not level",
    sub: "Touched down with the plane tilted.",
    tone: "lose",
  },
};

export default function GameOverScreen({ result, onPlayAgain, onBackToMenu }: Props) {
  const meta = OUTCOME_LABELS[result.outcome] ?? {
    headline: "Game over",
    sub: result.outcome,
    tone: "lose" as const,
  };
  const actions: { label: string; onClick: () => void; variant: "primary" | "secondary" }[] = [
    ...(onPlayAgain
      ? [{ label: "Play again", onClick: onPlayAgain, variant: "primary" as const }]
      : []),
    { label: "Back to menu", onClick: onBackToMenu, variant: "secondary" as const },
  ];

  return (
    // `relative z-10` lifts this screen above the fixed `def.backgroundImage`
    // at `z-0` in `GameShellLayoutInner` (same painting-order issue that hides
    // `GameScreen` without a stacking context). GameOverLayout owns the
    // emoji / headline / actions; only the Sky-Team-specific stats are local.
    <div className="relative z-10">
      <GameOverLayout
        emoji={meta.tone === "win" ? "🛬" : "💥"}
        headline={meta.headline}
        headlineColor={meta.tone === "win" ? "win" : "lose"}
        subtitle={meta.sub}
        actions={actions}
      >
        {/* Final axis, gear, flaps, and airliners-remaining are all tautological
            on a win (always 0 / deployed / deployed / 0) and on a loss the
            headline already explains which of them failed. Scenario / rounds /
            final approach tile / brakes deployed are the only fields that
            genuinely vary across successful landings. */}
        <div className="grid w-full grid-cols-2 gap-2 rounded-md border border-white/10 bg-surface-900/60 p-4 text-left text-xs">
          <div>
            <div className="text-fg-muted">Scenario</div>
            <div className="font-mono">{result.scenarioId}</div>
          </div>
          <div>
            <div className="text-fg-muted">Rounds</div>
            <div className="font-mono">{result.rounds}</div>
          </div>
          <div>
            <div className="text-fg-muted">Approach</div>
            <div className="font-mono">{result.finalApproach}</div>
          </div>
          <div>
            <div className="text-fg-muted">Brakes deployed</div>
            <div className="font-mono">{result.brakesDeployed}/3</div>
          </div>
        </div>
      </GameOverLayout>
    </div>
  );
}
