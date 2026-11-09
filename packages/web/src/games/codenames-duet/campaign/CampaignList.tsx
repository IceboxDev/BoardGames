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
import { campaignPath } from "./paths";
import { TeamAvatars } from "./TeamAvatars";

// Every campaign the member is in — one per partner, each at its own depth —
// and the way to start another.

function lastPlayed(iso: string | null): string {
  if (!iso) return "Not played yet";
  return `Last played ${new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

export default function CampaignList() {
  const navigate = useNavigate();
  const campaigns = useCampaigns();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const list = (campaigns.data ?? []).filter((c) => showArchived || !c.archived);
  const archivedCount = (campaigns.data ?? []).filter((c) => c.archived).length;

  return (
    <div className="relative z-raised h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xs font-bold uppercase tracking-eyebrow text-accent-300">
              Codenames: Duet
            </p>
            <h1 className="font-card text-3xl font-bold text-fg-strong">Campaigns</h1>
            <p className="mt-1 max-w-prose text-sm text-fg-secondary">
              Work through the mission map with a partner: start in Prague, and every mission you
              win opens the cities next to it. Play online, against the AI partner, or at the table
              and record it here.
            </p>
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
            description="Start one with a partner — each pair keeps its own map."
            action={<Button onClick={() => setCreating(true)}>New campaign</Button>}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((c) => (
              <li key={c.id}>
                <SelectableCard
                  variant="row"
                  orientation="horizontal"
                  onClick={() => navigate(campaignPath(c.id))}
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
        <Button variant="ghost" size="sm" onClick={() => navigate("/play/codenames-duet")}>
          ← Back to Codenames: Duet
        </Button>
      </div>

      {creating && (
        <NewCampaignModal
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(campaignPath(id))}
        />
      )}
    </div>
  );
}

type PartnerKind = CampaignPartner["kind"];

function NewCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateCampaign();
  const uid = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PartnerKind>("member");
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
          <span className="text-sm font-semibold text-fg-primary">Partner</span>
          <SegmentedControl
            fullWidth
            value={kind}
            onChange={setKind}
            options={[
              { value: "member", label: "A member" },
              { value: "ai", label: "AI partner" },
              { value: "guest", label: "Someone else" },
            ]}
          />
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
              Every mission is played against the AI partner. You can still record games played at
              the table.
            </p>
          )}
          {kind === "guest" && (
            <Field
              label="Their name"
              htmlFor={`${uid}-guest`}
              hint="For a partner without an account: games are played at the table and recorded here"
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
