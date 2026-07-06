import type { Campaign } from "@boardgames/core/protocol";
import { useState } from "react";
import { ArrowRightIcon, TrashIcon } from "../../../components/icons";
import { D20Die } from "../../../components/offline/D20Die";
import { Button, ErrorAlert, Modal } from "../../../components/ui";

// One campaign as a bound tome on the hall's shelf. The card carries all
// three job states: the sages reading (processing), a failed reading (error),
// and — once ready — just the title and tagline. Opening the tome leads to
// the session-setup screen; the quest map lives there and on the game screen.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Props = {
  campaign: Campaign;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
};

export function CampaignTome({ campaign, onOpen, onDelete, deleting }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const sourceLine = (
    <span className="truncate text-3xs text-amber-200/40">
      {campaign.sourceFilename} · {formatSize(campaign.sourceSizeBytes)}
    </span>
  );

  const deleteButton = (
    <Button
      variant="ghost"
      size="xs"
      aria-label="Delete campaign"
      onClick={() => setConfirmingDelete(true)}
      disabled={deleting}
      className="shrink-0 text-amber-200/50 hover:text-rose-300"
    >
      <TrashIcon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-4 transition-colors hover:border-amber-400/35">
      {campaign.status === "processing" && (
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="shrink-0">
            <D20Die count={20} className="dnd-die dnd-die-animated h-12 w-12" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="animate-pulse-soft text-sm font-semibold text-amber-100" style={SERIF}>
              The sages are studying your tome…
            </p>
            <p className="mt-0.5 text-2xs text-amber-200/60">
              Charting battles, revelations, and treasures. This can take a few minutes — feel free
              to wander off; the hall keeps watch.
            </p>
            <div className="mt-1">{sourceLine}</div>
          </div>
        </div>
      )}

      {campaign.status === "error" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-fantasy text-base font-bold text-amber-100">The reading failed</p>
              <div className="mt-0.5">{sourceLine}</div>
            </div>
            {deleteButton}
          </div>
          <ErrorAlert message={campaign.error ?? "The tome resisted our sages."} />
        </div>
      )}

      {campaign.status === "ready" && (
        <div className="flex items-start gap-2">
          {/* biome-ignore lint/correctness/noRestrictedElements: card body is the click target with a sibling delete Button — a full-card InteractiveCard would nest buttons. */}
          <button
            type="button"
            onClick={() => onOpen(campaign.id)}
            className="group flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="font-fantasy block truncate text-xl font-bold text-amber-100 transition-colors group-hover:text-amber-50">
                {campaign.title}
              </span>
              {campaign.tagline && (
                <span
                  className="mt-1 block text-sm italic leading-relaxed text-amber-200/70"
                  style={SERIF}
                >
                  {campaign.tagline}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-2xs font-semibold uppercase tracking-[0.14em] text-amber-300/60 transition-colors group-hover:text-amber-200">
              Open
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      )}

      {confirmingDelete && (
        <Modal
          onClose={() => setConfirmingDelete(false)}
          eyebrow="Burn the tome"
          title={campaign.title ?? campaign.sourceFilename}
          titleClassName="font-fantasy text-xl font-bold text-amber-100"
          panelClassName="max-w-md"
        >
          <p className="text-sm text-fg-secondary">
            This campaign and its charted waypoints will be lost to the flames. The original PDF
            stays wherever you keep it — you can always upload it again.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="tinted"
              tone="rose"
              loading={deleting}
              onClick={() => {
                onDelete(campaign.id);
                setConfirmingDelete(false);
              }}
            >
              Burn it
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
