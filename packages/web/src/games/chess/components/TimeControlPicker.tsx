import { TIME_CONTROL_PRESETS } from "@boardgames/core/games/chess/manifest";
import type { TimeControl } from "@boardgames/core/games/chess/schemas";
import { SelectableCard } from "../../../components/ui";

const sameControl = (a: TimeControl | null, b: TimeControl | null) =>
  a === b ||
  (a !== null && b !== null && a.initialMs === b.initialMs && a.incrementMs === b.incrementMs);

/** The time-control presets as a grid of cards: `3+2` over "Blitz". */
export function TimeControlPicker({
  value,
  onChange,
  disabled,
}: {
  value: TimeControl | null;
  onChange: (control: TimeControl | null) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Time control">
      {TIME_CONTROL_PRESETS.map((preset) => {
        const selected = sameControl(value, preset.control);
        return (
          <SelectableCard
            key={preset.id}
            selected={selected}
            onClick={() => onChange(preset.control)}
            disabled={disabled}
            padding="sm"
          >
            <span className="block text-center text-base font-bold text-fg-strong">
              {preset.control ? preset.label : "∞"}
            </span>
            <span className="block text-center text-xs text-fg-muted">{preset.category}</span>
          </SelectableCard>
        );
      })}
    </fieldset>
  );
}
