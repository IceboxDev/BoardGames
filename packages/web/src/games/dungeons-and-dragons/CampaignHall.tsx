import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import { BookIcon, PlusIcon } from "../../components/icons";
import { Button, EmptyState, QueryBoundary } from "../../components/ui";
import { deleteCampaign, fetchCampaigns } from "../../lib/dnd-campaigns";
import { qk } from "../../lib/query-keys";
import { CampaignTome } from "./components/CampaignTome";
import { CreateCampaignModal } from "./components/CreateCampaignModal";
import { HallHero } from "./components/HallHero";

// The DM's campaign hall: hero, shelf of campaign tomes, and the
// upload-a-tome modal. The list query doubles as the extraction-job poll —
// while any campaign is processing it refetches every 2.5s (same cadence as
// avatar generation), and since status lives in the DB, a closed tab or a
// server restart resumes cleanly on the next visit.

type Props = {
  onOpenCampaign: (campaignId: string) => void;
};

export function CampaignHall({ onOpenCampaign }: Props) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const campaignsQuery = useQuery({
    queryKey: qk.dndCampaigns(),
    queryFn: fetchCampaigns,
    refetchInterval: (query) =>
      query.state.data?.campaigns.some((c) => c.status === "processing") ? 2500 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.dndCampaigns() }),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6">
      <HallHero />

      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="font-fantasy text-2xs font-bold uppercase tracking-[0.3em] text-amber-300/80">
          Your campaigns
        </h2>
        <Button variant="tinted" tone="amber" size="sm" onClick={() => setCreating(true)}>
          <PlusIcon className="h-4 w-4" />
          Add a campaign
        </Button>
      </div>

      <QueryBoundary
        query={campaignsQuery}
        loadingLabel="Unlocking the hall…"
        isEmpty={(data) => data.campaigns.length === 0}
        empty={
          <EmptyState
            tone="amber"
            icon={<BookIcon className="h-5 w-5" />}
            title="No campaigns yet"
            description="Add an adventure module and the sages will chart its world, waypoints, and cast."
            action={
              <Button variant="tinted" tone="amber" onClick={() => setCreating(true)}>
                Add your first campaign
              </Button>
            }
          />
        }
      >
        {(data) => (
          <ul className="flex flex-col gap-3">
            {data.campaigns.map((campaign, i) => (
              <motion.li
                key={campaign.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.3) }}
              >
                <CampaignTome
                  campaign={campaign}
                  onOpen={onOpenCampaign}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  deleting={deleteMutation.isPending && deleteMutation.variables === campaign.id}
                />
              </motion.li>
            ))}
          </ul>
        )}
      </QueryBoundary>

      {creating && <CreateCampaignModal onClose={() => setCreating(false)} />}
    </div>
  );
}
