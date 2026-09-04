import { useId } from "react";
import { PreviewFrame } from "../components/dev/PreviewFrame";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  Field,
  Input,
  MicroLabel,
  PageHeader,
  SegmentedControl,
  Surface,
} from "../components/ui";
import {
  SELECT_STYLES,
  type SelectStyle,
  THEME_FIXTURES,
  THEME_VAR_NAMES,
  type ThemeFixture,
  themeFixtureByKey,
  themeVarStyle,
} from "./theme-preview-fixtures";

// Dev-only visual verification surface for site theming — one full-width
// section per fixture palette, each wrapping a representative chrome collage
// (PageHeader, Buttons, Chips, Badges, a Surface form card, Avatars) in a div
// that sets ALL theme CSS custom properties via inline style. CSS variables
// inherit, so every primitive inside re-themes with zero component changes;
// if a section still renders the default indigo, propagation is broken.
// Mirrors RsvpPreview / SkillPreview (incl. the ?frame=WxH iframe trick for
// true phone-width layouts). Deliberately imports NOTHING from the theme
// engine — the palettes here are frozen fixtures (see theme-preview-fixtures).
//
// INERT KNOBS on this branch — they change no pixel yet, by design, and that
// is not evidence of broken propagation:
//   • `--radius-card-scale` / `--radius-ui-scale` — no consumer until the
//     primitives unit's components/ui/radii.ts lands. (Avatars are round
//     under every theme by design and were never part of this set.)
//   • `data-select-style` — the attribute is set on every section and by the
//     gallery toolbar, but nothing reads it yet; it is here so the selector
//     contract is exercised the moment the engine ships a consumer.
//   • the `shadow-glow-accent` UTILITY — Tailwind v4 inlines `@theme` shadows,
//     so only an explicit `shadow-[var(--shadow-glow-accent)]` follows the
//     palette; the "Accent glow" swatch below is that proof.
// What IS live and must look right: every `--color-*` (surfaces, fg, accent
// ramp, neons) across all nine sections.
// Route: /dev/theme-preview
//   ?preset=<key>                       one fixture, full-screen (screenshots)
//   ?select=bar|glow|border|fill|underline   force data-select-style on all
//   ?frame=WxH                          render inside an iframe of that size

function ColorDot({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="h-5 w-8 rounded border border-white/15"
      style={{ background: `var(${name})` }}
    />
  );
}

function ThemeCollage({ fixture }: { fixture: ThemeFixture }) {
  const uid = useId();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        size="sm"
        eyebrow={`Theme fixture · ${fixture.key}`}
        title={fixture.label}
        subtitle={fixture.blurb}
      />

      <div className="flex flex-col gap-2">
        <MicroLabel>Palette</MicroLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {THEME_VAR_NAMES.filter((n) => n.startsWith("--color-")).map((n) => (
            <ColorDot key={n} name={n} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <MicroLabel>Buttons</MicroLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="tinted" tone="accent" size="sm">
            Tinted
          </Button>
          <Button variant="solid" tone="accent" size="sm">
            Solid
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <MicroLabel>Accent glow</MicroLabel>
        <div className="flex flex-wrap items-center gap-4">
          {/* Reads --shadow-glow-accent EXPLICITLY. Tailwind v4 inlines an
              `@theme` --shadow-* into its utility, so `shadow-glow-accent`
              would stay indigo here — see the fixtures header. This swatch is
              the proof the var itself propagates. */}
          <span className="h-8 w-24 rounded-lg bg-accent-500 shadow-[var(--shadow-glow-accent)]" />
          <span className="text-3xs text-fg-muted">shadow-[var(--shadow-glow-accent)]</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <MicroLabel>Chips &amp; badges</MicroLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Chip pressed onClick={() => {}}>
            pressed
          </Chip>
          <Chip pressed={false} onClick={() => {}}>
            idle
          </Chip>
          <Chip pressed variant="outlined" tone="emerald" onClick={() => {}}>
            outlined
          </Chip>
          <Badge tone="accent">accent</Badge>
          <Badge tone="amber">amber</Badge>
          <Badge tone="emerald">emerald</Badge>
          <Badge tone="rose">rose</Badge>
          <Badge tone="neutral">neutral</Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Surface className="flex flex-col gap-3">
          <Field
            label="Display name"
            htmlFor={`${uid}-name`}
            hint="Form chrome on the themed surface"
          >
            <Input id={`${uid}-name`} placeholder="Ada Lovelace" />
          </Field>
          <SegmentedControl
            aria-label={`${fixture.label} segments`}
            size="sm"
            options={[
              { value: "a", label: "Pick" },
              { value: "b", label: "Results" },
              { value: "c", label: "Attendees" },
            ]}
            value="a"
            onChange={() => {}}
          />
        </Surface>
        <Surface className="flex flex-col justify-center gap-3">
          <MicroLabel>Avatars</MicroLabel>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name="Ada Lovelace" size="xs" />
            <Avatar name="Grace Hopper" size="sm" />
            <Avatar name="Radia Perlman" size="md" />
            <Avatar
              name="Margaret Hamilton"
              size="lg"
              ring
              accentHex={fixture.vars["--color-accent-500"]}
            />
          </div>
        </Surface>
      </div>
    </div>
  );
}

function FixtureSection({
  fixture,
  selectOverride,
  full = false,
}: {
  fixture: ThemeFixture;
  selectOverride?: SelectStyle;
  full?: boolean;
}) {
  return (
    <section
      data-select-style={selectOverride ?? fixture.selectStyle}
      className="px-6 py-8"
      style={{
        ...themeVarStyle(fixture),
        background: "var(--color-surface-950)",
        color: "var(--color-fg-primary)",
        // Preset mode fills the rest of the viewport below the blank pt-14
        // strip — 100dvh alone would push the page past one screen.
        ...(full ? { minHeight: "calc(100dvh - 3.5rem)" } : null),
      }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <ThemeCollage fixture={fixture} />
      </div>
    </section>
  );
}

export default function ThemePreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("frame")) {
    return <PreviewFrame params={params} />;
  }

  const rawSelect = params.get("select");
  const selectOverride = SELECT_STYLES.find((s) => s === rawSelect);
  const rawPreset = params.get("preset");
  const preset = themeFixtureByKey(rawPreset);

  const badParam =
    rawPreset && !preset
      ? `Unknown preset “${rawPreset}”. Valid keys: ${THEME_FIXTURES.map((f) => f.key).join(", ")}`
      : rawSelect && !selectOverride
        ? `Unknown select style “${rawSelect}”. Valid values: ${SELECT_STYLES.join(", ")}`
        : null;
  if (badParam) {
    return <div className="px-6 pt-20 text-sm text-fg-secondary">{badParam}</div>;
  }

  // The pt-14 strip keeps the top-left nav-check crop region blank (the body's
  // default background), matching the other chrome-less /dev previews.
  return (
    <div className="min-h-screen pt-14">
      {preset ? (
        <FixtureSection fixture={preset} selectOverride={selectOverride} full />
      ) : (
        <>
          <p className="px-6 pb-3 text-3xs text-fg-muted">
            Theme fixtures · ?preset=&lt;key&gt; for one full-screen ·
            ?select=bar|glow|border|fill|underline · ?frame=WxH
          </p>
          {THEME_FIXTURES.map((f) => (
            <FixtureSection key={f.key} fixture={f} selectOverride={selectOverride} />
          ))}
        </>
      )}
    </div>
  );
}
