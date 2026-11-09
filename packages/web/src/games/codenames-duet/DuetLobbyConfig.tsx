import { type CityId, missionConfig } from "@boardgames/core/games/codenames-duet/campaign/map";
import { campaignProgress } from "@boardgames/core/games/codenames-duet/campaign/progress";
import { type DuetConfig, duetManifest } from "@boardgames/core/games/codenames-duet/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import type { CampaignSummary } from "@boardgames/core/protocol";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Button,
  Field,
  LoadingState,
  MicroLabel,
  SegmentedControl,
  Select,
  SelectableCard,
} from "../../components/ui";
import { OptionsControls } from "../codenames/components/OptionsControls";
import type { LobbyConfigProps } from "../types";
import { useCampaign, useCampaigns } from "./campaign/api";
import { NewCampaignModal } from "./campaign/CampaignList";
import { cityName, missionDifficulty, missionNumbers, missionRule } from "./campaign/mission-copy";
import { TokenSelect } from "./components/SetupScreen";

// A Duet room plays the campaign by default: the host picks one of the
// campaigns they share with a member and its next mission (the server checks
// both seats are the campaign's members and the city is open, and sets the
// city's turns and mistakes). "Free game" is the plain game with a chosen
// number of turns. Only the host's options are sent at start.

type Mode = "campaign" | "free";

const byRecent = (a: CampaignSummary, b: CampaignSummary) =>
  (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt);

export default function DuetLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const config = configOrDefaults(duetManifest, value);
  const [mode, setMode] = useState<Mode>("campaign");
  const set = (next: Partial<DuetConfig>) => onChange({ ...config, ...next });

  if (!isHost) {
    return (
      <div className="mx-auto mb-6 flex w-full max-w-md flex-col items-center gap-3">
        <p className="text-center text-sm text-fg-secondary">
          The host picks the campaign mission, or a free game.
        </p>
      </div>
    );
  }

  const free = () => {
    const { campaign: _c, mistakes: _m, ...rest } = config;
    onChange({ ...rest, timerTokens: duetManifest.config.parse({}).timerTokens });
  };

  return (
    <div className="mx-auto mb-6 flex w-full max-w-md flex-col items-stretch gap-3">
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={(m) => {
          setMode(m);
          if (m === "free") free();
        }}
        options={[
          { value: "campaign", label: "Campaign" },
          { value: "free", label: "Free game" },
        ]}
      />
      {mode === "campaign" ? (
        <CampaignPicker
          chosen={config.campaign ?? null}
          onPick={(id, city) => set({ campaign: { id, city }, ...missionConfig(city) })}
        />
      ) : (
        <div className="flex justify-center">
          <TokenSelect
            value={config.timerTokens}
            onChange={(timerTokens) => set({ timerTokens })}
          />
        </div>
      )}
      <div className="flex justify-center">
        <OptionsControls value={config} onChange={(next) => set(next)} />
      </div>
    </div>
  );
}

function CampaignPicker({
  chosen,
  onPick,
}: {
  chosen: { id: string; city: string } | null;
  onPick: (id: string, city: CityId) => void;
}) {
  const list = useCampaigns();
  const selectId = useId();
  const [creating, setCreating] = useState(false);
  const shared = useMemo(
    () => (list.data ?? []).filter((c) => c.partnerKind === "member" && !c.archived).sort(byRecent),
    [list.data],
  );
  const [campaignId, setCampaignId] = useState<string>(chosen?.id ?? "");
  // Default to the campaign played most recently.
  useEffect(() => {
    if (campaignId === "" && shared[0]) setCampaignId(shared[0].id);
  }, [campaignId, shared]);
  const detail = useCampaign(campaignId);
  const progress = useMemo(
    () => (detail.data ? campaignProgress(detail.data.games) : null),
    [detail.data],
  );
  const missions = useMemo(
    () =>
      progress
        ? {
            open: [...progress.open].sort((a, b) => missionDifficulty(a) - missionDifficulty(b)),
            cleared: [...progress.cleared].sort(
              (a, b) => missionDifficulty(a) - missionDifficulty(b),
            ),
          }
        : null,
    [progress],
  );
  // Pick the easiest open mission once the campaign's map is known.
  const chosenCity = chosen?.id === campaignId ? (chosen.city as CityId) : null;
  useEffect(() => {
    if (!missions || chosenCity) return;
    const first = missions.open[0] ?? missions.cleared[0];
    if (first) onPick(campaignId, first);
  }, [missions, chosenCity, campaignId, onPick]);

  if (list.isPending) return <LoadingState label="Loading your campaigns…" className="py-6" />;

  const row = (city: CityId) => (
    <SelectableCard
      key={city}
      variant="row"
      orientation="horizontal"
      padding="sm"
      selected={chosenCity === city}
      onClick={() => onPick(campaignId, city)}
      title={cityName(city)}
      description={missionRule(city)}
      trailing={
        <span className="font-card font-bold text-accent-300 tabular-nums">
          {missionNumbers(city)}
        </span>
      }
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {shared.length === 0 ? (
        <p className="text-center text-sm text-fg-secondary">
          You have no campaign with another member yet. Start one with your partner — it opens in
          Prague.
        </p>
      ) : (
        <div className="flex flex-col">
          <Field label="Campaign" htmlFor={selectId}>
            <Select
              id={selectId}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              {shared.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.members.map((m) => m.name).join(" & ")} · {c.cleared}/26
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {missions && (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          <MicroLabel>Mission</MicroLabel>
          {missions.open.map(row)}
          {missions.cleared.length > 0 && (
            <details>
              <summary className="cursor-pointer py-1.5 text-xs font-semibold text-fg-secondary">
                Play a cleared mission again ({missions.cleared.length})
              </summary>
              <div className="flex flex-col gap-1">{missions.cleared.map(row)}</div>
            </details>
          )}
        </div>
      )}
      {detail.isPending && campaignId !== "" && (
        <LoadingState label="Loading the map…" className="py-4" />
      )}
      <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
        New campaign
      </Button>
      <p className="text-center text-3xs text-fg-muted">
        Both players must be the campaign's members; the server checks it at start.
      </p>
      {creating && (
        <NewCampaignModal
          kinds={["member"]}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setCampaignId(id);
          }}
        />
      )}
    </div>
  );
}
