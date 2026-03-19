import type { GameSessionAdapter } from "./types.ts";

const adapters = new Map<string, GameSessionAdapter>();

export function registerAdapter(slug: string, adapter: GameSessionAdapter): void {
  adapters.set(slug, adapter);
}

export function getAdapter(slug: string): GameSessionAdapter | undefined {
  return adapters.get(slug);
}

export function getRegisteredSlugs(): string[] {
  return [...adapters.keys()];
}
