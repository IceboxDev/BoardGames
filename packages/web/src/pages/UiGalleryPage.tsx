import { useId, useState } from "react";
import { StarIcon, XIcon } from "../components/icons";
import { TopNav, TopNavBackButton, TopNavLink } from "../components/TopNav";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  Chip,
  EmptyState,
  ErrorAlert,
  Eyebrow,
  Field,
  FieldGroup,
  IconButton,
  Input,
  InteractiveCard,
  LoadingState,
  MicroLabel,
  PageHeader,
  PageMain,
  PageShell,
  Section,
  SegmentedControl,
  Select,
  SelectableCard,
  Spinner,
  Stack,
  Surface,
  Textarea,
  type Tone,
} from "../components/ui";
import { BarChartH, ColumnChart, DonutChart, LineChart, Sparkline } from "../components/ui/charts";

// ── UI Gallery ───────────────────────────────────────────────────────────
//
// Dev-only route (`/dev/ui`) rendering every `ui/` primitive in its variants
// on one page. Two jobs:
//   1. The visual-regression surface: `scripts/screenshot-smoke.sh` captures
//      this route, so a primitive change diffs HERE — per component, once —
//      instead of only where it happens to appear in product screens.
//   2. The living reference for the tone/size/shape vocabulary: if a new
//      variant isn't representable on this page, its API is probably wrong.
//
// Keep sections in ui/index.ts export order so nothing silently drops out.

