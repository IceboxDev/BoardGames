import type { CampaignPartner } from "@boardgames/core/protocol";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorAlert,
  Field,
  Input,
  LoadingState,
  MemberPicker,
  Modal,
  ModalBody,
  ModalFooter,
  ProgressBar,
  SegmentedControl,
  SelectableCard,
} from "../../../components/ui";
import { errorMessageOf } from "../../../lib/error-message";
import { useCampaigns, useCreateCampaign, usePartnerCandidates } from "./api";
import { teamLine } from "./mission-copy";
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

type PartnerKind = CampaignPartner["kind"];

const KIND_LABEL: Record<PartnerKind, string> = {
  member: "A member",
  ai: "AI partner",
  guest: "Someone else",
};

/** Starts a campaign in Prague; `kinds` = the partners this entry point offers. */
export function NewCampaignModal({
  kinds,
  onClose,
  onCreated,
}: {
  kinds: readonly PartnerKind[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateCampaign();
  const uid = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PartnerKind>(kinds[0] ?? "member");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const members = usePartnerCandidates(kind === "member");

  const partner: CampaignPartner | null =
    kind === "ai"
      ? { kind: "ai" }
      : kind === "guest"
        ? guestName.trim()
          ? { kind: "guest", name: guestName.trim() }
          : null
        : memberId
          ? { kind: "member", userId: memberId }
          : null;
  const ready = name.trim().length > 0 && partner !== null;

  return (
    <Modal onClose={onClose} size="sm" eyebrow="Codenames: Duet" title="New campaign">
      <ModalBody gap="md">
        <Field label="Team name" htmlFor={`${uid}-name`} hint="Written in the TEAM box of the map">
          <Input
            id={`${uid}-name`}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Night Owls"
          />
        </Field>
        <div className="flex flex-col gap-2">
          {kinds.length > 1 && (
            <>
              <span className="text-sm font-semibold text-fg-primary">Partner</span>
              <SegmentedControl
                fullWidth
                value={kind}
                onChange={setKind}
                options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </>
          )}
          {kind === "member" &&
            (members.isPending ? (
              <LoadingState label="Loading members…" className="py-6" />
            ) : (
              <MemberPicker
                members={(members.data ?? []).map((m) => ({
                  id: m.userId,
                  name: m.name,
                  image: m.image,
                }))}
                selectedIds={new Set(memberId ? [memberId] : [])}
                onToggle={(id) => setMemberId((current) => (current === id ? null : id))}
                selectedNoun="partner"
              />
            ))}
          {kind === "ai" && (
            <p className="text-sm text-fg-secondary">
              The AI partner holds the other side of the key and gives you clues. Pick its strength
              before each mission.
            </p>
          )}
          {kind === "guest" && (
            <Field
              label="Their name"
              htmlFor={`${uid}-guest`}
              hint="For a partner without an account: you play with the real cards and track it here"
            >
              <Input
                id={`${uid}-guest`}
                maxLength={40}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </Field>
          )}
        </div>
        {create.isError && (
          <ErrorAlert message={errorMessageOf(create.error, "Couldn't start the campaign") ?? ""} />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!ready || create.isPending}
          onClick={() =>
            partner &&
            create.mutate(
              { name: name.trim(), partner },
              { onSuccess: ({ campaign }) => onCreated(campaign.id) },
            )
          }
        >
          {create.isPending ? "Starting…" : "Start in Prague"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
