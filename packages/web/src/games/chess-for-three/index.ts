import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "chess-for-three",
  displayTitle: "Chess for Three",
  bggId: 27339,
  accentHex: accent.hex,
  family: { id: "chess", variant: "For Three" },
} satisfies GameModule;
