import { STANDARD_TOKENS, TOKEN_OPTIONS } from "@boardgames/core/games/codenames-duet/manifest";
import { MicroLabel, Select } from "../../../components/ui";

// The game's length in timer tokens — the solo setup's and a free room game's.

export const TOKENS_LABEL = "Turns (timer tokens)";

/** The select alone (the setup screen labels it in its options panel). */
export function TokenSelectControl({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      size="sm"
      value={String(value)}
      disabled={disabled}
      aria-label={TOKENS_LABEL}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {TOKEN_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
          {n === STANDARD_TOKENS ? " (standard)" : n < STANDARD_TOKENS ? " (harder)" : " (easier)"}
        </option>
      ))}
    </Select>
  );
}

export function TokenSelect(props: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <MicroLabel>{TOKENS_LABEL}</MicroLabel>
      <TokenSelectControl {...props} />
    </div>
  );
}
