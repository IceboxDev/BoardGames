import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "roma-xli",
  bggId: 457060,
  accentHex: accent.hex,
  // Unranked on BGG (only 6 ratings). Override with (mean − 1σ) of
  // averageRating across our 2025–2027 peer cohort.
  bggOverrides: { averageRating: 7.32 },
  family: { id: "dark-cities", variant: "Roma XLI" },
} satisfies GameModule;
