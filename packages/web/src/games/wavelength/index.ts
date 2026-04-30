import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "wavelength",
  title: "Wavelength",
  bggId: 262543,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
