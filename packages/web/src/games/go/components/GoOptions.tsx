import { maxHandicap } from "@boardgames/core/games/go/handicap";
import { ControlGroup, type SetupOption } from "../../../components/setup";
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

/** Board size, handicap, komi and clock as option fields — the solo setup lays them out. */
export function goOptionFields({ value, onChange }: Props): SetupOption[] {
  const handicaps = [0, ...Array.from({ length: maxHandicap(value.size) - 1 }, (_, i) => i + 2)];
  const set = (patch: Partial<GoOptionsValue>) => {
    const next = { ...value, ...patch };
    // A smaller board may not take the handicap the bigger one did.
    onChange({ ...next, handicap: Math.min(next.handicap, maxHandicap(next.size)) });
  };
  return [
    {
      id: "board",
      label: "Board",
      span: "s",
      control: (
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
      ),
    },
    {
      id: "handicap",
      label: "Handicap",
      span: "l",
      control: (
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
      ),
    },
    {
      id: "komi",
      label: `Komi · ${effectiveKomi(value)}`,
      span: "m",
      control: (
        <SegmentedControl<string>
          options={KOMI_CHOICES.map((k) => ({ value: k, label: k === "auto" ? "Auto" : k }))}
          value={value.komi === null ? "auto" : String(value.komi)}
          onChange={(v) => set({ komi: v === "auto" ? null : Number(v) })}
          size="sm"
          fullWidth
          aria-label="Komi"
        />
      ),
    },
    {
      id: "clock",
      label: "Clock",
      span: "l",
      control: (
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
      ),
    },
  ];
}

/** The same fields in labelled groups — the room lobby's layout. */
export default function GoOptions(props: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {goOptionFields(props).map((field) => (
        <ControlGroup key={field.id} label={String(field.label)}>
          {field.control}
        </ControlGroup>
      ))}
    </div>
  );
}
