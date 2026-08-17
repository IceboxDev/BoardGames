import type { SkillHighlightWire } from "@boardgames/core/protocol";
import { StarIcon } from "../../icons";
import trophyGold from "./assets/trophy-1.svg";
import trophySilver from "./assets/trophy-2.svg";
import trophyBronze from "./assets/trophy-3.svg";

// The podium trophy shared by the intro modal's banner and the stats page's
// claim card: the group's own gold/silver/bronze trophy artwork for ranks
// 1–3, an accent star disc for non-podium highlights.

const TROPHIES: Record<number, string> = { 1: trophyGold, 2: trophySilver, 3: trophyBronze };

function medalRank(h: SkillHighlightWire): number | null {
  if (h.kind === "trait-first" || h.kind === "game-first") return 1;
  if (h.kind === "trait-top3") return h.rank;
  return null;
}

export function Medal({
  highlight,
  size = "md",
}: {
  highlight: SkillHighlightWire;
  size?: "sm" | "md" | "lg";
}) {
  const rank = medalRank(highlight);
  const box = size === "lg" ? "h-20 w-20" : size === "md" ? "h-16 w-16" : "h-12 w-12";
  const trophy = rank === null ? undefined : TROPHIES[rank];
  if (trophy) {
    return (
      <img
        src={trophy}
        alt={`${rank === 1 ? "Gold" : rank === 2 ? "Silver" : "Bronze"} trophy`}
        className={`${box} shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]`}
      />
    );
  }
  const icon = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-300 to-accent-500 text-surface-950`}
    >
      <StarIcon className={icon} />
    </div>
  );
}
