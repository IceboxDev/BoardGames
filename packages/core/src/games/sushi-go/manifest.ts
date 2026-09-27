import { z } from "zod";
import { defineManifest } from "../../machines/manifest";

// Nash and Minimax solve the two-player game only; at larger tables every AI
// seat plays Random, so only Random is offered there.
export const sushiGoManifest = defineManifest({
  slug: "sushi-go",
  seats: { min: 2, max: 5 },
  strategies: [
    {
      id: "random",
      label: "Random",
      description: "Picks a random card each turn.",
      difficulty: "Easy",
    },
    {
      id: "minimax",
      label: "Minimax",
      description: "Classic sequential search with alpha-beta pruning. Strong but exploitable.",
      difficulty: "Hard",
      seats: { max: 2 },
    },
    {
      id: "nash",
      label: "Nash Equilibrium",
      description:
        "Game-theoretically optimal. Solves each turn as a simultaneous-move zero-sum game.",
      difficulty: "Expert",
      seats: { max: 2 },
    },
  ],
  defaultStrategy: "nash",
  config: z.object({}),
});
