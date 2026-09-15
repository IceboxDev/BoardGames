import type { ReactNode } from "react";
import { RADIUS_UI_LG } from "../../../../components/ui/radii";
import { type CoreTone, TONE_TEXT } from "../../../../components/ui/tones";
import { cn } from "../../../../lib/cn";
import { useHandOver } from "../privacy-context";

// The wizard talks to the Storyteller in short tinted lines. Their hue is
// the message's KIND, fixed here once so "amber means the Storyteller has a
// choice" holds on every screen:
//   amber   — the Storyteller's call / a warning (ability void, may register)
//   sky     — a rule the engine will enforce (protected, already dead)
//   rose    — a death or a loss on the line
//   emerald — recorded / done
//   purple  — travellers and the Goon
//   accent  — an instruction to act on
export type HintTone = CoreTone | "purple";

const TEXT: Record<HintTone, string> = { ...TONE_TEXT, purple: "text-purple-300" };

/** One tinted line of guidance. Storyteller-only: gone while the phone is handed over. */
export function Hint({
  tone = "amber",
  align,
  className,
  children,
}: {
  tone?: HintTone;
  align?: "center";
  className?: string;
  children: ReactNode;
}) {
  const handOver = useHandOver();
  if (handOver) return null;
  return (
    <p
      className={cn(
        "text-xs font-semibold",
        TEXT[tone],
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </p>
  );
}

const CALLOUT: Record<HintTone, string> = {
  amber: "border-amber-300/40 bg-amber-400/10 text-amber-200",
  sky: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  rose: "border-rose-400/30 bg-rose-950/40 text-rose-200",
  emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  purple: "border-purple-400/25 bg-purple-400/5 text-purple-300",
  accent: "border-accent-400/30 bg-accent-500/10 text-accent-200",
};

/**
 * A boxed hint — the same hues as `Hint`, framed, for a warning that must
 * not be skimmed past (a void ability, a star pass, the Mastermind's day).
 * Children may include controls; text inside inherits the tone.
 */
export function Callout({
  tone = "amber",
  className,
  children,
}: {
  tone?: HintTone;
  className?: string;
  children: ReactNode;
}) {
  const handOver = useHandOver();
  if (handOver) return null;
  return (
    <div
      className={cn(
        RADIUS_UI_LG,
        "flex flex-col gap-2 border p-2 text-xs font-semibold",
        CALLOUT[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The wizard's "this step already ran" line. */
export function StepDone({ children }: { children: ReactNode }) {
  return <Hint tone="emerald">{children}</Hint>;
}
