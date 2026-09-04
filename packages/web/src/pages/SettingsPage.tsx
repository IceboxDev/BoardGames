import type { CSSProperties } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import {
  Button,
  Chip,
  Field,
  FieldGroup,
  InteractiveCard,
  PageHeader,
  PageMain,
  PageShell,
  SegmentedControl,
  Select,
  Stack,
  Surface,
} from "../components/ui";
import { Section } from "../components/ui/Section";
import { THEME_IDENTITY_KEYS, type ThemeConfig } from "../lib/theme/config";
import { useTheme } from "../lib/theme/provider";
import { deriveAccentRamp } from "../lib/theme/ramp";
import {
  type AmbientEffectDef,
  listFonts,
  listPatterns,
  listPresets,
  loadAmbientEffects,
  type ThemePresetDef,
} from "../lib/theme/registry";
import { loadWallpaper, saveWallpaper } from "../lib/theme/storage";

// ── /settings — Appearance ───────────────────────────────────────────────
//
// The whole personalization surface: presets, custom colors, background
// pattern/wallpaper, shapes, typography and the ambient layer. Every control
// writes through `useTheme()` — the provider applies instantly, mirrors to
// localStorage and debounces the profile PUT.

const MAX_WALLPAPER_BYTES = 2 * 1024 * 1024; // ≤2MB once data-URL encoded

type ColorFieldKey =
  | "surface950"
  | "surface900"
  | "surface800"
  | "surface700"
  | "fgPrimary"
  | "fgSecondary"
  | "fgMuted"
  | "accent";

const COLOR_FIELDS: { key: ColorFieldKey; label: string }[] = [
  { key: "surface950", label: "Background" },
  { key: "surface900", label: "Panel" },
  { key: "surface800", label: "Card" },
  { key: "surface700", label: "Border" },
  { key: "fgPrimary", label: "Text" },
  { key: "fgSecondary", label: "Text secondary" },
  { key: "fgMuted", label: "Text muted" },
  { key: "accent", label: "Accent" },
];

const AVATAR_OPTIONS = [
  { value: "circle" as const, label: "Circle" },
  { value: "squircle" as const, label: "Squircle" },
  { value: "square" as const, label: "Square" },
];

const SELECTION_OPTIONS = [
  { value: "bar" as const, label: "Bar" },
  { value: "glow" as const, label: "Glow" },
  { value: "border" as const, label: "Border" },
  { value: "fill" as const, label: "Fill" },
  { value: "underline" as const, label: "Line" },
];

const AMBIENT_OPTIONS = [
  { value: "auto" as const, label: "Auto" },
  { value: "on" as const, label: "On" },
  { value: "off" as const, label: "Off" },
];

/** The registered preset the current config matches on its identity keys. */
function activePresetKey(theme: ThemeConfig): string | null {
  for (const preset of listPresets()) {
    if (THEME_IDENTITY_KEYS.every((k) => preset.config[k] === theme[k])) return preset.key;
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-fg-primary">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xs text-fg-muted">{value}</span>
        {/* biome-ignore lint/correctness/noRestrictedElements: raw color input — the native picker has no ui primitive (precedent: EditProfileModal's bespoke swatches) */}
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent"
        />
      </div>
    </div>
  );
}

function RangeRow({
  label,
  min,
  max,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-fg-primary">{label}</span>
        <span className="text-xs tabular-nums text-fg-muted">{display}</span>
      </div>
      {/* biome-ignore lint/correctness/noRestrictedElements: range slider — no ui Slider primitive exists */}
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-500"
      />
    </div>
  );
}

/**
 * Live preview card: the swatch area carries the PRESET'S vars via inline
 * style, so the token-driven utility classes inside preview that preset's
 * palette regardless of the active theme.
 */
function PresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: ThemePresetDef;
  active: boolean;
  onSelect: () => void;
}) {
  const c = preset.config;
  const ramp = deriveAccentRamp(c.accent);
  const previewVars = {
    "--color-surface-950": c.surface950,
    "--color-surface-900": c.surface900,
    "--color-surface-800": c.surface800,
    "--color-surface-700": c.surface700,
    "--color-fg-primary": c.fgPrimary,
    "--color-fg-secondary": c.fgSecondary,
    "--color-accent-500": c.accent,
    "--color-accent-400": ramp["400"],
  } as CSSProperties;
  return (
    <InteractiveCard
      padding="none"
      onClick={onSelect}
      aria-pressed={active}
      className={active ? "overflow-hidden ring-2 ring-accent-400/70" : "overflow-hidden"}
    >
      <div style={previewVars} className="bg-surface-950 p-3">
        {/* Miniature mock, not app chrome: vars above repaint the token
            utilities, so this must stay a bespoke ring'd tile, not Surface. */}
        <div className="rounded-lg bg-surface-900 p-2.5 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 shrink-0 rounded-full bg-accent-500" />
            <span className="h-2 w-full max-w-16 rounded bg-surface-700" />
          </div>
          <div className="mt-2 rounded-md bg-surface-800 px-2 py-1.5">
            <span className="text-xs font-semibold text-fg-primary">Aa</span>
            <span className="ml-2 text-xs text-fg-secondary">Board night</span>
          </div>
          <div className="mt-2 h-1 w-2/3 rounded bg-accent-400" />
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold text-fg-primary">{preset.label}</span>
        {active && <span className="text-2xs font-semibold text-accent-300">Active</span>}
      </div>
    </InteractiveCard>
  );
}

