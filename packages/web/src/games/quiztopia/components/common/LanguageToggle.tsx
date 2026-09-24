import type { QuiztopiaLanguage } from "@boardgames/core/protocol";
import { type CoreTone, SegmentedControl } from "../../../../components/ui";

// EN / DE / Both. The trainer setting seeds it; a board or study screen can
// flip it locally without touching the setting.

type Props<T extends QuiztopiaLanguage | "en" | "de"> = {
  value: T;
  onChange: (next: T) => void;
  /** Offer the "Both" option (question + translation). Default true. */
  allowBoth?: boolean;
  tone?: CoreTone;
  size?: "xs" | "sm";
};

export function LanguageToggle<T extends QuiztopiaLanguage>({
  value,
  onChange,
  allowBoth = true,
  tone = "accent",
  size = "xs",
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
    />
  );
}
