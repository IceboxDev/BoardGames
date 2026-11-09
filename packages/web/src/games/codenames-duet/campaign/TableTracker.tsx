import { type CityId, CityIdSchema } from "@boardgames/core/games/codenames-duet/campaign/map";
import { canAttempt, opensOnWin } from "@boardgames/core/games/codenames-duet/campaign/progress";
import {
  applyTableEvent,
  newTableGame,
  type TableEvent,
  type TableGame,
  TableGameSchema,
  TOTAL_AGENTS,
} from "@boardgames/core/games/codenames-duet/campaign/table-game";
import { STANDARD_TOKENS, TOKEN_OPTIONS } from "@boardgames/core/games/codenames-duet/manifest";
import type { CampaignDetail } from "@boardgames/core/protocol";
import { useCallback, useEffect, useId, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
  Button,
  ErrorAlert,
  Field,
  Input,
  LoadingState,
  MicroLabel,
  SegmentedControl,
  Surface,
} from "../../../components/ui";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { cn } from "../../../lib/cn";
import { errorMessageOf } from "../../../lib/error-message";
import { TimerTokens } from "../components/TimerTokens";
import { newTableGameId, useCampaign, useRecordTableGame } from "./api";
import { cityName, listCities, missionNumbers, missionRule } from "./mission-copy";
import { COMPANION_BASE, campaignPath } from "./paths";

// The Companion: a Duet game played with the physical cards, tracked live on
// one phone between the two players. They tap what each guess revealed; the
// tracker spends the timer tokens by the mission's rule (free mistakes, a
// bystander after them costs two turns), counts agents, says whose clue it
// is, runs sudden death and — in a campaign — saves the result. Every tap can
// be undone, and the game survives a refresh (it lives on this device until
// it's saved).

const SavedSchema = z.object({
  game: TableGameSchema,
  history: z.array(TableGameSchema).max(400),
  clientId: z.string(),
});
type Saved = z.infer<typeof SavedSchema>;

const storageKey = (campaignId: string | null, city: CityId | null) =>
  `duet-table:${campaignId ?? "free"}:${city ?? "free"}`;

