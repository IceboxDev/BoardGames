import { type ComponentProps, useState } from "react";
import { Input } from "../ui/Input";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (next: number) => void;
};

/**
 * Numeric score field for the match-history forms. A plain `<input
 * type="number" value={score}>` bound to a number can never be empty: clearing
 * it parses to 0 and the 0 comes straight back, so typing "42" next to it
 * reads "420" or "042". Here a 0 shows as an empty field (placeholder "0"),
 * whatever is typed is kept as typed while it means the same number ("", "-",
 * "4."), and focusing the field selects its contents so typing replaces them.
 */
export function ScoreInput({ value, onValueChange, onFocus, onBlur, ...rest }: Props) {
  // The text being typed, kept only while it still parses to `value` — an
  // outside change (a reset, a derived total) shows the new number instead.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null && parseScore(draft) === value ? draft : formatScore(value);
  return (
    <Input
      type="number"
      inputMode="numeric"
      placeholder="0"
      {...rest}
      value={shown}
      onChange={(e) => {
        setDraft(e.target.value);
        onValueChange(parseScore(e.target.value));
      }}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

function parseScore(raw: string): number {
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
}

function formatScore(value: number): string {
  return value === 0 ? "" : String(value);
}
