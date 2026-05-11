import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "codenames",
  bggId: 178900,
  accentHex: accent.hex,
  family: { id: "codenames", canonical: true, variant: "Original" },
  bggOverrides: { maxPlayers: "infinity" },
} satisfies GameModule;
