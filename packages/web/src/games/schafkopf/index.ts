import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "schafkopf",
  bggId: 6817,
  accentHex: accent.hex,
  family: { id: "card-games", variant: "Schafkopf" },
} satisfies GameModule;
