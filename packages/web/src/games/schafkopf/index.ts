import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "schafkopf",
  title: "Schafkopf",
  bggId: 6817,
  bgg,
  accentHex: accent.hex,
  family: { id: "card-games", variant: "Schafkopf" },
} satisfies GameModule;
