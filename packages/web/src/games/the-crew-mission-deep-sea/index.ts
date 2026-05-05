import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "the-crew-mission-deep-sea",
  title: "The Crew: Mission Deep Sea",
  bggId: 324856,
  bgg,
  accentHex: accent.hex,
  family: { id: "the-crew", variant: "Mission Deep Sea" },
} satisfies GameModule;
