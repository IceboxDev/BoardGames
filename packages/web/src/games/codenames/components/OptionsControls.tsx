import { TIMER_OPTIONS } from "@boardgames/core/games/codenames/manifest";
import {
  LANGUAGE_LABELS,
  LANGUAGES,
  type Language,
} from "@boardgames/core/games/codenames/words/index";
import { MicroLabel, SegmentedControl, Select } from "../../../components/ui";

// The table options both setup screens and both lobbies share: word set and
// the two optional timers.

export interface TableOptions {
  language: Language;
  clueTimerSec: number;
  guessTimerSec: number;
}

function timerLabel(sec: number): string {
  return sec === 0
    ? "No limit"
    : `${sec / 60 >= 1 && sec % 60 === 0 ? `${sec / 60} min` : `${sec}s`}`;
}

export function OptionsControls({
  value,
  onChange,
  disabled = false,
}: {
  value: TableOptions;
  onChange: (next: TableOptions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <MicroLabel>Words</MicroLabel>
        <SegmentedControl
          options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
          value={value.language}
          onChange={(language) => !disabled && onChange({ ...value, language })}
          selectionMode="toggle"
          size="sm"
        />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {(
          [
            ["clueTimerSec", "Clue timer"],
            ["guessTimerSec", "Guess timer"],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex flex-col items-center gap-1">
            <MicroLabel>{label}</MicroLabel>
            <Select
              size="sm"
              value={String(value[field])}
              disabled={disabled}
              aria-label={label}
              onChange={(e) => onChange({ ...value, [field]: Number(e.target.value) })}
            >
              {TIMER_OPTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {timerLabel(sec)}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
