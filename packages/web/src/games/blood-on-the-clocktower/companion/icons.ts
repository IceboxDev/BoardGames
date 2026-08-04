// Character token art (official BotC icons, © The Pandemonium Institute),
// bundled as 256px webp per CharacterId at ../assets/icons/<id>.webp.

import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";

const ICON_URLS = import.meta.glob<string>("../assets/icons/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

export function characterIconUrl(id: CharacterId): string | undefined {
  return ICON_URLS[`../assets/icons/${id}.webp`];
}
