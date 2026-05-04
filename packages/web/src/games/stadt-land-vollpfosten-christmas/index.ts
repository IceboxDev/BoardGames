import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "stadt-land-vollpfosten-christmas",
  title: "Stadt Land Vollpfosten: Christmas Edition",
  bggId: 401283,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
