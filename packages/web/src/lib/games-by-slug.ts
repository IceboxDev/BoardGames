import { games } from "../games/registry.ts";
import type { GameDefinition } from "../games/types.ts";

// Shared slug → registry-entry lookup. The registry is static, so build the map
// once at module load rather than per-render. Used by every profile surface
// that renders a game from a stored slug (library/favorites/wishlist grids,
// match-list thumbnails).

const bySlug = new Map<string, GameDefinition>(games.map((g) => [g.slug, g]));

export function resolveGame(slug: string | null | undefined): GameDefinition | undefined {
  return slug ? bySlug.get(slug) : undefined;
}
