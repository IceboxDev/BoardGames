import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "bandit",
  bggId: 450261,
  accentHex: accent.hex,
  // Unranked on BGG (only 7 ratings → noisy averageRating). Override with
  // (mean − 1σ) of averageRating across our 2024–2026 peer cohort: assumes
  // an unproven game tends to land in the lower tail of its release-year
  // distribution as more data comes in.
  bggOverrides: { averageRating: 7.9 },
} satisfies GameModule;
