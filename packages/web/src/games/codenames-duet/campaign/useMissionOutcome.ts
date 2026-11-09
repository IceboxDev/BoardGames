import type { CampaignMission } from "@boardgames/core/games/codenames-duet/campaign/map";
import { opensOnWin } from "@boardgames/core/games/codenames-duet/campaign/progress";
import type { DuetResult } from "@boardgames/core/games/codenames-duet/types";
import type { CampaignGame } from "@boardgames/core/protocol";
import { useRef } from "react";
import { useCampaign } from "./api";
import { cityName, listCities } from "./mission-copy";

/**
 * The game-over line for a campaign mission — "Paris cleared · Madrid now
 * open". Computed from the campaign as it stood when the game began (the
 * first answer is kept: the server records this game the moment it ends, and
 * a refetch would already include it).
 */
export function useMissionOutcome(mission: CampaignMission | null) {
  const campaign = useCampaign(mission?.id ?? "");
  const before = useRef<{ id: string; games: readonly CampaignGame[] } | null>(null);
  if (mission && campaign.data && before.current?.id !== mission.id) {
    before.current = { id: mission.id, games: campaign.data.games };
  }
  const name = campaign.data?.name ?? null;

  return (result: DuetResult | null): string | null => {
    if (!mission || !result) return null;
    const city = cityName(mission.city);
    if (!result.won) return `${city} held — the game counts; try again or pick another mission`;
    const games = before.current?.games;
    const wasCleared = games?.some((g) => g.city === mission.city && g.won) ?? false;
    if (wasCleared) return `${city} completed again${name ? ` for ${name}` : ""}`;
    const opens = games ? opensOnWin(mission.city, games) : [];
    return opens.length > 0
      ? `${city} cleared · now open: ${listCities(opens)}`
      : `${city} cleared${name ? ` for ${name}` : ""}`;
  };
}
