import type { GameDefinition } from "./types";

const modules = import.meta.glob<{ default: GameDefinition }>("./*/index.ts", {
  eager: true,
});

export const games: GameDefinition[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.title.localeCompare(b.title));
