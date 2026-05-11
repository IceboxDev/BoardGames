import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "hell-of-a-deal",
  bggId: 463605,
  accentHex: accent.hex,
  // Unranked on BGG (only 14 ratings). Override with (mean − 1σ) of
  // averageRating across our 2025–2027 peer cohort.
  bggOverrides: { averageRating: 7.32 },
} satisfies GameModule;
