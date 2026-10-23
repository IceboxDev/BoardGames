import type { QuizLang, QuizLanguages } from "@boardgames/core/protocol";
import { type CoreTone, SegmentedControl, Select } from "../../../../components/ui";

// The trainer's languages: EN / DE / RU as the main language, and an
// optional second one shown under questions and answers. The trainer
// setting seeds it; a study screen can flip it locally without touching the
// setting.

const LANGS: readonly { value: QuizLang; label: string; title: string }[] = [
  { value: "en", label: "EN", title: "English" },
  { value: "de", label: "DE", title: "Deutsch" },
  { value: "ru", label: "RU", title: "Русский" },
];

type Props = {
  value: QuizLanguages;
  onChange: (next: QuizLanguages) => void;
  /** Offer the second-language select (default true). Article pages show one language. */
  allowSecondary?: boolean;
  tone?: CoreTone;
  size?: "xs" | "sm";
  disabled?: boolean;
};

export function LanguageToggle({
  value,
  onChange,
  allowSecondary = true,
  tone = "accent",
  size = "xs",
  disabled = false,
}: Props) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <SegmentedControl
        options={LANGS}
        value={value.primary}
        onChange={(primary) =>
          onChange({ primary, secondary: value.secondary === primary ? null : value.secondary })
        }
        shape="pill"
        size={size}
        tone={tone}
        disabled={disabled}
        aria-label="Main language"
      />
      {allowSecondary && (
        <Select
          block={false}
          size="sm"
          value={value.secondary ?? ""}
          disabled={disabled}
          aria-label="Second language"
          title="Second language, shown under questions and answers"
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...value, secondary: v === "en" || v === "de" || v === "ru" ? v : null });
          }}
        >
          <option value="">+ none</option>
          {LANGS.filter((l) => l.value !== value.primary).map((l) => (
            <option key={l.value} value={l.value}>
              + {l.label}
            </option>
          ))}
        </Select>
      )}
    </span>
  );
}

/** EN / DE / RU alone — for screens that show one text. */
export function PrimaryLanguageToggle({
  value,
  onChange,
  size = "xs",
  disabled = false,
}: {
  value: QuizLang;
  onChange: (next: QuizLang) => void;
  size?: "xs" | "sm";
  disabled?: boolean;
}) {
  return (
    <SegmentedControl
      options={LANGS}
      value={value}
      onChange={onChange}
      shape="pill"
      size={size}
      tone="accent"
      disabled={disabled}
      aria-label="Language"
    />
  );
}
