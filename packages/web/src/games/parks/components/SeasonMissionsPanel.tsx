import type { ParksPlayerView, Season, SeasonMission } from "@boardgames/core/games/parks/types";
import {
  SEASON_LABELS,
  SEASON_MISSION_LABELS,
  SEASON_MISSION_REWARDS,
  SEASONS,
} from "@boardgames/core/games/parks/types";

interface SeasonMissionsPanelProps {
  view: ParksPlayerView;
  myIndex: number;
}

const SEASON_ICON: Record<Season, string> = {
  spring: "\uD83C\uDF31", // seedling
  summer: "\u2600\uFE0F", // sun
  fall: "\uD83C\uDF42", // maple leaf
};

const REWARD_ICON: Record<SeasonMission, string> = {
  "spring-most-f": "\uD83C\uDFDE\uFE0F", // park (reserve)
  "spring-most-m": "\uD83D\uDCF8", // photo
  "spring-most-w": "\uD83D\uDCA7", // water
  "spring-most-s": "\uD83E\uDED9", // canteen
  "summer-most-cost": "\uD83C\uDFB2", // die
  "summer-most-instant-parks": "\uD83C\uDFB2",
  "summer-most-a": "\uD83C\uDFB2",
  "summer-most-canteens": "\uD83C\uDFB2",
  "fall-most-s": "\u2B50", // star
  "fall-most-f": "\u2B50",
  "fall-most-m": "\u2B50",
  "fall-most-w": "\u2B50",
};

const REWARD_SHORT: Record<SeasonMission, string> = {
  "spring-most-f": "+2🦋",
  "spring-most-m": "Photo",
  "spring-most-w": "Water",
  "spring-most-s": "Canteen",
  "summer-most-cost": "Die ×2",
  "summer-most-instant-parks": "Die ×2",
  "summer-most-a": "Die ×2",
  "summer-most-canteens": "Die ×2",
  "fall-most-s": "+3 PT",
  "fall-most-f": "+3 PT",
  "fall-most-m": "+3 PT",
  "fall-most-w": "+3 PT",
};

function metricFor(view: ParksPlayerView, mission: SeasonMission, playerIdx: number): number {
  const p = view.players[playerIdx];
  const stats = p.seasonStats;
  switch (mission) {
    case "spring-most-f":
      return stats.resourcesGained.F;
    case "spring-most-m":
      return stats.resourcesGained.M;
    case "spring-most-w":
      return stats.resourcesGained.W;
    case "spring-most-s":
      return stats.resourcesGained.S;
    case "summer-most-cost": {
      let total = 0;
      for (const c of p.canteens) {
        total += c.effect === "2W" || c.effect === "2S" ? 2 : 1;
      }
      return total;
    }
    case "summer-most-instant-parks":
      return stats.parksWithInstantRewardVisited;
    case "summer-most-a":
      return stats.resourcesGained.A;
    case "summer-most-canteens":
      return stats.canteensTaken;
    case "fall-most-s":
    case "fall-most-f":
    case "fall-most-m":
    case "fall-most-w": {
      const r =
        mission === "fall-most-s"
          ? "S"
          : mission === "fall-most-f"
            ? "F"
            : mission === "fall-most-m"
              ? "M"
              : "W";
      let total = 0;
      for (const park of p.parks) total += park.cost[r];
      return total;
    }
  }
}

function seasonStatus(view: ParksPlayerView, season: Season): "current" | "upcoming" | "done" {
  const cur = SEASONS.indexOf(view.season);
  const idx = SEASONS.indexOf(season);
  if (idx < cur) return "done";
  if (idx === cur) return "current";
  return "upcoming";
}

export default function SeasonMissionsPanel({ view, myIndex }: SeasonMissionsPanelProps) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-stone-900/40 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          Missions
        </span>
        <span
          className="text-[9px] italic text-stone-500"
          title="Strict majority each season — ties earn nothing"
        >
          {"\u2139\uFE0F"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {SEASONS.map((season) => {
          const mission = view.selectedSeasonMissions[season];
          const status = seasonStatus(view, season);
          const myMetric = metricFor(view, mission, myIndex);
          const oppMetric = metricFor(view, mission, 1 - myIndex);
          const leader = myMetric > oppMetric ? "me" : oppMetric > myMetric ? "opp" : "tie";
          const pastResult =
            status === "done"
              ? view.seasonMissionResults.find((r) => r.season === season)?.results[0]
              : null;

          const containerCls =
            status === "current"
              ? "border-amber-500/60 bg-amber-950/20"
              : status === "done"
                ? "border-stone-700/40 bg-stone-900/40 opacity-60"
                : "border-stone-700/40 bg-stone-900/20";

          return (
            <div
              key={season}
              title={`${SEASON_LABELS[season]} · ${SEASON_MISSION_LABELS[mission]} → ${SEASON_MISSION_REWARDS[mission]}`}
              className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 ${containerCls}`}
            >
              <span className="text-sm" aria-hidden>
                {SEASON_ICON[season]}
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[10px] font-semibold text-stone-200">
                  {SEASON_MISSION_LABELS[mission]}
                </span>
                <span className="text-[9px] italic text-stone-500">
                  {REWARD_ICON[mission]} {REWARD_SHORT[mission]}
                </span>
              </div>
              {status === "current" && (
                <div className="flex items-center gap-0.5 text-[10px]" title="You / Opponent">
                  <span
                    className={`rounded px-1 font-bold tabular-nums ${
                      leader === "me" ? "bg-cyan-700 text-white" : "bg-stone-700 text-stone-300"
                    }`}
                  >
                    {myMetric}
                  </span>
                  <span className="text-stone-500">/</span>
                  <span
                    className={`rounded px-1 font-bold tabular-nums ${
                      leader === "opp" ? "bg-amber-700 text-white" : "bg-stone-700 text-stone-300"
                    }`}
                  >
                    {oppMetric}
                  </span>
                </div>
              )}
              {pastResult && (
                <span
                  className={`rounded px-1 text-[9px] font-bold ${
                    pastResult.winner === -1
                      ? "bg-stone-700 text-stone-400"
                      : pastResult.winner === myIndex
                        ? "bg-cyan-700 text-white"
                        : "bg-amber-700 text-white"
                  }`}
                  title={
                    pastResult.winner === -1
                      ? "no winner"
                      : pastResult.winner === myIndex
                        ? "won by you"
                        : "won by opponent"
                  }
                >
                  {pastResult.winner === -1 ? "—" : pastResult.winner === myIndex ? "You" : "Opp"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
