import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "gloomhaven-jaws-of-the-lion",
  title: "Gloomhaven: Jaws of the Lion",
  bggId: 291457,
  bgg,
  accentHex: accent.hex,
  family: { id: "gloomhaven", variant: "Jaws of the Lion" },
} satisfies GameModule;
