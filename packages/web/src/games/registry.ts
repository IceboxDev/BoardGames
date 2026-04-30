import placeholderThumbnail from "./_placeholder-thumbnail.svg?url";
import type { GameDefinition, GameModule } from "./types";

const modules = import.meta.glob<{ default: GameModule }>("./*/index.ts", {
  eager: true,
});

// Collect every game's thumbnail URL (if present). Pandemic ships at
// `assets/img/thumbnail.png`; everyone else uses `assets/thumbnail.png`.
const thumbnailModules = import.meta.glob<string>(
  ["./*/assets/thumbnail.png", "./*/assets/img/thumbnail.png"],
  { eager: true, query: "?url", import: "default" },
);

const thumbnailBySlug: Record<string, string> = {};
for (const [path, url] of Object.entries(thumbnailModules)) {
  const m = path.match(/^\.\/([^/]+)\/assets\//);
  if (m) thumbnailBySlug[m[1]] = url;
}

export const games: GameDefinition[] = Object.values(modules)
  .map((m) => ({
    ...m.default,
    thumbnail: thumbnailBySlug[m.default.slug] ?? placeholderThumbnail,
  }))
  .sort((a, b) => a.title.localeCompare(b.title));
