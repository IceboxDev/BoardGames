import type { PassionId } from "@boardgames/core/games/parks/types";

const passionImages = import.meta.glob<{ default: string }>("./assets/passions/*.png", {
  eager: true,
});

export function getPassionImageUrl(id: PassionId): string | null {
  const key = `./assets/passions/${id}.png`;
  return passionImages[key]?.default ?? null;
}
