import { useEffect, useId, useState } from "react";
import { StarIcon, XIcon } from "../components/icons";
import { TopNav, TopNavBackButton, TopNavLink } from "../components/TopNav";
import {
  AiThinkingIndicator,
  AuthCard,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  CheckRow,
  Chip,
  CopyField,
  Drawer,
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
  Modal,
  ModalBody,
  ModalFooter,
  Overlay,
  PageHeader,
  PageMain,
  PageShell,
  ProgressBar,
  QueryBoundary,
  SearchInput,
  Section,
  SegmentedControl,
  Select,
  SelectableCard,
  Spinner,
  Stack,
  StatTile,
  Surface,
  Textarea,
  type Tone,
  useConfirm,
  WaitingIndicator,
} from "../components/ui";
import { BarChartH, ColumnChart, DonutChart, LineChart, Sparkline } from "../components/ui/charts";
import {
  applyThemeFixtureToRoot,
  clearThemeFixtureFromRoot,
  THEME_FIXTURES,
  themeFixtureByKey,
} from "./theme-preview-fixtures";

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

// Fixed theme-preset switcher: re-skins the whole gallery by writing the
// fixture's CSS custom properties + data-select-style straight onto
// document.documentElement (plain DOM, no theme-engine import) — vars inherit,
// so every section below re-themes live. Mounted only under /dev/ui?themes=1
// so the default gallery capture in screenshot-smoke stays pixel-identical;
// even when mounted, the default state applies NO overrides.
function ThemePresetToolbar() {
  const [active, setActive] = useState<string | null>(null);

  // ONE effect owns the root overrides: apply-or-clear tracks `active`, and
  // the cleanup restores the pre-apply snapshot. Click handlers only set
  // state, so a Fast Refresh re-run (which strips and re-applies the vars)
  // can never desync from the pressed chip — and leaving the gallery always
  // restores whatever inline theme the root carried before.
  useEffect(() => {
    const fixture = themeFixtureByKey(active);
    if (fixture) applyThemeFixtureToRoot(fixture);
    return clearThemeFixtureFromRoot;
  }, [active]);

  return (
    <div className="fixed right-2 bottom-2 z-tooltip">
      <Surface variant="raised" className="flex max-w-xs flex-col gap-2">
        <MicroLabel>Theme fixtures</MicroLabel>
        <div className="flex flex-wrap gap-1.5">
          {THEME_FIXTURES.map((f) => (
            <Chip key={f.key} pressed={active === f.key} onClick={() => setActive(f.key)}>
              {f.label}
            </Chip>
          ))}
          <Chip pressed={false} onClick={() => setActive(null)}>
            reset
          </Chip>
        </div>
      </Surface>
    </div>
  );
}

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
  const [search, setSearch] = useState("");
  const [rowChecked, setRowChecked] = useState(true);
  const [rowPicked, setRowPicked] = useState(false);
  const [dialog, setDialog] = useState<
    "modal" | "modal-compact" | "drawer" | "sheet" | "overlay" | null
  >(null);
  const closeDialog = () => setDialog(null);
  const { confirm, confirmDialog } = useConfirm();
  const themesEnabled = new URLSearchParams(window.location.search).get("themes") === "1";

  return (
    <PageShell
      topNav={
        <TopNav back={<TopNavBackButton to="/" />}>
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

          <Section title="StatTile">
            <Stack gap="sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  label="Games played"
                  value={42}
                  sub="12 different"
                  to="/players"
                  cta="View history"
                />
                <StatTile label="Win rate" value="62%" sub="26W · 16L" soon />
                <StatTile
                  label="Overdue"
                  value={3}
                  sub="past their ETA"
                  tone="rose"
                  align="start"
                />
                <StatTile
                  label="Wins"
                  value={12}
                  variant="tile"
                  size="md"
                  labelPosition="bottom"
                  padding="md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Record (hero form)" align="start" padding="lg">
                  <span className="text-2xl font-bold tabular-nums text-fg-strong">7 / 9</span>
                  <span className="text-3xs text-fg-muted">free-form body under the label</span>
                </StatTile>
                <StatTile
                  label="Best score"
                  value="18 ★"
                  variant="filled"
                  size="lg"
                  padding="md"
                  tone="amber"
                />
                <Surface variant="raised" className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <StatTile
                    label="Plain cell"
                    value="in a Surface"
                    variant="plain"
                    padding="none"
                    align="start"
                    size="sm"
                  />
                  <StatTile
                    label="Second cell"
                    value="—"
                    variant="plain"
                    padding="none"
                    align="start"
                    size="sm"
                  />
                </Surface>
              </div>
            </Stack>
          </Section>

          <Section title="ProgressBar">
            <Stack gap="sm" className="max-w-md">
              <ProgressBar label="accent" value={0.62} />
              <ProgressBar
                label="emerald inside an extent"
                value={0.35}
                extent={0.8}
                tone="emerald"
              />
              <ProgressBar label="computed color, md" value={0.5} color="#f97316" size="md" />
            </Stack>
          </Section>

          <Section title="SearchInput / CheckRow / SelectableCard row">
            <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
              <SearchInput
                aria-label="Search games"
                placeholder="Search games…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <SelectableCard
                variant="row"
                padding="sm"
                selected={rowPicked}
                onClick={() => setRowPicked((v) => !v)}
              >
                <span className="text-sm text-fg-primary">Single-pick row</span>
              </SelectableCard>
              <CheckRow
                checked={rowChecked}
                onChange={() => setRowChecked((v) => !v)}
                title="Catan"
                description="2017 · 3–4 players"
                trailing={
                  <Badge tone="amber" shape="pill">
                    Expert
                  </Badge>
                }
              />
              <CheckRow
                checked={false}
                onChange={() => {}}
                padding="sm"
                title="EXIT: The Abandoned Cabin"
                description="2016"
              />
            </div>
          </Section>

          <Section title="Dialogs">
            <Swatch label="Modal / Drawer / Overlay / useConfirm">
              <Button size="sm" variant="secondary" onClick={() => setDialog("modal")}>
                Modal
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("modal-compact")}>
                Compact modal
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("drawer")}>
                Drawer
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("sheet")}>
                Bottom sheet
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("overlay")}>
                Overlay
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  void confirm({ title: "Delete this?", description: "It cannot be undone." })
                }
              >
                useConfirm
              </Button>
            </Swatch>
            {(dialog === "modal" || dialog === "modal-compact") && (
              <Modal
                onClose={closeDialog}
                size="sm"
                density={dialog === "modal-compact" ? "compact" : "comfortable"}
                eyebrow="Eyebrow"
                title="Modal title"
              >
                <ModalBody>
                  <p className="text-sm text-fg-secondary">Body scrolls; the footer stays put.</p>
                </ModalBody>
                <ModalFooter start={<span className="text-xs text-fg-muted">start slot</span>}>
                  <Button variant="ghost" size="sm" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={closeDialog}>
                    Confirm
                  </Button>
                </ModalFooter>
              </Modal>
            )}
            {dialog === "drawer" && (
              <Drawer onClose={closeDialog} eyebrow="Inspector" title="Right drawer">
                <p className="text-sm text-fg-secondary">Drawer body.</p>
              </Drawer>
            )}
            {dialog === "sheet" && (
              <Drawer side="bottom" onClose={closeDialog} title="Bottom sheet">
                <p className="text-sm text-fg-secondary">The phone rail sheet.</p>
              </Drawer>
            )}
            {dialog === "overlay" && (
              <Overlay onClose={closeDialog} contentClassName="w-80">
                <Surface>Overlay content — click anywhere to close.</Surface>
              </Overlay>
            )}
            {confirmDialog}
          </Section>

          <Section title="CopyField / indicators / AuthCard">
            <Stack gap="sm">
              <div className="max-w-md">
                <CopyField
                  value="https://example.com/calendar/abc123"
                  ariaLabel="Example link"
                  mono
                />
              </div>
              <Swatch label="AiThinkingIndicator / WaitingIndicator">
                <AiThinkingIndicator message="AI is thinking…" />
                <WaitingIndicator />
              </Swatch>
              <AuthCard title="Board Game Lab" subtitle="AuthCard specimen">
                <p className="text-sm text-fg-secondary">
                  The auth screens' card + gradient title.
                </p>
              </AuthCard>
            </Stack>
          </Section>

          <Section title="QueryBoundary">
            <div className="grid gap-3 sm:grid-cols-3">
              <QueryBoundary
                query={{ data: undefined, isPending: true, isError: false, error: null }}
                loadingLabel="Pending…"
              >
                {() => null}
              </QueryBoundary>
              <QueryBoundary
                query={{
                  data: undefined,
                  isPending: false,
                  isError: true,
                  error: new Error("Server said no"),
                }}
              >
                {() => null}
              </QueryBoundary>
              <QueryBoundary
                query={{ data: [] as string[], isPending: false, isError: false, error: null }}
                isEmpty={(d) => d.length === 0}
                empty={<EmptyState title="Empty via QueryBoundary" />}
              >
                {() => null}
              </QueryBoundary>
            </div>
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
                  <span className="text-xl font-bold tabular-nums text-fg-strong">15</span>
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
      {themesEnabled && <ThemePresetToolbar />}
    </PageShell>
  );
}
