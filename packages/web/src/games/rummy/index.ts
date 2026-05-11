import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "rummy",
  bggId: 15878,
  accentHex: accent.hex,
  family: { id: "card-games", canonical: true, name: "Card Games", variant: "Rummy" },
} satisfies GameModule;
