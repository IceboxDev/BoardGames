import type { Role } from "./types";

export interface RoleDef {
  id: Role;
  name: string;
  pawnColor: string;
  abilities: string[];
}

export const ROLE_DEFS: RoleDef[] = [
  {
    id: "contingency_planner",
    name: "Contingency Planner",
    pawnColor: "#00bcd4",
    abilities: [
      "Store 1 Event card from discard (action)",
      "Stored card removed from game when played",
    ],
  },
  {
    id: "dispatcher",
    name: "Dispatcher",
    pawnColor: "#e91e63",
    abilities: [
      "Move another player's pawn to a city with any other pawn (action)",
      "Move another player's pawn as if it were yours",
    ],
  },
  {
    id: "medic",
    name: "Medic",
    pawnColor: "#ff9800",
    abilities: [
      "Remove ALL cubes of one color on Treat Disease",
      "Auto-remove cured disease cubes when entering a city",
    ],
  },
  {
    id: "operations_expert",
    name: "Operations Expert",
    pawnColor: "#4caf50",
    abilities: [
      "Build research station without discarding a card (action)",
      "Once per turn: discard any card to move from a station to any city",
    ],
  },
  {
    id: "quarantine_specialist",
    name: "Quarantine Specialist",
    pawnColor: "#2e7d32",
    abilities: [
      "Prevent disease cube placement and outbreaks in your city and all connected cities",
    ],
  },
  {
    id: "scientist",
    name: "Scientist",
    pawnColor: "#f5f5f5",
    abilities: ["Need only 4 (not 5) same-color cards to Discover a Cure"],
  },
  {
    id: "researcher",
    name: "Researcher",
    pawnColor: "#795548",
    abilities: ["Give any City card when sharing knowledge (not just the matching city card)"],
  },
];

export function getRoleDef(role: Role): RoleDef {
  const def = ROLE_DEFS.find((r) => r.id === role);
  if (!def) throw new Error(`Unknown role: ${role}`);
  return def;
}
