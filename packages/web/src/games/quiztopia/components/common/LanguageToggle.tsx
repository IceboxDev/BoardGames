import type { QuizLanguage } from "@boardgames/core/protocol";
import { type CoreTone, SegmentedControl } from "../../../../components/ui";

// EN / DE / Both — the table game's question language. The room default
// seeds it; a reader flips it locally on their own screen.

type Props<T extends QuizLanguage | "en" | "de"> = {
  value: T;
  onChange: (next: T) => void;
  /** Offer the "Both" option (question + translation). Default true. */
  allowBoth?: boolean;
  tone?: CoreTone;
  size?: "xs" | "sm";
  disabled?: boolean;
};

export function LanguageToggle<T extends QuizLanguage>({
  value,
  onChange,
  allowBoth = true,
  tone = "accent",
  size = "xs",
  disabled = false,
}: Props<T>) {
  const options = [
    { value: "en" as T, label: "EN", title: "English" },
    { value: "de" as T, label: "DE", title: "Deutsch" },
    ...(allowBoth ? [{ value: "both" as T, label: "Both", title: "English + Deutsch" }] : []),
  ];
  return (
    <SegmentedControl
      options={options}
      value={value}
      onChange={onChange}
      shape="pill"
      size={size}
      tone={tone}
      disabled={disabled}
    />
  );
}
