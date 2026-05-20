import type { MatchOutcome } from "@boardgames/core/history/types";
import {
  type GameVariantConfig,
  joinMultiVariant,
  parseMultiVariant,
  variantConfigForSlug,
} from "../../games/match-variants";

type Props = {
  gameSlug: string | null;
  outcome: MatchOutcome;
  onChange: (next: MatchOutcome) => void;
};

/**
 * Renders the per-game variant picker (language, mode, expansions, etc.) when
 * the current game declares one. Writes the chosen label into
 * `outcome.scenario`, which is the same field MatchCard reads to render the
 * italic subtitle under the game name.
 *
 * Returns null when the slug has no variants configured — keeps callers from
 * having to special-case anything.
 */
export function GameVariantPicker({ gameSlug, outcome, onChange }: Props) {
  const config = variantConfigForSlug(gameSlug);
  if (!config) return null;

  // one-vs-many is the only outcome kind without a `scenario` field; bail out
  // there to avoid writing an extra key the wire schema would reject.
  if (outcome.kind === "one-vs-many") return null;
  const stored = outcome.scenario;

  function setScenario(next: string | undefined) {
    if (outcome.kind === "one-vs-many") return;
    const { scenario: _drop, ...rest } = outcome;
    onChange(
      next === undefined ? (rest as MatchOutcome) : ({ ...rest, scenario: next } as MatchOutcome),
    );
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {config.label}
      </div>
      {config.mode === "single" ? (
        <SinglePicker config={config} value={stored} onChange={setScenario} />
      ) : (
        <MultiPicker config={config} value={stored} onChange={setScenario} />
      )}
    </div>
  );
}

function SinglePicker({
  config,
  value,
  onChange,
}: {
  config: GameVariantConfig;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {config.options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? undefined : opt.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "border-accent-400/50 bg-accent-500/15 text-accent-100"
                : "border-white/10 bg-surface-900 text-gray-400 hover:border-white/20 hover:text-gray-200"
            }`}
          >
            {opt.icon && (
              <span aria-hidden="true" className="text-sm leading-none">
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MultiPicker({
  config,
  value,
  onChange,
}: {
  config: GameVariantConfig;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const selected = new Set(parseMultiVariant(value));
  function toggle(val: string) {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(joinMultiVariant([...next], config.options));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {config.options.map((opt) => {
        const active = selected.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "border-accent-400/50 bg-accent-500/15 text-accent-100"
                : "border-white/10 bg-surface-900 text-gray-400 hover:border-white/20 hover:text-gray-200"
            }`}
          >
            {opt.icon && (
              <span aria-hidden="true" className="text-sm leading-none">
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
