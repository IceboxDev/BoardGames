import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "blood-on-the-clocktower",
  title: "Blood on the Clocktower",
  bggId: 240980,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
