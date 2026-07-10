import type { Campaign } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { ArrowRightIcon, PlusIcon, TrashIcon } from "../../components/icons";
import { D20Die } from "../../components/offline/D20Die";
import { Button, EmptyState, Input, QueryBoundary, useConfirm } from "../../components/ui";
import {
  createDndSession,
  createParty,
  deleteCampaign,
  deleteParty,
  partiesQueryFn,
} from "../../lib/dnd-campaigns";
import { errorMessageOf } from "../../lib/error-message";
import { qk } from "../../lib/query-keys";
import { DndPanel, HeroBanner } from "./components/ui";

// Campaign screen: the world is chosen — now pick WHICH group is playing it.
// Several parties can run the same one-shot side by side, each with its own
// roster and its own story tree. Opening a party leads to its setup (roster +
// begin); this screen is only the picker.

type Props = {
  campaign: Campaign;
  onOpenParty: (partyId: string) => void;
  /** Called after the campaign is burned (deleted) — navigate to the hall. */
  onBurned: () => void;
};

export function CampaignSetup({ campaign, onOpenParty, onBurned }: Props) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [newPartyName, setNewPartyName] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  // Register the live session as soon as the campaign is opened (the
  // "loading phase") so a beamer on a second device can already attach.
  useEffect(() => {
    createDndSession(campaign.id).catch(() => {});
  }, [campaign.id]);

  const partiesQuery = useQuery({
    queryKey: qk.dndParties(campaign.id),
    queryFn: partiesQueryFn(campaign.id),
  });

  const invalidateParties = () =>
    queryClient.invalidateQueries({ queryKey: qk.dndParties(campaign.id) });

  const createMutation = useMutation({
    mutationFn: (name: string) => createParty(campaign.id, name),
    onSuccess: (result) => {
      setNewPartyName("");
      void invalidateParties();
      onOpenParty(result.party.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteParty,
    onSettled: () => void invalidateParties(),
  });

  const burnMutation = useMutation({
    mutationFn: () => deleteCampaign(campaign.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.dndCampaigns() });
      onBurned();
    },
  });

  const submitNewParty = () => {
    const name = newPartyName.trim();
    if (name) createMutation.mutate(name);
  };

  const handleBurn = async () => {
    const ok = await confirm({
      title: `Burn ${campaign.title ?? campaign.sourceFilename}?`,
      description:
        "The campaign, its waypoints, every party's ledger and story tree, and the NPC cards will be lost to the flames. The original PDFs stay wherever you keep them.",
      confirmLabel: "Burn it",
      cancelLabel: "Keep it",
    });
    if (ok) burnMutation.mutate();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6">
      {/* Campaign identity. */}
      <HeroBanner eyebrow="The adventure" title={campaign.title} subtitle={campaign.tagline}>
        {(campaign.levelRange || campaign.kind === "one-shot") && (
          <p className="font-serif-body mt-3 text-2xs uppercase tracking-eyebrow text-amber-300/60">
            {[campaign.kind === "one-shot" ? "One-shot" : null, campaign.levelRange]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </HeroBanner>

      {/* Party picker. */}
      <h2 className="font-fantasy px-1 text-2xs font-bold uppercase tracking-eyebrow text-amber-300/80">
        Who's playing?
      </h2>

      <QueryBoundary
        query={partiesQuery}
        loadingLabel="Summoning the parties…"
        isEmpty={(data) => data.parties.length === 0}
        empty={
          <EmptyState
            tone="amber"
            icon={<D20Die count={20} className="h-6 w-6" />}
            title="No parties yet"
            description="Name the group that will walk this world — several groups can run the same adventure side by side."
          />
        }
      >
        {(data) => (
          <ul className="flex flex-col gap-2.5">
            {data.parties.map((party) => (
              <DndPanel as="li" key={party.id} interactive className="flex items-center gap-2">
                {/* biome-ignore lint/correctness/noRestrictedElements: card body is the click target with a sibling delete Button — a full-card InteractiveCard would nest buttons. */}
                <button
                  type="button"
                  onClick={() => onOpenParty(party.id)}
                  className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    aria-hidden="true"
                    title={`${party.memberCount} adventurers`}
                    className="font-fantasy grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-base font-bold text-amber-200 ring-1 ring-amber-400/50"
                  >
                    {party.memberCount}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-fantasy block truncate text-lg font-bold text-amber-100">
                      {party.name}
                    </span>
                    <span className="block text-2xs text-amber-200/60">
                      {party.memberCount} {party.memberCount === 1 ? "adventurer" : "adventurers"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-2xs font-semibold uppercase tracking-label text-amber-300/60 transition-colors group-hover:text-amber-200">
                    Open
                    <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Disband ${party.name}`}
                  onClick={() => deleteMutation.mutate(party.id)}
                  disabled={deleteMutation.isPending && deleteMutation.variables === party.id}
                  className="shrink-0 text-amber-200/30 hover:text-rose-300"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </DndPanel>
            ))}
          </ul>
        )}
      </QueryBoundary>

      {/* New party. */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`${uid}-party`}
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
          >
            Gather a new party
          </label>
          <Input
            id={`${uid}-party`}
            value={newPartyName}
            placeholder="e.g. The Thursday Group"
            maxLength={60}
            onChange={(e) => setNewPartyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewParty();
            }}
          />
        </div>
        <Button
          variant="tinted"
          tone="amber"
          disabled={!newPartyName.trim()}
          loading={createMutation.isPending}
          onClick={submitNewParty}
        >
          <PlusIcon className="h-4 w-4" />
          Gather
        </Button>
      </div>
      {createMutation.isError && (
        <p className="text-xs text-rose-300">
          {errorMessageOf(createMutation.error, "The party could not be gathered.")}
        </p>
      )}

      {/* Quiet campaign-removal path. */}
      <div className="flex justify-center pb-4 pt-2">
        <Button
          variant="ghost"
          size="xs"
          className="text-amber-200/30 hover:text-rose-300"
          loading={burnMutation.isPending}
          onClick={handleBurn}
        >
          Burn this tome
        </Button>
      </div>

      {confirmDialog}
    </div>
  );
}