const CORE_TONES = ["accent", "amber", "sky", "emerald", "rose"] as const;
const ALL_TONES: readonly Tone[] = [...CORE_TONES, "purple", "orange", "cyan", "neutral"];

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <MicroLabel>{label}</MicroLabel>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function UiGalleryPage() {
  const [chipOn, setChipOn] = useState(true);
  const uid = useId();
  const [segment, setSegment] = useState<"a" | "b" | "c">("a");
  const [checked, setChecked] = useState(true);

  return (
    <PageShell
      topNav={
        <TopNav back={<TopNavBackButton to="/" label="Dashboard" />}>
          <TopNavLink to="/login">Action</TopNavLink>
        </TopNav>
      }
    >
      <PageMain width="6xl" padding="dense">
        <Stack gap="xl">
          <PageHeader
            eyebrow="Design system"
            title="UI Gallery"
            subtitle="Every primitive, every variant — the visual-regression surface."
          />

          <Section title="Button">
            <Stack gap="sm">
              <Swatch label="Structural variants">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="warning">Warning</Button>
                <Button variant="success">Success</Button>
              </Swatch>
              <Swatch label="Tinted tones">
                {ALL_TONES.filter((t) => t !== "neutral").map((t) => (
                  <Button key={t} variant="tinted" tone={t as Exclude<Tone, "neutral">} size="sm">
                    {t}
                  </Button>
                ))}
              </Swatch>
              <Swatch label="Solid tones">
                {ALL_TONES.filter((t) => t !== "neutral").map((t) => (
                  <Button key={t} variant="solid" tone={t as Exclude<Tone, "neutral">} size="sm">
                    {t}
                  </Button>
                ))}
              </Swatch>
              <Swatch label="Sizes / shapes / states">
                <Button size="xs">xs</Button>
                <Button size="sm">sm</Button>
                <Button size="md">md</Button>
                <Button size="lg">lg</Button>
                <Button shape="pill">pill</Button>
                <Button loading>Loading</Button>
                <Button disabled>Disabled</Button>
                <ButtonLink href="https://example.com" external size="sm">
                  ButtonLink
                </ButtonLink>
              </Swatch>
            </Stack>
          </Section>

          <Section title="IconButton">
            <Swatch label="variants × tones × shapes">
              <IconButton aria-label="ghost" icon={<XIcon />} />
              <IconButton aria-label="rose" tone="rose" icon={<XIcon />} />
              <IconButton aria-label="amber" tone="amber" icon={<XIcon />} />
              <IconButton aria-label="subtle" variant="subtle" icon={<XIcon />} />
              <IconButton aria-label="bordered" variant="bordered" icon={<XIcon />} />
              <IconButton aria-label="pill" shape="pill" icon={<XIcon />} />
              <IconButton aria-label="pressed" pressed icon={<XIcon />} />
              <IconButton aria-label="xs" size="xs" icon={<XIcon />} />
              <IconButton aria-label="lg" size="lg" icon={<XIcon />} />
            </Swatch>
          </Section>

          <Section title="Badge">
            <Stack gap="sm">
              <Swatch label="All tones (shared TONE_BUBBLE)">
                {ALL_TONES.map((t) => (
                  <Badge key={t} tone={t}>
                    {t}
                  </Badge>
                ))}
              </Swatch>
              <Swatch label="Sizes / ring / pill">
                <Badge size="xs">xs</Badge>
                <Badge size="sm">sm</Badge>
                <Badge size="md">md</Badge>
                <Badge tone="amber" ring>
                  ring
                </Badge>
                <Badge tone="emerald" shape="pill" icon={<StarIcon className="h-3 w-3" />}>
                  pill+icon
                </Badge>
              </Swatch>
            </Stack>
          </Section>

          <Section title="Chip">
            <Swatch label="pressed / unpressed / outlined / flat">
              {CORE_TONES.map((t) => (
                <Chip key={t} tone={t} pressed onClick={() => {}}>
                  {t}
                </Chip>
              ))}
              <Chip pressed={chipOn} onClick={() => setChipOn((v) => !v)}>
                toggle me
              </Chip>
              <Chip pressed variant="outlined" tone="rose" onClick={() => {}}>
                outlined
              </Chip>
              <Chip pressed flat tone="emerald" onClick={() => {}}>
                flat
              </Chip>
              <Chip pressed={false} onClick={() => {}}>
                idle
              </Chip>
            </Swatch>
          </Section>

          <Section title="SegmentedControl">
            <Stack gap="sm">
              <SegmentedControl
                aria-label="pill segments"
                options={[
                  { value: "a", label: "Alpha" },
                  { value: "b", label: "Beta" },
                  { value: "c", label: "Gamma" },
                ]}
                value={segment}
                onChange={setSegment}
              />
              <SegmentedControl
                aria-label="rounded emphasized"
                shape="rounded"
                emphasizeActive
                tone="emerald"
                selectionMode="toggle"
                options={[
                  { value: "a", label: "Going" },
                  { value: "b", label: "Not going" },
                ]}
                value={segment === "c" ? "a" : segment}
                onChange={(v) => setSegment(v)}
              />
            </Stack>
          </Section>

          <Section title="Surface / InteractiveCard / SelectableCard">
            <div className="grid gap-3 sm:grid-cols-3">
              <Surface>panel (default)</Surface>
              <Surface variant="tile">tile</Surface>
              <Surface variant="raised">raised</Surface>
              <Surface radius="xl">panel + radius=xl</Surface>
              <InteractiveCard onClick={() => {}}>InteractiveCard</InteractiveCard>
              <SelectableCard
                tone="emerald"
                selected
                onClick={() => {}}
                title="SelectableCard"
                description="tile, selected, emerald"
              />
            </div>
          </Section>

          <Section title="Labels & typography">
            <Stack gap="sm">
              <Swatch label="Eyebrow sizes × tones">
                <Eyebrow size="sm">sm accent</Eyebrow>
                <Eyebrow size="md" tone="amber">
                  md amber
                </Eyebrow>
                <Eyebrow size="lg" tone="neutral">
                  lg neutral
                </Eyebrow>
              </Swatch>
              <Swatch label="MicroLabel">
                <MicroLabel>stat caption</MicroLabel>
              </Swatch>
            </Stack>
          </Section>

          <Section title="Forms">
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <Field label="Input" htmlFor={`${uid}-input`} hint="Standard field">
                <Input id={`${uid}-input`} placeholder="Type here…" />
              </Field>
              <Field label="Invalid" htmlFor={`${uid}-invalid`} error="Something's off">
                <Input id={`${uid}-invalid`} invalid defaultValue="bad value" />
              </Field>
              <Field label="Select (md)" htmlFor={`${uid}-select`}>
                <Select id={`${uid}-select`} defaultValue="one">
                  <option value="one">Option one</option>
                  <option value="two">Option two</option>
                </Select>
              </Field>
              <Field label="Select (sm, chevron)" htmlFor={`${uid}-select-sm`}>
                <Select id={`${uid}-select-sm`} size="sm" chevron defaultValue="one">
                  <option value="one">Compact</option>
                </Select>
              </Field>
              <Field label="Textarea" htmlFor={`${uid}-textarea`}>
                <Textarea id={`${uid}-textarea`} rows={2} placeholder="Notes…" />
              </Field>
              <FieldGroup label="Checkbox">
                <Checkbox
                  id={`${uid}-check`}
                  label="Enabled option"
                  checked={checked}
                  onChange={() => setChecked((v) => !v)}
                />
              </FieldGroup>
            </div>
          </Section>

          <Section title="Async & feedback states">
            <Stack gap="sm">
              <LoadingState label="Loading something…" />
              <ErrorAlert title="Request failed" message="The server said no. Try again." />
              <EmptyState
                icon={<StarIcon className="h-4 w-4" />}
                title="Nothing here yet"
                description="Neutral empty state with an action."
                action={<Button size="sm">Create one</Button>}
              />
              <EmptyState tone="amber" title="Locked" description="Advisory amber state." />
              <EmptyState tone="rose" title="Not found" description="Rose failure state." />
              <Swatch label="Spinner sizes">
                <Spinner size="xs" />
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </Swatch>
            </Stack>
          </Section>

          <Section title="Avatar">
            <Swatch label="sizes / ring">
              <Avatar name="Ada Lovelace" size="xs" />
              <Avatar name="Ada Lovelace" size="sm" />
              <Avatar name="Ada Lovelace" size="md" />
              <Avatar name="Grace Hopper" size="lg" ring accentHex="#22d3ee" />
            </Swatch>
          </Section>

          <Section title="Charts">
            <Stack gap="sm">
              <Swatch label="DonutChart">
                <DonutChart
                  size={110}
                  segments={[
                    { value: 9, tone: "emerald", label: "Won" },
                    { value: 4, tone: "rose", label: "Lost" },
                    { value: 2, tone: "neutral", label: "Other" },
                  ]}
                >
                  <span className="text-xl font-bold tabular-nums text-white">15</span>
                  <MicroLabel>games</MicroLabel>
                </DonutChart>
              </Swatch>
              <Swatch label="Sparkline (tone / color)">
                <Sparkline data={[3, 5, 4, 8, 6, 9, 7, 10]} />
                <Sparkline data={[9, 6, 7, 4, 5, 2]} tone="rose" />
                <Sparkline data={[1, 4, 2, 6, 5, 8]} color="#22d3ee" />
              </Swatch>
              <Swatch label="BarChartH">
                <div className="w-full max-w-md">
                  <BarChartH
                    labelWidthClassName="w-10"
                    bars={[
                      {
                        label: "Mon",
                        segments: [
                          { value: 4, tone: "emerald", label: "attended" },
                          { value: 1, tone: "neutral", label: "missed" },
                        ],
                      },
                      {
                        label: "Fri",
                        segments: [
                          { value: 7, tone: "emerald", label: "attended" },
                          { value: 2, tone: "neutral", label: "missed" },
                        ],
                      },
                    ]}
                  />
                </div>
              </Swatch>
              <Swatch label="ColumnChart">
                <div className="w-full max-w-md">
                  <ColumnChart
                    height={90}
                    columns={["Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((label, i) => ({
                      label,
                      segments: [
                        { value: (i % 3) + 1, tone: "emerald", label: "won" },
                        { value: i % 2, tone: "rose", label: "lost" },
                      ],
                    }))}
                  />
                </div>
              </Swatch>
              <Swatch label="LineChart (rolling avg)">
                <div className="w-full max-w-xl">
                  <LineChart
                    height={160}
                    data={[4, 7, 5, 9, 8, 11, 9, 12].map((y, x) => ({ x, y, label: `#${x + 1}` }))}
                    rollingAvgData={[5, 6, 6.5, 8, 9, 10].map((y, i) => ({ x: i + 2, y }))}
                    yLabel="score"
                  />
                </div>
              </Swatch>
            </Stack>
          </Section>
        </Stack>
      </PageMain>
    </PageShell>
  );
}
