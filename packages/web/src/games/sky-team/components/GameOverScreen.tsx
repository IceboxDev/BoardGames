import type { SkyTeamResult } from "@boardgames/core/games/sky-team/types";
import { Button } from "../../../components/ui/Button";

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
  return (
    // `relative z-10` lifts this screen above the fixed `def.backgroundImage`
    // at `z-0` in `GameShellLayoutInner` (same painting-order issue that
    // hides `GameScreen` without a stacking context).
    <div className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <div className="text-6xl leading-none">{meta.tone === "win" ? "🛬" : "💥"}</div>
      <h1
        className={[
          "text-3xl font-bold",
          meta.tone === "win" ? "text-emerald-300" : "text-red-400",
        ].join(" ")}
      >
        {meta.headline}
      </h1>
      <p className="text-slate-300">{meta.sub}</p>

      {/* Final axis, gear, flaps, and airliners-remaining are all tautological
          on a win (always 0 / deployed / deployed / 0) and on a loss the
          headline already explains which of them failed. Showing them
          as stats was misleading — readers assumed they were variable when
          they aren't. Scenario / rounds / final approach tile / brakes
          deployed are the only fields that genuinely vary across successful
          landings. */}
      <div className="grid w-full grid-cols-2 gap-2 rounded-md border border-slate-700 bg-slate-900/60 p-4 text-left text-xs">
        <div>
          <div className="text-slate-400">Scenario</div>
          <div className="font-mono">{result.scenarioId}</div>
        </div>
        <div>
          <div className="text-slate-400">Rounds</div>
          <div className="font-mono">{result.rounds}</div>
        </div>
        <div>
          <div className="text-slate-400">Approach</div>
          <div className="font-mono">{result.finalApproach}</div>
        </div>
        <div>
          <div className="text-slate-400">Brakes deployed</div>
          <div className="font-mono">{result.brakesDeployed}/3</div>
        </div>
      </div>

      <div className="flex gap-2">
        {onPlayAgain ? (
          <Button
            variant="primary"
            size="md"
            onClick={onPlayAgain}
            className="!bg-emerald-600 hover:!bg-emerald-500 !shadow-emerald-500/20"
          >
            Play again
          </Button>
        ) : null}
        <Button variant="secondary" size="md" onClick={onBackToMenu}>
          Back to menu
        </Button>
      </div>
    </div>
  );
}
