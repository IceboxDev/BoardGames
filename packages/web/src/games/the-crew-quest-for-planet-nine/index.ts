import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "the-crew-quest-for-planet-nine",
  bggId: 284083,
  accentHex: accent.hex,
  family: { id: "the-crew", canonical: true, name: "The Crew", variant: "Quest for Planet Nine" },
} satisfies GameModule;
