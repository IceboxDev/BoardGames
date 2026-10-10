import type { HintId } from "@boardgames/core/protocol";
import { useSearchParams } from "react-router-dom";
import { DemoDay, lockedNight } from "../components/onboarding/demo-cells";
import { OnboardingDeck } from "../components/onboarding/OnboardingDeck";
import { HINT_COPY, hintTarget } from "../components/onboarding/OnboardingHints";
import { Button, Coachmark } from "../components/ui";

// Dev-only: the welcome tour and the first-use hints without an account.
//   /dev/onboarding-preview?card=N        — the deck open at card N (1-based)
//   /dev/onboarding-preview?hint=<id>     — one hint over a mock calendar bar

export default function OnboardingPreview() {
  const [params] = useSearchParams();
  const hint = params.get("hint") as HintId | null;
  const card = Math.max(1, Number(params.get("card") ?? "1")) - 1;
  if (hint && hint in HINT_COPY) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-surface-950 p-4">
        <div className="mx-auto grid grid-cols-3 gap-2 pt-24">
          <DemoDay day={17} />
          <span data-tour={hint === "night-open" ? "night-open" : undefined}>
            <DemoDay day={18} night={lockedNight()} onClick={() => {}} />
          </span>
          <DemoDay day={19} value="can" />
        </div>
        <div className="flex gap-2 border-t border-line pt-3">
          <Button
            variant="primary"
            data-tour={hint === "night-open" ? undefined : hint}
            className="flex-1"
          >
            Change my availability
          </Button>
        </div>
        <Coachmark target={hintTarget(hint)} title={HINT_COPY[hint].title} onDismiss={() => {}}>
          {HINT_COPY[hint].body}
        </Coachmark>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-surface-950">
      <OnboardingDeck firstName="Ada" startAt={card} onClose={() => {}} onStart={() => {}} />
    </div>
  );
}
