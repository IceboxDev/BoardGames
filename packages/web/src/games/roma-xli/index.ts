import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "roma-xli",
  title: "Roma XLI",
  bggId: 457060,
  bgg,
  accentHex: accent.hex,
  family: { id: "dark-cities", variant: "Roma XLI" },
} satisfies GameModule;
