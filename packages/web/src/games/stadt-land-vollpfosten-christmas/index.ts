import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "stadt-land-vollpfosten-christmas",
  displayTitle: "Stadt Land Vollpfosten: Christmas Edition",
  bggId: 401283,
  accentHex: accent.hex,
  // Unranked on BGG (only 11 ratings). Override with (mean − 1σ) of
  // averageRating across our 2022–2024 peer cohort. averageWeight ≈ 1.1
  // matches the light-party-game peer cohort (Codenames, Just One, UNO).
  bggOverrides: { averageRating: 6.96, averageWeight: 1.1 },
} satisfies GameModule;
