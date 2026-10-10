import { maxHandicap } from "@boardgames/core/games/go/handicap";
import { ControlGroup } from "../../../components/setup";
import { SegmentedControl } from "../../../components/ui";
import {
  effectiveKomi,
  type GoOptionsValue,
  TIME_PRESETS,
  type TimePreset,
} from "../logic/options";

const KOMI_CHOICES = ["auto", "0.5", "5.5", "6.5", "7.5"] as const;

interface Props {
  readonly value: GoOptionsValue;
  readonly onChange: (next: GoOptionsValue) => void;
}

/** Board size, handicap, komi and clock — shared by the solo setup and the room lobby. */
export default function GoOptions({ value, onChange }: Props) {
  const handicaps = [0, ...Array.from({ length: maxHandicap(value.size) - 1 }, (_, i) => i + 2)];
  const set = (patch: Partial<GoOptionsValue>) => {
    const next = { ...value, ...patch };
    // A smaller board may not take the handicap the bigger one did.
    onChange({ ...next, handicap: Math.min(next.handicap, maxHandicap(next.size)) });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ControlGroup label="Board">
        <SegmentedControl<string>
          options={[
            { value: "9", label: "9×9" },
            { value: "13", label: "13×13" },
            { value: "19", label: "19×19" },
          ]}
          value={String(value.size)}
          onChange={(v) => set({ size: Number(v) as GoOptionsValue["size"] })}
          size="sm"
          fullWidth
          aria-label="Board size"
        />
      </ControlGroup>
      <ControlGroup label="Handicap">
        <SegmentedControl<string>
          options={handicaps.map((h) => ({
            value: String(h),
            label: h === 0 ? "Even" : String(h),
          }))}
          value={String(value.handicap)}
          onChange={(v) => set({ handicap: Number(v) })}
          size="sm"
          fullWidth
          aria-label="Handicap stones"
        />
      </ControlGroup>
      <ControlGroup label={`Komi · ${effectiveKomi(value)}`}>
        <SegmentedControl<string>
          options={KOMI_CHOICES.map((k) => ({ value: k, label: k === "auto" ? "Auto" : k }))}
          value={value.komi === null ? "auto" : String(value.komi)}
          onChange={(v) => set({ komi: v === "auto" ? null : Number(v) })}
          size="sm"
          fullWidth
          aria-label="Komi"
        />
      </ControlGroup>
      <ControlGroup label="Clock">
        <SegmentedControl<TimePreset>
          options={(Object.keys(TIME_PRESETS) as TimePreset[]).map((id) => ({
            value: id,
            label: TIME_PRESETS[id].label,
          }))}
          value={value.time}
          onChange={(time) => set({ time })}
          size="sm"
          fullWidth
          aria-label="Time control"
        />
      </ControlGroup>
    </div>
  );
}
