import type { LogEntry } from "@boardgames/core/games/7-wonders/types";
import { AGE_LABEL } from "../card-utils";

interface MilitaryBannerProps {
  entry: Extract<LogEntry, { type: "military" }>;
  labelFor: (playerIndex: number) => string;
  onDismiss: () => void;
}

/** End-of-age conflict summary, shown once when the military log entry lands. */
export default function MilitaryBanner({ entry, labelFor, onDismiss }: MilitaryBannerProps) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: transient toast — the whole surface is the dismiss target
    <button
      type="button"
      onClick={onDismiss}
      className="fixed inset-x-0 top-16 z-40 mx-auto w-fit max-w-[90vw] cursor-pointer rounded-xl border border-rose-500/40 bg-surface-900/95 px-5 py-3 shadow-xl backdrop-blur"
    >
      <p className="mb-1 text-center text-sm font-bold text-rose-300">
        ⚔️ {AGE_LABEL[entry.age]} — War!
      </p>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-primary">
        {entry.outcomes.map((o) => {
          const sum = o.tokens.reduce((a, b) => a + b, 0);
          return (
            <span key={o.playerIndex}>
              {labelFor(o.playerIndex)}{" "}
              <span
                className={
                  sum > 0 ? "text-emerald-400" : sum < 0 ? "text-rose-400" : "text-fg-secondary"
                }
              >
                {sum > 0 ? `+${sum}` : sum}
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-center text-3xs italic text-fg-disabled">tap to dismiss</p>
    </button>
  );
}
