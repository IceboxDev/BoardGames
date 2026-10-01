import type { MatchOutcome } from "@boardgames/core/history/types";
import {
  composeVariant,
  type GameVariantConfig,
  joinMultiVariant,
  parseComposedVariant,
  parseMultiVariant,
  type VariantOption,
  variantConfigForSlug,
} from "../../games/match-variants";
import { Chip } from "../ui/Chip";
import { GroupLabel } from "./forms/shared";
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

  const secondary = config.secondary;
  if (secondary) {
    // Two single-select axes (Trivial Pursuit's edition + language), each
    // re-composing its half of the one stored string.
    const { primary: first, secondary: second } = parseComposedVariant(stored, config);
    return (
      <div className="flex flex-col gap-2">
        <div>
          <div className="mb-1">
            <GroupLabel>{config.label}</GroupLabel>
          </div>
          <SinglePicker
            options={config.options}
            value={first}
            onChange={(next) => setScenario(composeVariant(next, second))}
          />
        </div>
        <div>
          <div className="mb-1">
            <GroupLabel>{secondary.label}</GroupLabel>
          </div>
          <SinglePicker
            options={secondary.options}
            value={second}
            onChange={(next) => setScenario(composeVariant(first, next))}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1">
        <GroupLabel>{config.label}</GroupLabel>
      </div>
      {config.mode === "single" ? (
        <SinglePicker options={config.options} value={stored} onChange={setScenario} />
      ) : (
        <MultiPicker config={config} value={stored} onChange={setScenario} />
      )}
    </div>
  );
}

function SinglePicker({
  options,
  value,
  onChange,
}: {
  options: readonly VariantOption[];
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
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
