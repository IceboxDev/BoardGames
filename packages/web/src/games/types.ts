import type { ComponentType, LazyExoticComponent } from "react";

/**
 * BoardGameGeek metadata baked in at dev time via `pnpm fetch-bgg`. Each game
 * folder ships a `bgg.json` matching this shape; the registry imports it so
 * the runtime never hits BGG.
 */
export type BggGame = {
  id: number;
  name: string;
  description: string;
  yearPublished: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  minAge: number | null;
  categories: string[];
  mechanics: string[];
  designers: string[];
  artists: string[];
  publishers: string[];
  averageRating: number | null;
  averageWeight: number | null;
  numRatings: number | null;
};

export interface GameDefinition {
  slug: string;
  /** User-supplied display name. */
  title: string;
  /** BoardGameGeek XML API2 ID — the catalog primary key. */
  bggId: number;
  /** BGG metadata bundled in at dev time. */
  bgg: BggGame;
  /**
   * Imported thumbnail asset URL. Attached by the registry from the game's
   * `assets/thumbnail.png` when present, or a shared placeholder when absent —
   * never imported directly from a game's `index.ts`.
   */
  thumbnail: string;
  /** Dominant accent color extracted at build time from the thumbnail. */
  accentHex: string;
  /** Optional full-page backdrop for the game's own screens. */
  backgroundImage?: string;
  /** Online-playable component. Omit for catalog-only games. */
  component?: LazyExoticComponent<ComponentType>;
  /** Multiplayer architecture for the playable component. */
  mode?: "remote" | "local";
  /** Label for the solo/AI button on the mode-picker (e.g. "Play vs AI", "Trainer"). */
  soloLabel?: string;
  /** Whether the game has a match history screen accessible from the mode-picker. */
  hasMatchHistory?: boolean;
  /** Whether the game has a tournament screen accessible from the mode-picker. */
  hasTournament?: boolean;
  /** AI strategies for the tournament grid. Required when `hasTournament` is true. */
  tournamentStrategies?: { id: string; label: string }[];
  /** Whether to show average score diff in tournament grid cells (default true). */
  tournamentShowScoreDiff?: boolean;
  /** URL to a PDF file with the game rules, shown from the mode-picker. */
  rulesUrl?: string;
}

/**
 * Shape exported by each game's `index.ts`. The registry attaches `thumbnail`
 * by globbing each folder's `assets/thumbnail.png`, so individual games never
 * statically import their own thumbnail — that way a missing PNG cannot break
 * the build.
 */
export type GameModule = Omit<GameDefinition, "thumbnail">;
