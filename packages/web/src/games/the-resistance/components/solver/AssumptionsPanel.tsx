import {
  type Assumptions,
  defaultAssumptions,
  RULE_IDS,
  RULE_INFO,
  type RuleMode,
} from "@boardgames/core/games/the-resistance/solver/assumptions";
import { Badge, Button, SegmentedControl } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { pct } from "../../logic/solver";

interface AssumptionsPanelProps {
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
  blindSpies: boolean;
  /** Worlds each rule has eliminated so far. */
  eliminated?: Partial<Record<string, number>>;
}

const MODES: { value: RuleMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "soft", label: "Lean" },
  { value: "hard", label: "Always" },
];

const STRENGTHS = [0.2, 0.5, 0.8] as const;
const FAIL_RATES = [0.5, 0.75, 0.9] as const;

/**
 * The model's knobs. "Always" eliminates any world that breaks the rule;
 * "Lean" only tilts the odds. The game's own rule — the Resistance only ever
 * plays Success — is not a knob.
 */
export function AssumptionsPanel({
  assumptions,
  onChange,
  blindSpies,
  eliminated = {},
}: AssumptionsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-fg-primary">Spy fail rate</span>
        <span className="text-2xs text-fg-muted">
          How often a spy plays Fail when no rule below says otherwise.
        </span>
        <SegmentedControl<number>
          size="xs"
          shape="pill"
          value={assumptions.baseFailRate}
          onChange={(baseFailRate) => onChange({ ...assumptions, baseFailRate })}
          options={FAIL_RATES.map((r) => ({ value: r, label: pct(r) }))}
        />
      </div>

      <ul className="flex flex-col gap-3">
        {RULE_IDS.map((id) => {
          const info = RULE_INFO[id];
          const setting = assumptions.rules[id];
          const inert = blindSpies && info.needsSpiesKnown;
          const killed = eliminated[id] ?? 0;
          return (
            <li key={id} className={cn("flex flex-col gap-1.5", inert && "opacity-50")}>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-fg-primary">{info.label}</span>
                {info.source === "table" && (
                  <Badge size="xs" tone="accent">
                    Yours
                  </Badge>
                )}
                {killed > 0 && (
                  <Badge size="xs" tone="amber">
                    −{killed} worlds
                  </Badge>
                )}
              </span>
              <span className="text-2xs text-fg-muted">
                {inert ? "Off under Blind Spies — spies can't know each other. " : ""}
                {info.description}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl<RuleMode>
                  size="xs"
                  shape="pill"
                  disabled={inert}
                  value={setting.mode}
                  onChange={(mode) =>
                    onChange({
                      ...assumptions,
                      rules: { ...assumptions.rules, [id]: { ...setting, mode } },
                    })
                  }
                  options={MODES}
                />
                {setting.mode === "soft" && !inert && (
                  <SegmentedControl<number>
                    size="xs"
                    shape="pill"
                    value={nearest(setting.strength)}
                    onChange={(strength) =>
                      onChange({
                        ...assumptions,
                        rules: { ...assumptions.rules, [id]: { ...setting, strength } },
                      })
                    }
                    options={STRENGTHS.map((s) => ({
                      value: s,
                      label: s === 0.2 ? "Weak" : s === 0.5 ? "Medium" : "Strong",
                    }))}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" size="xs" onClick={() => onChange(defaultAssumptions())}>
        Reset to defaults
      </Button>
    </div>
  );
}

function nearest(strength: number): number {
  return STRENGTHS.reduce((best, s) =>
    Math.abs(s - strength) < Math.abs(best - strength) ? s : best,
  );
}