export default function SettingsPage() {
  const { theme, updateTheme, setPreset, resetToDefault, refreshWallpaper } = useTheme();
  const fieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [effects, setEffects] = useState<readonly AmbientEffectDef[] | null>(null);

  const presets = listPresets();
  const patterns = listPatterns();
  const fonts = listFonts();
  const currentPreset = activePresetKey(theme);
  const wallpaperImage = theme.wallpaper ? loadWallpaper() : null;
  // The `wallpaper` FLAG syncs to the server but the image never leaves the
  // device, so a second device restores `wallpaper: true` with no image. Drive
  // the section off what actually renders, not off the flag alone — otherwise
  // that device shows the "Upload image" empty state AND leaves every pattern
  // chip unpressed, i.e. no selection anywhere. The flag is left untouched so
  // the device that DOES hold the image keeps using it.
  const wallpaperActive = theme.wallpaper && wallpaperImage !== null;

  // Ambient effects are code-split; fetch the catalog once for the picker.
  useEffect(() => {
    let cancelled = false;
    void loadAmbientEffects().then((defs) => {
      if (!cancelled) setEffects(defs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleWallpaperFile(file: File) {
    setWallpaperError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith("data:image/")) {
        setWallpaperError("That file doesn't look like an image.");
        return;
      }
      if (dataUrl.length > MAX_WALLPAPER_BYTES) {
        setWallpaperError("Image is too large — keep it under 2MB.");
        return;
      }
      if (!saveWallpaper(dataUrl)) {
        setWallpaperError("Couldn't store the image (browser storage is full).");
        return;
      }
      updateTheme({ wallpaper: true });
      refreshWallpaper();
    } catch {
      setWallpaperError("Couldn't read that file. Try another image.");
    }
  }

  function removeWallpaper() {
    saveWallpaper(null);
    setWallpaperError(null);
    updateTheme({ wallpaper: false });
    refreshWallpaper();
  }

  return (
    <PageShell topNav={<TopNav back={<TopNavBackButton to="/" />} />}>
      <PageMain>
        <Stack gap="xl">
          <PageHeader
            eyebrow="Personalization"
            title="Appearance"
            subtitle="Make the Lab yours — palette, background, shapes, type and ambience. Saved to your profile."
          />

          <Section title="Preset">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {presets.map((preset) => (
                <PresetCard
                  key={preset.key}
                  preset={preset}
                  active={currentPreset === preset.key}
                  onSelect={() => setPreset(preset.key)}
                />
              ))}
            </div>
          </Section>

          <Section title="Colors">
            <Surface padding="md">
              <div className="divide-y divide-white/5">
                {COLOR_FIELDS.map((field) => (
                  <ColorRow
                    key={field.key}
                    label={field.label}
                    value={theme[field.key]}
                    // Computed union keys widen to an index signature, so the
                    // narrow cast restores the Partial<ThemeConfig> shape.
                    onChange={(hex) => updateTheme({ [field.key]: hex } as Partial<ThemeConfig>)}
                  />
                ))}
              </div>
            </Surface>
          </Section>

          <Section title="Background">
            <Surface padding="md">
              <Stack gap="md">
                <FieldGroup label="Pattern">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      pressed={!wallpaperActive && theme.pattern === "none"}
                      onClick={() => updateTheme({ pattern: "none", wallpaper: false })}
                    >
                      None
                    </Chip>
                    {patterns.map((pattern) => (
                      // biome-ignore lint/correctness/noRestrictedElements: bespoke pattern swatch tile — no Button/Chip variant can carry a generated background preview
                      <button
                        key={pattern.key}
                        type="button"
                        aria-label={`Pattern ${pattern.label}`}
                        aria-pressed={!wallpaperActive && theme.pattern === pattern.key}
                        onClick={() => updateTheme({ pattern: pattern.key, wallpaper: false })}
                        style={
                          {
                            backgroundColor: theme.surface950,
                            backgroundImage: pattern.generate(theme.patternColor, 0.5),
                          } as CSSProperties
                        }
                        className={
                          !wallpaperActive && theme.pattern === pattern.key
                            ? "relative h-16 w-20 overflow-hidden rounded-lg ring-2 ring-accent-400/80"
                            : "relative h-16 w-20 overflow-hidden rounded-lg ring-1 ring-white/10 hover:ring-white/30"
                        }
                      >
                        <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-3xs font-medium text-white/85">
                          {pattern.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  {patterns.length === 0 && (
                    <p className="text-xs text-fg-muted">
                      No patterns installed yet — presets can still bring their own.
                    </p>
                  )}
                </FieldGroup>

                <ColorRow
                  label="Pattern color"
                  value={theme.patternColor}
                  onChange={(hex) => updateTheme({ patternColor: hex })}
                />

                <RangeRow
                  label="Pattern opacity"
                  min={0}
                  max={100}
                  value={Math.round(theme.patternOpacity * 100)}
                  display={`${Math.round(theme.patternOpacity * 100)}%`}
                  onChange={(v) => updateTheme({ patternOpacity: v / 100 })}
                />

                <FieldGroup label="Wallpaper" hint="Stays on this device only; max 2MB.">
                  {/* biome-ignore lint/correctness/noRestrictedElements: sr-only file input — the documented exception; triggered by the Buttons below */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="Upload wallpaper image"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleWallpaperFile(file);
                      e.target.value = "";
                    }}
                  />
                  {wallpaperImage ? (
                    <div className="flex items-center gap-3">
                      <div
                        aria-hidden
                        style={{ backgroundImage: `url("${wallpaperImage}")` } as CSSProperties}
                        className="h-16 w-24 rounded-lg bg-cover bg-center ring-1 ring-white/10"
                      />
                      <div className="flex flex-col gap-1.5">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Replace
                        </Button>
                        <Button size="xs" variant="ghost" onClick={removeWallpaper}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload image
                    </Button>
                  )}
                  {wallpaperError && <p className="text-xs text-rose-400">{wallpaperError}</p>}
                </FieldGroup>
              </Stack>
            </Surface>
          </Section>

          <Section title="Shapes">
            <Surface padding="md">
              <Stack gap="md">
                <RangeRow
                  label="Card radius"
                  min={0}
                  max={24}
                  value={theme.radiusCard}
                  display={`${theme.radiusCard}px`}
                  onChange={(v) => updateTheme({ radiusCard: v })}
                />
                <RangeRow
                  label="Control radius"
                  min={0}
                  max={16}
                  value={theme.radiusUi}
                  display={`${theme.radiusUi}px`}
                  onChange={(v) => updateTheme({ radiusUi: v })}
                />
                <FieldGroup label="Avatar shape">
                  <SegmentedControl
                    aria-label="Avatar shape"
                    size="sm"
                    options={AVATAR_OPTIONS}
                    value={theme.avatarShape}
                    onChange={(v) => updateTheme({ avatarShape: v })}
                  />
                </FieldGroup>
                <FieldGroup label="Selection style">
                  <SegmentedControl
                    aria-label="Selection style"
                    size="sm"
                    options={SELECTION_OPTIONS}
                    value={theme.selectionStyle}
                    onChange={(v) => updateTheme({ selectionStyle: v })}
                  />
                </FieldGroup>
              </Stack>
            </Surface>
          </Section>

          <Section title="Typography">
            <Surface padding="md">
              <Stack gap="md">
                <Field label="Font" htmlFor={`${fieldId}-font`}>
                  <Select
                    id={`${fieldId}-font`}
                    value={theme.fontFamily}
                    onChange={(e) => updateTheme({ fontFamily: e.target.value })}
                  >
                    {fonts.map((font) => (
                      <option key={font.key} value={font.key}>
                        {font.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <RangeRow
                  label="Base text size"
                  min={12}
                  max={20}
                  value={theme.baseFontSize}
                  display={`${theme.baseFontSize}px`}
                  onChange={(v) => updateTheme({ baseFontSize: v })}
                />
              </Stack>
            </Surface>
          </Section>

          <Section title="Ambient">
            <Surface padding="md">
              <Stack gap="md">
                <FieldGroup
                  label="Ambient effects"
                  hint="Auto follows the active preset. Disabled automatically when your system prefers reduced motion."
                >
                  <SegmentedControl
                    aria-label="Ambient effects mode"
                    size="sm"
                    options={AMBIENT_OPTIONS}
                    value={theme.ambientMode}
                    onChange={(v) => updateTheme({ ambientMode: v })}
                  />
                </FieldGroup>
                {theme.ambientMode === "on" && (
                  <FieldGroup label="Effect">
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        pressed={theme.ambientEffect === null}
                        onClick={() => updateTheme({ ambientEffect: null })}
                      >
                        None
                      </Chip>
                      {(effects ?? []).map((effect) => (
                        <Chip
                          key={effect.key}
                          pressed={theme.ambientEffect === effect.key}
                          onClick={() => updateTheme({ ambientEffect: effect.key })}
                        >
                          {effect.label}
                        </Chip>
                      ))}
                    </div>
                    {effects !== null && effects.length === 0 && (
                      <p className="text-xs text-fg-muted">No ambient effects installed yet.</p>
                    )}
                  </FieldGroup>
                )}
              </Stack>
            </Surface>
          </Section>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={resetToDefault}>
              Reset to default
            </Button>
          </div>
        </Stack>
      </PageMain>
    </PageShell>
  );
}
