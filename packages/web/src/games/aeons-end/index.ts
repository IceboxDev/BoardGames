import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "aeons-end",
  title: "Aeon's End",
  bggId: 191189,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
