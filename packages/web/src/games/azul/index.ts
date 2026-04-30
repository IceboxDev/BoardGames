import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "azul",
  title: "Azul",
  bggId: 230802,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
