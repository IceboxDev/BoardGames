import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";
import { evenness } from "../../lib/teams";
import { Badge } from "../ui";

// A balanced deal's win chances as one bar split in the teams' colours — the
// question the table actually asks ("is this fair?") answered at a glance,
// with the percentages underneath and a one-word verdict.

type Props = {
  chances: readonly number[];
  /** Fill class per team (the team card's dot colour). */
  fills: readonly string[];
  gameTitle: string | null;
};

const VERDICT = {
  even: { label: "Dead even", tone: "emerald" },
  close: { label: "Close", tone: "amber" },
  uneven: { label: "Lopsided", tone: "rose" },
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function TeamOdds({ chances, fills, gameTitle }: Props) {
  const reduceMotion = useReducedMotion();
  const verdict = VERDICT[evenness(chances)];
  const two = chances.length === 2;
  return (
    <figure className="flex flex-col gap-1.5 px-1">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-2xs text-fg-muted">
          Win chances{gameTitle ? ` at ${gameTitle}` : ""}
        </span>
        <Badge tone={verdict.tone} size="xs" shape="pill">
          {verdict.label}
        </Badge>
      </figcaption>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-fill"
        role="img"
        aria-label={chances.map((c, i) => `Team ${i + 1} ${pct(c)}`).join(", ")}
      >
        {chances.map((c, i) => (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: team slots are positional
            key={i}
            className={cn("h-full", fills[i % fills.length])}
            initial={false}
            animate={{ width: `${c * 100}%` }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 26 }
            }
          />
        ))}
      </div>
      <div
        className={cn("flex text-2xs tabular-nums", two ? "justify-between" : "flex-wrap gap-x-3")}
      >
        {chances.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: team slots are positional
          <span key={i} className="flex items-center gap-1 text-fg-secondary">
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full", fills[i % fills.length])}
            />
            Team {i + 1}
            <span className="font-semibold text-fg-strong">{pct(c)}</span>
          </span>
        ))}
      </div>
    </figure>
  );
}
