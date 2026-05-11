import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "brass-birmingham",
  bggId: 224517,
  accentHex: accent.hex,
  family: { id: "brass", canonical: true, name: "Brass", variant: "Birmingham" },
} satisfies GameModule;
