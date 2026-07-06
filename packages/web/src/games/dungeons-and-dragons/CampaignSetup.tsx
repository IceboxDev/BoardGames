import type { Campaign } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { ArrowRightIcon, PlusIcon, TrashIcon } from "../../components/icons";
import { D20Die } from "../../components/offline/D20Die";
import { Button, EmptyState, Input, Modal, QueryBoundary } from "../../components/ui";
import {
  createDndSession,
  createParty,
  deleteCampaign,
  deleteParty,
  partiesQueryFn,
} from "../../lib/dnd-campaigns";
import { errorMessageOf } from "../../lib/error-message";
import { qk } from "../../lib/query-keys";

// Campaign screen: the world is chosen — now pick WHICH group is playing it.
// Several parties can run the same one-shot side by side, each with its own
// roster and its own story tree. Opening a party leads to its setup (roster +
// begin); this screen is only the picker.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

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
  const [confirmingBurn, setConfirmingBurn] = useState(false);

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6">
      {/* Campaign identity. */}
      <div className="dnd-hero-glow relative overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-[#3b0a0a] via-[#1a0606] to-black p-5 text-center sm:p-6">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_20%,rgba(220,38,38,0.4),transparent_72%)]"
        />
        <div className="relative">
          <p className="font-fantasy text-2xs font-bold uppercase tracking-[0.35em] text-amber-300/80">
            The adventure
          </p>
          <h1
            className="font-fantasy mt-1 text-3xl font-bold text-amber-100 sm:text-4xl"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}
          >
            {campaign.title}
          </h1>
          {campaign.tagline && (
            <p className="mt-2 text-sm italic text-amber-200/70" style={SERIF}>
              {campaign.tagline}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {campaign.setting && (
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-amber-200/80 ring-1 ring-amber-400/25">
                {campaign.setting}
              </span>
            )}
            {campaign.levelRange && (
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-amber-200/80 ring-1 ring-amber-400/25">
                {campaign.levelRange}
              </span>
            )}
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-fg-secondary ring-1 ring-white/10">
              {campaign.checkpoints.length} waypoints charted
            </span>
          </div>
        </div>
      </div>

      {/* Party picker. */}
      <h2 className="font-fantasy px-1 text-2xs font-bold uppercase tracking-[0.3em] text-amber-300/80">
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
              <li
                key={party.id}
                className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3 transition-colors hover:border-amber-400/40"
              >
                {/* biome-ignore lint/correctness/noRestrictedElements: card body is the click target with a sibling delete Button — a full-card InteractiveCard would nest buttons. */}
                <button
                  type="button"
                  onClick={() => onOpenParty(party.id)}
                  className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="font-fantasy grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-base font-bold text-amber-200 ring-1 ring-amber-400/50"
                  >
                    {party.name[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-fantasy block truncate text-lg font-bold text-amber-100">
                      {party.name}
                    </span>
                    <span className="block text-2xs text-amber-200/60">
                      {party.memberCount} {party.memberCount === 1 ? "adventurer" : "adventurers"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-2xs font-semibold uppercase tracking-[0.14em] text-amber-300/60 transition-colors group-hover:text-amber-200">
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
              </li>
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
          onClick={() => setConfirmingBurn(true)}
        >
          Burn this tome
        </Button>
      </div>

      {confirmingBurn && (
        <Modal
          onClose={() => setConfirmingBurn(false)}
          eyebrow="Burn the tome"
          title={campaign.title ?? campaign.sourceFilename}
          titleClassName="font-fantasy text-xl font-bold text-amber-100"
          panelClassName="max-w-md"
        >
          <p className="text-sm text-fg-secondary">
            The campaign, its waypoints, every party's ledger and story tree, and the NPC cards will
            be lost to the flames. The original PDFs stay wherever you keep them.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmingBurn(false)}>
              Keep it
            </Button>
            <Button
              variant="tinted"
              tone="rose"
              loading={burnMutation.isPending}
              onClick={() => burnMutation.mutate()}
            >
              Burn it
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
