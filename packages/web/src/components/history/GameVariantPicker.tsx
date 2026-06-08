import type { MatchOutcome } from "@boardgames/core/history/types";
import {
  type GameVariantConfig,
  joinMultiVariant,
  parseMultiVariant,
  variantConfigForSlug,
} from "../../games/match-variants";
import { Chip } from "../ui/Chip";
import { applyScenario } from "./outcome";

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
  // Fixed configs (single hardwired ruleset, e.g. Bandit "Standard") are
  // displayed as a subtitle in MatchCard, not picked here.
  if (config.fixed) return null;

  // one-vs-many is the only outcome kind without a `scenario` field; bail out
  // there to avoid writing an extra key the wire schema would reject.
  if (outcome.kind === "one-vs-many") return null;
  const stored = outcome.scenario;

  function setScenario(next: string | undefined) {
    onChange(applyScenario(outcome, next));
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-secondary">
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
          <Chip
            key={opt.value}
            pressed={active}
            tone="accent"
            variant="outlined"
            size="sm"
            onClick={() => onChange(active ? undefined : opt.value)}
            icon={
              opt.icon ? (
                <span aria-hidden="true" className="text-sm leading-none">
                  {opt.icon}
                </span>
              ) : undefined
            }
          >
            {opt.label}
          </Chip>
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
          <Chip
            key={opt.value}
            pressed={active}
            tone="accent"
            variant="outlined"
            size="sm"
            onClick={() => toggle(opt.value)}
            icon={
              opt.icon ? (
                <span aria-hidden="true" className="text-sm leading-none">
                  {opt.icon}
                </span>
              ) : undefined
            }
          >
            {opt.label}
          </Chip>
        );
      })}
    </div>
  );
}
