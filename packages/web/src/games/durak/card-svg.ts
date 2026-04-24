import type { Rank, Suit } from "@boardgames/core/games/durak/types";

const svgModules = import.meta.glob<string>("../../assets/playing-cards/*.svg", {
  eager: true,
  import: "default",
});

const RANK_FILE_NAMES: Record<Rank, string> = {
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "jack",
  12: "queen",
  13: "king",
  14: "ace",
};

export function getCardSvg(rank: Rank, suit: Suit): string {
  const key = `../../assets/playing-cards/${RANK_FILE_NAMES[rank]}_of_${suit}.svg`;
  return svgModules[key] ?? "";
}
