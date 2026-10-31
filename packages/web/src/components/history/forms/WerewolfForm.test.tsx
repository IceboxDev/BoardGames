import type { MatchOutcomeTeams } from "@boardgames/core/history/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { WerewolfForm } from "./WerewolfForm";

// The Minion sits on the werewolf team but wins by its own rule: voting it out
// doesn't kill a Werewolf. The form keeps it apart from the Werewolves so the
// winner comes out right, and stores it as role "Minion" on the werewolf team.

const USERS = ["Mantas", "Paul", "Juliane"].map((name, i) => ({ id: `u${i + 1}`, name }));

// biome-ignore lint/style/useComponentExportOnlyModules: test-local harness; never exported
function Harness({
  initial,
  onValue,
}: {
  initial: MatchOutcomeTeams;
  onValue: (v: MatchOutcomeTeams) => void;
}) {
  const [value, setValue] = useState<MatchOutcomeTeams>(initial);
  return (
    <WerewolfForm
      users={USERS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const member = (i: number, role: string) => ({
  userId: USERS[i].id,
  displayName: USERS[i].name,
  role,
});

/** The winning teams' first-member roles, e.g. ["Werewolf"]. */
const winnerRoles = (v: MatchOutcomeTeams | null) =>
  v?.winnerTeamIndices.map((i) => v.teams[i]?.members[0]?.role);

/** The "Voted out" chip — the last button with the player's name (the picker's comes first). */
const votedOut = (name: string) => screen.getAllByRole("button", { name }).at(-1) as HTMLElement;

describe("WerewolfForm — Minion", () => {
  it("voting out the Minion while a Werewolf lives is a werewolf win", async () => {
    let latest = null as MatchOutcomeTeams | null;
    render(
      <Harness
        initial={{
          kind: "teams",
          teams: [
            { members: [member(0, "Village")] },
            { members: [member(1, "Werewolf"), member(2, "Minion")] },
          ],
          winnerTeamIndices: [1],
        }}
        onValue={(v) => {
          latest = v;
        }}
      />,
    );
    await userEvent.click(votedOut("Juliane"));
    expect(winnerRoles(latest)).toEqual(["Werewolf"]);
    expect(latest?.teams[1]?.members.map((m) => m.role)).toEqual(["Werewolf", "Minion"]);
  });

  it("with no Werewolf among the players, a no-kill round is a village win", async () => {
    let latest = null as MatchOutcomeTeams | null;
    render(
      <Harness
        initial={{
          kind: "teams",
          teams: [
            { members: [member(0, "Village"), member(1, "Village")] },
            { members: [member(2, "Minion")] },
          ],
          winnerTeamIndices: [0],
        }}
        onValue={(v) => {
          latest = v;
        }}
      />,
    );
    // Voting the village out and back in re-commits the no-kill state.
    await userEvent.click(votedOut("Paul"));
    expect(winnerRoles(latest)).toEqual(["Minion"]);
    await userEvent.click(votedOut("Paul"));
    expect(winnerRoles(latest)).toEqual(["Village"]);
    // The Minion reads back as the Minion, not as a Werewolf.
    expect(screen.getAllByRole("button", { name: "Minion", pressed: true })).toHaveLength(1);
  });
});