function load(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = SavedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function store(key: string, saved: Saved | null): void {
  try {
    if (saved === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Private mode / storage full: the game still runs, it just won't survive a refresh.
  }
}

export default function TableTracker({ campaignId }: { campaignId: string | null }) {
  const { city: cityParam } = useParams<{ city: string }>();
  if (campaignId === null) return <Tracker campaign={null} city={null} />;
  const city = CityIdSchema.safeParse(cityParam);
  if (!city.success) return <Navigate to={campaignPath(campaignId, "table")} replace />;
  return <CampaignTracker id={campaignId} city={city.data} />;
}

function CampaignTracker({ id, city }: { id: string; city: CityId }) {
  const query = useCampaign(id);
  if (query.isPending) return <LoadingState label="Opening the mission…" className="py-24" />;
  if (query.isError || !query.data) {
    return (
      <ErrorAlert
        message="This campaign can't be opened — it isn't yours, or it no longer exists."
        className="mx-auto my-16 max-w-md"
      />
    );
  }
  return <Tracker campaign={query.data} city={city} />;
}

function playerNames(campaign: CampaignDetail | null, myId: string | undefined): [string, string] {
  if (!campaign) return ["Player 1", "Player 2"];
  const me = campaign.members.find((m) => m.userId === myId) ?? campaign.members[0];
  const partner =
    campaign.members.find((m) => m.userId !== me?.userId)?.name ??
    campaign.guestName ??
    "Your partner";
  return [me?.name ?? "You", partner];
}

function Tracker({ campaign, city }: { campaign: CampaignDetail | null; city: CityId | null }) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const key = storageKey(campaign?.id ?? null, city);
  const [saved, setSaved] = useState<Saved | null>(() => load(key));
  const names = playerNames(campaign, user?.id);
  const back = campaign ? campaignPath(campaign.id, "table") : COMPANION_BASE;

  const update = useCallback(
    (next: Saved | null) => {
      setSaved(next);
      store(key, next);
    },
    [key],
  );

  // A city the campaign can't play yet (opened from an old link).
  const locked =
    campaign !== null && city !== null && saved === null && !canAttempt(city, campaign.games);
  if (locked) {
    return (
      <Navigate
        to={back}
        replace
        state={{ missionError: "That mission isn't open yet: win a mission next to it first." }}
      />
    );
  }

  const title = city ? `${cityName(city)} ${missionNumbers(city)}` : "Game at the table";

  return (
    <div className="relative z-raised h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-10 sm:pt-8">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-eyebrow text-accent-300">
              {campaign ? `Companion · ${campaign.name}` : "Companion"}
            </p>
            <h1 className="truncate font-card text-2xl font-bold text-fg-strong">{title}</h1>
            {city && <p className="text-xs text-fg-secondary">{missionRule(city)}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(back)}>
            Close
          </Button>
        </header>

        {saved === null ? (
          <StartPanel
            city={city}
            names={names}
            onStart={(game) => update({ game, history: [], clientId: newTableGameId() })}
          />
        ) : (
          <LiveGame
            saved={saved}
            names={names}
            campaign={campaign}
            onChange={update}
            onDone={() => {
              update(null);
              navigate(back);
            }}
          />
        )}
      </div>
    </div>
  );
}

function StartPanel({
  city,
  names,
  onStart,
}: {
  city: CityId | null;
  names: [string, string];
  onStart: (game: TableGame) => void;
}) {
  const [tokens, setTokens] = useState<number>(STANDARD_TOKENS);
  const [first, setFirst] = useState<0 | 1>(0);
  const start = () => onStart(newTableGame(city ? { city } : { city: null, tokens }, first));
  return (
    <Surface variant="raised" padding="md" className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">
        Set up the cards as usual. Keep this screen between you and tap what each guess reveals —
        the tracker spends the timer tokens and says whose clue it is.
      </p>
      {city === null && (
        <div className="flex flex-col gap-1.5">
          <MicroLabel>Timer tokens</MicroLabel>
          <SegmentedControl
            fullWidth
            value={tokens}
            onChange={setTokens}
            options={TOKEN_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <MicroLabel>First clue from</MicroLabel>
        <SegmentedControl
          fullWidth
          value={first}
          onChange={setFirst}
          options={[
            { value: 0, label: names[0] },
            { value: 1, label: names[1] },
          ]}
        />
      </div>
      <Button size="lg" onClick={start} block>
        Start the game
      </Button>
    </Surface>
  );
}

function LiveGame({
  saved,
  names,
  campaign,
  onChange,
  onDone,
}: {
  saved: Saved;
  names: [string, string];
  campaign: CampaignDetail | null;
  onChange: (next: Saved | null) => void;
  onDone: () => void;
}) {
  const { game, history } = saved;
  const over = game.phase === "won" || game.phase === "lost";
  const suddenDeath = game.phase === "sudden-death";

  const act = (event: TableEvent) => {
    const next = applyTableEvent(game, event);
    if (next === game) return;
    onChange({ ...saved, game: next, history: [...history, game].slice(-400) });
  };
  const undo = () => {
    const prev = history.at(-1);
    if (prev) onChange({ ...saved, game: prev, history: history.slice(0, -1) });
  };

  // Keyboard at a laptop on the table: A agent, B bystander, S stop, Z undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z") undo();
      if (over) return;
      if (k === "a") act({ type: "agent" });
      else if (k === "b") act({ type: "bystander" });
      else if (k === "s") act({ type: "stop" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const bystanderCost = suddenDeath
    ? "Loses the game"
    : game.mistakesTotal === null || game.mistakesLeft > 0
      ? game.mistakesTotal === null
        ? "Ends the turn"
        : "Uses a free mistake"
      : "Costs two turns";

  return (
    <>
      <Surface variant="raised" padding="md" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <MicroLabel>Agents found</MicroLabel>
          <span className="flex items-baseline gap-1">
            <span className="font-card text-4xl font-black leading-none tabular-nums text-fg-strong">
              {game.agentsFound}
            </span>
            <span className="text-sm text-fg-muted">/ {TOTAL_AGENTS}</span>
          </span>
        </div>
        <div className="grid grid-cols-15 gap-1" aria-hidden>
          {Array.from({ length: TOTAL_AGENTS }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
              key={i}
              className={cn(
                "h-2 rounded-full",
                i < game.agentsFound ? "bg-cn-green" : "bg-fill-strong",
              )}
            />
          ))}
        </div>
        <div
          className={cn(
            "flex flex-col gap-2 rounded-card-lg border p-3",
            suddenDeath ? "border-amber-400/40 bg-amber-500/10" : "border-line-soft bg-fill-soft",
          )}
        >
          <div className="flex items-baseline justify-between">
            <MicroLabel>{suddenDeath ? "Sudden death" : "Turns left"}</MicroLabel>
            <span className="text-sm font-black tabular-nums text-fg-strong">
              {game.tokens}
              <span className="text-xs font-normal text-fg-muted"> / {game.tokensTotal}</span>
            </span>
          </div>
          <TimerTokens
            tokens={game.tokens}
            tokensTotal={game.tokensTotal}
            mistakesLeft={game.mistakesTotal === null ? null : game.mistakesLeft}
            mistakesTotal={game.mistakesTotal}
            size="lg"
          />
          <p className={cn("text-xs", suddenDeath ? "text-amber-200" : "text-fg-secondary")}>
            {suddenDeath
              ? "No more clues: take turns picking a card. Any bystander or the assassin loses."
              : game.mistakesTotal === null
                ? "Every token is bystander side: each turn costs one."
                : game.mistakesLeft === 0
                  ? "No free mistakes left: a bystander now costs two turns."
                  : `${game.mistakesLeft} free ${game.mistakesLeft === 1 ? "mistake" : "mistakes"} left (tan tokens).`}
          </p>
        </div>
      </Surface>

      {over ? (
        <Result
          saved={saved}
          campaign={campaign}
          onUndo={undo}
          onDone={onDone}
          onAgain={() => onChange(null)}
        />
      ) : (
        <Surface variant="raised" padding="md" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-fg-secondary">
              {suddenDeath ? "Picking now: " : "Clue from "}
              <b className="font-card text-lg text-fg-strong">{names[game.giver]}</b>
              {!suddenDeath && (
                <span className="text-fg-muted"> · {names[game.giver === 0 ? 1 : 0]} guesses</span>
              )}
            </p>
            <Button size="xs" variant="ghost" onClick={() => act({ type: "swap-giver" })}>
              Swap
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TrackButton
              label="Agent"
              hint={game.agentsFound === TOTAL_AGENTS - 1 ? "The last one wins" : "Keep guessing"}
              className="border-cn-green-deep bg-cn-green text-white"
              onClick={() => act({ type: "agent" })}
            />
            <TrackButton
              label="Bystander"
              hint={bystanderCost}
              className="border-cn-tan-deep bg-cn-tan text-cn-cover-ink"
              onClick={() => act({ type: "bystander" })}
            />
            {!suddenDeath && (
              <TrackButton
                label="Stop guessing"
                hint={
                  game.mistakesTotal !== null && game.tokens <= game.mistakesLeft
                    ? "Ends the turn (uses a tan token)"
                    : "Ends the turn"
                }
                className="border-line-strong bg-fill text-fg-strong"
                onClick={() => act({ type: "stop" })}
              />
            )}
            <TrackButton
              label="Assassin"
              hint="Loses the game"
              className={cn(
                "border-rose-400/50 bg-surface-950 text-rose-200",
                suddenDeath && "col-span-1",
              )}
              onClick={() => act({ type: "assassin" })}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={undo} disabled={history.length === 0}>
              Undo
            </Button>
            <span className="flex flex-wrap gap-1">
              {([0, 1] as const)
                .filter((p) => !game.cluedOut[p])
                .map((p) => (
                  <Button
                    key={p}
                    size="xs"
                    variant="ghost"
                    onClick={() => act({ type: "clued-out", player: p })}
                    title={`${names[p]}'s side of the key has no agents left: ${names[p === 0 ? 1 : 0]} gives every clue from now`}
                  >
                    {names[p]} has no agents left
                  </Button>
                ))}
            </span>
          </div>
          <p className="text-3xs text-fg-muted">
            Turn {game.turns + 1} · keys: A agent, B bystander, S stop, Z undo
          </p>
        </Surface>
      )}
    </>
  );
}

function TrackButton({
  label,
  hint,
  className,
  onClick,
}: {
  label: string;
  hint: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="plain"
      onClick={onClick}
      className={cn(
        "flex h-20 flex-col items-center justify-center gap-0.5 rounded-card-lg border-2 shadow transition-transform active:scale-95",
        className,
      )}
    >
      <span className="font-card text-lg font-bold">{label}</span>
      <span className="text-2xs opacity-80">{hint}</span>
    </Button>
  );
}

function Result({
  saved,
  campaign,
  onUndo,
  onDone,
  onAgain,
}: {
  saved: Saved;
  campaign: CampaignDetail | null;
  onUndo: () => void;
  onDone: () => void;
  onAgain: () => void;
}) {
  const { game } = saved;
  const uid = useId();
  const record = useRecordTableGame(campaign?.id ?? "");
  const [note, setNote] = useState("");
  const won = game.phase === "won";
  const opens =
    won && campaign && game.city && !campaign.games.some((g) => g.city === game.city && g.won)
      ? opensOnWin(game.city, campaign.games)
      : [];

  const save = () => {
    if (!campaign || !game.city) return;
    record.mutate(
      {
        clientId: saved.clientId,
        city: game.city,
        won,
        agentsFound: game.agentsFound,
        ...(won ? { tokensLeft: game.tokens } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Surface variant="raised" padding="md" className="flex flex-col gap-3">
      <div className="text-center">
        <p
          className={cn(
            "font-card text-3xl font-black",
            won ? "text-emerald-300" : "text-rose-300",
          )}
        >
          {won ? "Mission complete" : "Mission failed"}
        </p>
        <p className="text-sm text-fg-secondary">
          {won
            ? `All 15 agents in ${game.turns} ${game.turns === 1 ? "turn" : "turns"}, ${game.tokens} left.`
            : game.lostBy === "assassin"
              ? `The assassin, with ${game.agentsFound} of 15 agents found.`
              : `A miss in sudden death, with ${game.agentsFound} of 15 agents found.`}
        </p>
        {opens.length > 0 && (
          <p className="mt-1 text-xs text-accent-300">Saving it opens {listCities(opens)}.</p>
        )}
      </div>
      {campaign && game.city ? (
        <>
          <Field
            label="Note"
            htmlFor={`${uid}-note`}
            hint="Optional — the clue that won it, what went wrong"
          >
            <Input
              id={`${uid}-note`}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {record.isError && (
            <ErrorAlert
              message={
                errorMessageOf(record.error, "Couldn't save the game — try again") ??
                "Couldn't save the game — try again"
              }
            />
          )}
          <Button size="lg" onClick={save} disabled={record.isPending} block>
            {record.isPending ? "Saving…" : `Save to ${campaign.name}`}
          </Button>
        </>
      ) : (
        <Button size="lg" onClick={onAgain} block>
          New game
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onUndo}>
        Undo the last tap
      </Button>
    </Surface>
  );
}
