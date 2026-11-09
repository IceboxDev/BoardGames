import { CODENAMES_AI_MODELS } from "@boardgames/core/games/codenames/ai/models";
import { type CityId, missionConfig } from "@boardgames/core/games/codenames-duet/campaign/map";
import {
  campaignProgress,
  opensOnWin,
} from "@boardgames/core/games/codenames-duet/campaign/progress";
import type { CampaignDetail, CampaignGame } from "@boardgames/core/protocol";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  ErrorAlert,
  LoadingState,
  Select,
  SelectableCard,
  StatTile,
  Surface,
} from "../../../components/ui";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useGameShell } from "../../../hooks/useGameShell";
import { cn } from "../../../lib/cn";
import { setLobbyPreset } from "../../../lib/lobby-preset";
import { useCampaign, useDeleteTableGame } from "./api";
import { CampaignMap } from "./CampaignMap";
import {
  cityName,
  listCities,
  missionDifficulty,
  missionNumbers,
  missionRule,
  teamLine,
} from "./mission-copy";
import { CAMPAIGN_BASE, missionPlayPath } from "./paths";
import { RecordTableGameModal } from "./RecordTableGameModal";
import { TeamAvatars } from "./TeamAvatars";

// The Mission Desk (design 1 from the campaign studio): who the team is and
// where it stands, the map, the open missions with the chosen one's brief and
// its three ways to play — against the AI partner, online with the partner,
// or at the table and recorded here — and the mission log.

const MODE_LABEL: Record<CampaignGame["mode"], string> = {
  solo: "vs AI",
  online: "Online",
  table: "At the table",
};

