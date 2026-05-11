import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "gloomhaven-jaws-of-the-lion",
  bggId: 291457,
  accentHex: accent.hex,
  family: { id: "gloomhaven", variant: "Jaws of the Lion" },
} satisfies GameModule;
