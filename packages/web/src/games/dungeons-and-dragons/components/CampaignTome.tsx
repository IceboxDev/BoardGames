import type { Campaign } from "@boardgames/core/protocol";

import { ArrowRightIcon, TrashIcon } from "../../../components/icons";
import { D20Die } from "../../../components/offline/D20Die";
import { Button, ErrorAlert, useConfirm } from "../../../components/ui";
import { formatBytes } from "../../../lib/format-bytes";
import { DndPanel } from "./ui";

// One campaign as a bound tome on the hall's shelf. The card carries all
// three job states: the sages reading (processing), a failed reading (error),
// and — once ready — just the title and tagline. Opening the tome leads to
// the session-setup screen; the quest map lives there and on the game screen.

type Props = {
  campaign: Campaign;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
};

export function CampaignTome({ campaign, onOpen, onDelete, deleting }: Props) {
  const { confirm, confirmDialog } = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Burn ${campaign.title ?? campaign.sourceFilename}?`,
      description:
        "This campaign and its charted waypoints will be lost to the flames. The original PDF stays wherever you keep it — you can always upload it again.",
      confirmLabel: "Burn it",
      cancelLabel: "Keep it",
    });
    if (ok) onDelete(campaign.id);
  };

  const sourceLine = (
    <span className="truncate text-3xs text-amber-200/40">
      {campaign.sourceFilename} · {formatBytes(campaign.sourceSizeBytes)}
    </span>
  );

  const deleteButton = (
    <Button
      variant="ghost"
      size="xs"
      aria-label="Delete campaign"
      onClick={handleDelete}
      disabled={deleting}
      className="shrink-0 text-amber-200/50 hover:text-rose-300"
    >
      <TrashIcon className="h-4 w-4" />
    </Button>
  );

  return (
    <DndPanel padding="lg" interactive className="overflow-hidden">
      {campaign.status === "processing" && (
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="shrink-0">
            <D20Die count={20} className="dnd-die dnd-die-animated h-12 w-12" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif-body animate-pulse-soft text-sm font-semibold text-amber-100">
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
                <span className="font-serif-body mt-1 block text-sm italic leading-relaxed text-amber-200/70">
                  {campaign.tagline}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-2xs font-semibold uppercase tracking-label text-amber-300/60 transition-colors group-hover:text-amber-200">
              Open
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      )}

      {confirmDialog}
    </DndPanel>
  );
}