function playedOn(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function MissionDesk({ id }: { id: string }) {
  const query = useCampaign(id);
  if (query.isPending) return <LoadingState label="Opening the campaign…" className="py-24" />;
  if (query.isError || !query.data) {
    return (
      <ErrorAlert
        message="This campaign can't be opened — it isn't yours, or it no longer exists."
        className="mx-auto my-16 max-w-md"
      />
    );
  }
  return <Desk campaign={query.data} />;
}

function Desk({ campaign }: { campaign: CampaignDetail }) {
  const navigate = useNavigate();
  const location = useLocation();
  // A mission the server refused (a locked city, someone else's campaign)
  // comes back here with its reason.
  const missionError =
    typeof location.state === "object" &&
    location.state !== null &&
    "missionError" in location.state &&
    typeof location.state.missionError === "string"
      ? location.state.missionError
      : null;
  const { mp } = useGameShell();
  const { user } = useCurrentUser();
  const progress = useMemo(() => campaignProgress(campaign.games), [campaign.games]);
  const replayable = useMemo(
    () => [...progress.cleared].sort((a, b) => missionDifficulty(a) - missionDifficulty(b)),
    [progress.cleared],
  );
  const [selected, setSelected] = useState<CityId | null>(progress.open[0] ?? null);
  const [recording, setRecording] = useState(false);
  const [aiTier, setAiTier] = useState<string>(CODENAMES_AI_MODELS[2].id);
  const [openingRoom, setOpeningRoom] = useState(false);
  const deleteGame = useDeleteTableGame(campaign.id);

  // A city can stop being open (a partner cleared it meanwhile): keep a valid pick.
  useEffect(() => {
    if (selected && !progress.open.includes(selected) && !progress.cleared.has(selected)) {
      setSelected(progress.open[0] ?? null);
    }
  }, [selected, progress]);

  // "Play online": once the room exists, its lobby opens with the mission's options.
  useEffect(() => {
    if (!openingRoom || !mp.roomCode || !selected) return;
    setLobbyPreset(mp.roomCode, {
      campaign: { id: campaign.id, city: selected },
      ...missionConfig(selected),
    });
    setOpeningRoom(false);
    navigate(`/play/codenames-duet/mp/lobby/${mp.roomCode}`);
  }, [openingRoom, mp.roomCode, selected, campaign.id, navigate]);

  const partner = campaign.members.find((m) => m.userId !== user?.id) ?? null;
  const canOnline = campaign.partnerKind === "member" && partner !== null;
  const canSolo = campaign.partnerKind !== "guest";
  const sorted = [...progress.open].sort((a, b) => missionDifficulty(a) - missionDifficulty(b));
  const games = campaign.games.map((g, i) => ({ g, n: i + 1 })).reverse();

  const startSolo = () => selected && navigate(missionPlayPath(campaign.id, selected, aiTier));
  const startOnline = () => {
    if (!selected) return;
    setOpeningRoom(true);
    mp.createRoom(user?.name?.trim() || "Player");
  };

  const cityRow = (city: CityId) => {
    const tries = progress.triesByCity[city] ?? 0;
    const cleared = progress.cleared.has(city);
    return (
      <SelectableCard
        key={city}
        variant="row"
        orientation="horizontal"
        padding="sm"
        selected={selected === city}
        onClick={() => setSelected(city)}
        icon={
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full border-2 text-2xs font-black tabular-nums",
              cleared
                ? "border-cn-green bg-cn-green text-white"
                : "border-accent-400 text-accent-300",
            )}
            title={cleared ? "Cleared" : `Difficulty ${missionDifficulty(city)} of 5`}
          >
            {cleared ? "✓" : missionDifficulty(city)}
          </span>
        }
        title={cityName(city)}
        description={
          tries > 0
            ? `${tries} ${tries === 1 ? "game" : "games"} here`
            : cleared
              ? "Cleared"
              : "New"
        }
        trailing={
          <span className="flex gap-1.5">
            <Pill value={missionConfig(city).timerTokens} label="turns" />
            <Pill
              value={missionConfig(city).mistakes}
              label="mistakes"
              warn={missionConfig(city).mistakes === 0}
            />
          </span>
        }
      />
    );
  };

  return (
    <div className="relative z-raised h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-4 pb-28 lg:gap-5 lg:px-6 lg:pt-6 lg:pb-10">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <TeamAvatars campaign={campaign} />
            <div className="min-w-0">
              <h1 className="truncate font-card text-2xl font-bold text-fg-strong">
                {campaign.name}
              </h1>
              <p className="truncate text-xs text-fg-muted">
                {teamLine(campaign)} · started {playedOn(campaign.createdAt)}
                {campaign.archived && " · archived"}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:min-w-96">
            <StatTile label="Cities" value={`${progress.cleared.size}`} sub="of 26" size="md" />
            <StatTile label="Games" value={`${progress.gamesPlayed}`} size="md" />
            <StatTile
              label="Won"
              value={`${progress.wins}`}
              sub={`of ${progress.gamesPlayed}`}
              size="md"
            />
          </div>
        </header>

        {missionError && <ErrorAlert message={missionError} />}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-5">
          <Surface variant="raised" padding="sm">
            <CampaignMap progress={progress} selected={selected} onSelect={setSelected} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-1 pb-1 text-2xs text-fg-muted">
              <Legend className="bg-cn-green" label="Cleared" />
              <Legend className="border-2 border-accent-400" label="Open" />
              <Legend className="border border-line-strong" label="Locked" />
              <span className="ml-auto">Numbers: turns–mistakes</span>
            </div>
          </Surface>

          <div className="flex min-w-0 flex-col gap-4">
            <Surface variant="raised" padding="none">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h2 className="text-sm font-bold text-fg-strong">Next mission</h2>
                <span className="text-xs text-fg-muted">{progress.open.length} open</span>
              </div>
              <div className="flex flex-col gap-1 px-2 pb-2">
                {sorted.map(cityRow)}
                {sorted.length === 0 && (
                  <p className="px-2 py-3 text-sm text-fg-secondary">
                    Every city is cleared. Replay a favourite below.
                  </p>
                )}
              </div>
              {replayable.length > 0 && (
                <details className="border-t border-line-soft px-2 py-1">
                  <summary className="cursor-pointer px-2 py-2 text-xs font-semibold text-fg-secondary">
                    Play a cleared mission again ({replayable.length})
                  </summary>
                  <div className="flex flex-col gap-1 pb-2">{replayable.map(cityRow)}</div>
                </details>
              )}
              <Brief
                city={selected}
                campaign={campaign}
                partnerName={partner?.name ?? campaign.guestName ?? null}
                canOnline={canOnline}
                canSolo={canSolo}
                aiTier={aiTier}
                onAiTier={setAiTier}
                onSolo={startSolo}
                onOnline={startOnline}
                onRecord={() => setRecording(true)}
                openingRoom={openingRoom}
                cleared={progress.cleared}
                games={campaign.games}
              />
            </Surface>

            <Surface variant="raised" padding="none">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h2 className="text-sm font-bold text-fg-strong">Mission log</h2>
                <span className="text-xs text-fg-muted">
                  {progress.gamesPlayed} {progress.gamesPlayed === 1 ? "game" : "games"}
                </span>
              </div>
              {games.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-fg-secondary">
                  No games yet. Every game counts here, won or lost — the fewer it takes to clear
                  the map, the better.
                </p>
              ) : (
                <ol className="flex flex-col px-2 pb-2">
                  {games.map(({ g, n }) => (
                    <li
                      key={g.id}
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-line-soft px-2 py-2 text-sm first:border-t-0"
                    >
                      <span className="font-card font-bold text-fg-muted tabular-nums">#{n}</span>
                      <span className="min-w-0">
                        <span className="font-semibold text-fg-strong">{cityName(g.city)}</span>
                        <span className="block truncate text-2xs text-fg-muted">
                          {playedOn(g.playedAt)} · {MODE_LABEL[g.mode]}
                          {g.agentsFound !== null && ` · ${g.agentsFound}/15 agents`}
                          {g.note && ` · ${g.note}`}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {g.replayId !== null && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              navigate(`/play/codenames-duet/match-history/${g.replayId}`)
                            }
                          >
                            Replay
                          </Button>
                        )}
                        {g.mode === "table" && g.recordedBy === user?.id && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={deleteGame.isPending}
                            onClick={() => deleteGame.mutate(g.id)}
                            title="Remove this table record"
                          >
                            Remove
                          </Button>
                        )}
                        <Badge tone={g.won ? "emerald" : "rose"} size="xs">
                          {g.won ? "Won" : "Lost"}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Surface>
            <Button variant="ghost" size="sm" onClick={() => navigate(CAMPAIGN_BASE)}>
              ← All campaigns
            </Button>
          </div>
        </div>
      </div>

      {/* Phone: the start button stays under the thumb. */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-raised-2 flex items-center gap-3 border-t border-line bg-surface-900 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-fg-strong">
              {cityName(selected)}{" "}
              <span className="text-accent-300 tabular-nums">{missionNumbers(selected)}</span>
            </p>
            <p className="truncate text-2xs text-fg-muted">{missionRule(selected)}</p>
          </div>
          {canOnline ? (
            <Button size="sm" onClick={startOnline} disabled={openingRoom || campaign.archived}>
              Play online
            </Button>
          ) : canSolo ? (
            <Button size="sm" onClick={startSolo} disabled={campaign.archived}>
              Play vs AI
            </Button>
          ) : (
            <Button size="sm" onClick={() => setRecording(true)} disabled={campaign.archived}>
              Record game
            </Button>
          )}
        </div>
      )}

      {recording && selected && (
        <RecordTableGameModal
          campaign={campaign}
          city={selected}
          onClose={() => setRecording(false)}
          onRecorded={() => setRecording(false)}
        />
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function Pill({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <span className="flex h-9 min-w-11 flex-col items-center justify-center rounded-ui-md bg-fill">
      <b
        className={cn(
          "font-card text-base leading-none tabular-nums",
          warn ? "text-rose-300" : "text-fg-strong",
        )}
      >
        {value}
      </b>
      <span className="mt-0.5 text-3xs uppercase tracking-label text-fg-muted">{label}</span>
    </span>
  );
}

function Brief({
  city,
  campaign,
  partnerName,
  canOnline,
  canSolo,
  aiTier,
  onAiTier,
  onSolo,
  onOnline,
  onRecord,
  openingRoom,
  cleared,
  games,
}: {
  city: CityId | null;
  campaign: CampaignDetail;
  partnerName: string | null;
  canOnline: boolean;
  canSolo: boolean;
  aiTier: string;
  onAiTier: (tier: string) => void;
  onSolo: () => void;
  onOnline: () => void;
  onRecord: () => void;
  openingRoom: boolean;
  cleared: ReadonlySet<CityId>;
  games: readonly CampaignGame[];
}) {
  if (!city) {
    return (
      <div className="border-t border-line-soft px-4 py-4 text-sm text-fg-secondary">
        Pick a mission on the map or in the list.
      </div>
    );
  }
  const opens = cleared.has(city) ? [] : opensOnWin(city, games);
  return (
    <div className="flex flex-col gap-3 border-t border-line-soft px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-card text-xl font-bold text-fg-strong">{cityName(city)}</h3>
        <span className="font-card text-lg font-bold text-accent-300 tabular-nums">
          {missionNumbers(city)}
        </span>
      </div>
      <p className="text-sm text-fg-secondary">{missionRule(city)}</p>
      {opens.length > 0 && (
        <p className="text-xs text-fg-muted">A win opens {listCities(opens)}.</p>
      )}
      {campaign.archived ? (
        <p className="text-sm text-fg-muted">This campaign is archived.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {canOnline && (
            <Button onClick={onOnline} disabled={openingRoom} block>
              {openingRoom
                ? "Opening a room…"
                : `Play online with ${partnerName ?? "your partner"}`}
            </Button>
          )}
          {canSolo && (
            <div className="flex gap-2">
              <Button variant={canOnline ? "secondary" : "primary"} onClick={onSolo} block>
                Play vs AI partner
              </Button>
              <Select
                aria-label="AI partner"
                block={false}
                value={aiTier}
                onChange={(e) => onAiTier(e.target.value)}
              >
                {CODENAMES_AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button variant="secondary" onClick={onRecord} block>
            Record a game played at the table
          </Button>
        </div>
      )}
    </div>
  );
}
