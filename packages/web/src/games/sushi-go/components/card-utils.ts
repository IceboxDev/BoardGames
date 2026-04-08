import type { CardType } from "@boardgames/core/games/sushi-go/types";

const cardImages = import.meta.glob<{ default: string }>("../assets/cards/*.png", {
  eager: true,
});

export function getCardImageUrl(type: CardType): string {
  const key = `../assets/cards/${type}.png`;
  return cardImages[key]?.default ?? "";
}

export type CardSize = "sm" | "tableau" | "md" | "hand";

export const SIZE_CLASSES: Record<CardSize, string> = {
  sm: "h-14 w-10",
  tableau: "h-[4.5rem] w-[3.125rem]",
  md: "h-24 w-16",
  hand: "w-full aspect-[2/3]",
};
