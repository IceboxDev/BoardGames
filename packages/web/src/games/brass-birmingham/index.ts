import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "brass-birmingham",
  title: "Brass: Birmingham",
  bggId: 224517,
  bgg,
  accentHex: accent.hex,
  family: { id: "brass", canonical: true, name: "Brass", variant: "Birmingham" },
} satisfies GameModule;
