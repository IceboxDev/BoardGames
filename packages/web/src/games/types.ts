import type { ComponentType, LazyExoticComponent } from "react";

export interface AccentColor {
  border: string;
  hoverBg: string;
  arrow: string;
  gradient: string;
}

export interface GameDefinition {
  slug: string;
  title: string;
  description: string;
  /** Short subtitle for the mode-picker screen (must fit one line). Falls back to `description`. */
  subtitle?: string;
  thumbnail?: string;
  backgroundImage?: string;
  accentColor: AccentColor;
  component: LazyExoticComponent<ComponentType>;
  mode: "remote" | "local";
  /** Label for the solo/AI button on the mode-picker (e.g. "Play vs AI", "Solo", "Trainer"). */
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
