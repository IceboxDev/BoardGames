import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "codenames-pictures",
  bggId: 198773,
  accentHex: accent.hex,
  family: { id: "codenames", variant: "Pictures" },
  bggOverrides: { maxPlayers: "infinity" },
} satisfies GameModule;
