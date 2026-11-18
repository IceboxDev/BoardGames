import type { CampaignPartner } from "@boardgames/core/protocol";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SelectableCard,
} from "../../../components/ui";
import { useCampaigns } from "./api";
import { teamLine } from "./mission-copy";
import { NewCampaignModal } from "./NewCampaignModal";
import { COMPANION_FREE_PATH, campaignPath, FREE_GAME_PATH } from "./paths";
import { TeamAvatars } from "./TeamAvatars";

// The campaigns behind a mode-picker card, and the way to start another:
//   solo  — Singleplayer: campaigns with the AI partner (plus a quick game
//           outside any campaign);
//   table — Companion: campaigns played with the physical cards, with a
//           member or someone without an account (plus a tracked game
//           outside any campaign).
// Campaigns with a member are also what a Multiplayer room plays
// (`DuetLobbyConfig`). Each pair keeps its own map, at its own depth.

type Scope = "solo" | "table";

const SCOPE_COPY: Record<
  Scope,
  { eyebrow: string; title: string; intro: string; empty: string; other: string }
> = {
  solo: {
    eyebrow: "Codenames: Duet · Singleplayer",
    title: "Your campaigns",
    intro:
      "You and the AI partner work through the mission map: start in Prague, and every mission you win opens the cities next to it. Run as many campaigns as you like, each at its own depth.",
    empty: "Start one in Prague — the AI partner holds the other side of the key.",
    other: "Quick game without a campaign",
  },
  table: {
    eyebrow: "Codenames: Duet · Companion",
    title: "At the table",
    intro:
      "Playing with the real cards? Pick your campaign and mission, keep the tracker between you, and tap what each guess reveals — it spends the timer tokens, runs sudden death and saves the result to your map.",
    empty: "Start one with your partner — a member, or someone without an account.",
    other: "Track a game without a campaign",
  },
};

const inScope = (scope: Scope, kind: CampaignPartner["kind"]) =>
  scope === "solo" ? kind === "ai" : kind !== "ai";

function lastPlayed(iso: string | null): string {
  if (!iso) return "Not played yet";
  return `Last played ${new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

export default function CampaignList({ scope }: { scope: Scope }) {
  const navigate = useNavigate();
  const campaigns = useCampaigns();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const copy = SCOPE_COPY[scope];
  const mine = (campaigns.data ?? []).filter((c) => inScope(scope, c.partnerKind));
  const list = mine.filter((c) => showArchived || !c.archived);
  const archivedCount = mine.filter((c) => c.archived).length;
  const mode = scope === "table" ? "table" : "play";

  return (
    <div className="relative z-raised h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xs font-bold uppercase tracking-eyebrow text-accent-300">
              {copy.eyebrow}
            </p>
            <h1 className="font-card text-3xl font-bold text-fg-strong">{copy.title}</h1>
            <p className="mt-1 max-w-prose text-sm text-fg-secondary">{copy.intro}</p>
          </div>
          <Button onClick={() => setCreating(true)}>New campaign</Button>
        </header>

        {campaigns.isPending ? (
          <LoadingState label="Loading campaigns…" className="py-16" />
        ) : campaigns.isError ? (
          <ErrorAlert message="Couldn't load your campaigns." />
        ) : list.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description={copy.empty}
            action={<Button onClick={() => setCreating(true)}>New campaign</Button>}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((c) => (
              <li key={c.id}>
                <SelectableCard
                  variant="row"
                  orientation="horizontal"
                  onClick={() => navigate(campaignPath(c.id, mode))}
                  icon={<TeamAvatars campaign={c} />}
                  title={
                    <>
                      {c.name}
                      {c.archived && <span className="ml-2 text-xs text-fg-muted">archived</span>}
                    </>
                  }
                  description={`${teamLine(c)} · ${lastPlayed(c.lastPlayedAt)}`}
                  trailing={
                    <span className="flex w-28 shrink-0 flex-col items-end gap-1 sm:w-36">
                      <span className="text-xs text-fg-secondary tabular-nums">
                        <b className="text-fg-strong">{c.cleared}</b>/26 cities · {c.gamesPlayed}{" "}
                        games
                      </span>
                      <ProgressBar
                        value={c.cleared / 26}
                        size="sm"
                        tone="emerald"
                        label={`${c.cleared} of 26 cities cleared`}
                      />
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {archivedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived
              ? "Hide archived campaigns"
              : `Show archived campaigns (${archivedCount})`}
          </Button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/play/codenames-duet")}>
            ← Back to Codenames: Duet
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(scope === "solo" ? FREE_GAME_PATH : COMPANION_FREE_PATH)}
          >
            {copy.other}
          </Button>
        </div>
      </div>

      {creating && (
        <NewCampaignModal
          kinds={scope === "solo" ? ["ai"] : ["member", "guest"]}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(campaignPath(id, mode))}
        />
      )}
    </div>
  );
}
