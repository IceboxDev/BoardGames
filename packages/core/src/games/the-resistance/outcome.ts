import type { TeamsOutcome } from "../../machines/outcome";
import type { Role } from "./record";

/** Team 0 = the Resistance, team 1 = the Spies. */
export const TEAM_OF_ROLE: Record<Role, number> = { resistance: 0, spy: 1 };

export function resistanceOutcome(roles: readonly Role[], winner: Role): TeamsOutcome {
  return {
    kind: "teams",
    teamOf: roles.map((r) => TEAM_OF_ROLE[r]),
    winningTeam: TEAM_OF_ROLE[winner],
  };
}
