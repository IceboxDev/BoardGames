import type { AbilityScores } from "@boardgames/core/protocol";
import { ABILITY_KEYS } from "@boardgames/core/protocol";
import { ABILITY_ABBR, ABILITY_NAME } from "../../logic/abilities";
import { fmt, mod } from "../../logic/sheet-derived";

// ── AbilityGrid ──────────────────────────────────────────────────────────
//
// The six ability boxes. Three components each built their own version from
// their own `ABILITY_LABEL` map, and they disagreed on both the label casing
// and which number got the emphasis.
//
// Two honest variants remain, because they answer different questions:
//   emphasis="score"    the score is the headline, the modifier is the aside.
//                       The NPC card and the party card — "how strong is it?"
//   emphasis="modifier" the modifier is the headline, the score a pill beneath.
//                       The character sheet's ability rail — "what do I add?"
//
// `layout="rail"` is the sheet's vertical column on md+; everything else is a
// 3-up / 6-up responsive row.

type AbilityGridProps = {
  abilities: AbilityScores;
  emphasis?: "score" | "modifier";
  /** `abbr` = STR; `name` = Strength. */
  label?: "abbr" | "name";
  /** `rail` stacks into one column from md up (the character sheet). */
  layout?: "row" | "rail";
  /** Compact boxes for the dense party card. */
  size?: "sm" | "md";
  className?: string;
};

export function AbilityGrid({
  abilities,
  emphasis = "score",
  label = "abbr",
  layout = "row",
  size = "md",
  className = "",
}: AbilityGridProps) {
  const labels = label === "name" ? ABILITY_NAME : ABILITY_ABBR;
  const grid =
    layout === "rail"
      ? "grid grid-cols-3 gap-2 md:h-full md:grid-cols-1 md:grid-rows-6"
      : size === "sm"
        ? "grid grid-cols-6 gap-1.5"
        : "grid grid-cols-3 gap-2 sm:grid-cols-6";
  const box =
    size === "sm"
      ? "flex flex-col items-center rounded-lg border border-amber-400/20 bg-dnd-ink/70 py-1"
      : "flex flex-col items-center justify-center rounded-xl border border-amber-400/25 bg-dnd-ink/70 px-2 py-2";

  return (
    <div className={[grid, className].filter(Boolean).join(" ")}>
      {ABILITY_KEYS.map((key) => {
        const score = abilities[key];
        if (score === undefined) return null;
        const modifier = mod(score);
        return (
          <div key={key} className={box}>
            <span className="font-serif-body text-4xs font-bold uppercase tracking-eyebrow text-amber-300/70">
              {labels[key]}
            </span>
            {emphasis === "modifier" ? (
              <>
                <span className="font-fantasy text-2xl font-bold text-amber-100">
                  {fmt(modifier)}
                </span>
                <span className="rounded-full bg-black/40 px-2 text-2xs text-amber-200/60 ring-1 ring-amber-400/20">
                  {score}
                </span>
              </>
            ) : (
              <>
                {/* Full class literals — Tailwind cannot see a name assembled
                    at runtime (`text-amber-200/${n}`), so every variant is
                    spelled out, as in the shared Button primitive. */}
                <span
                  className={
                    size === "sm"
                      ? "font-fantasy text-sm font-bold leading-tight text-amber-100"
                      : "font-fantasy text-xl font-bold leading-tight text-amber-100"
                  }
                >
                  {score}
                </span>
                <span
                  className={
                    size === "sm" ? "text-3xs text-amber-200/50" : "text-2xs text-amber-200/60"
                  }
                >
                  {fmt(modifier)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
