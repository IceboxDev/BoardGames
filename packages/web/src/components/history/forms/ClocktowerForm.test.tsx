import type { MatchOutcomeTeams } from "@boardgames/core/history/types";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ClocktowerForm } from "./ClocktowerForm";

// Travellers are the one Clocktower character whose side is not implied by
// the character: the Storyteller assigns it. The form records that choice as
// the team the member sits in, and reads it back the same way on edit.

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
    <ClocktowerForm
      users={USERS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const member = (i: number, role?: string) => ({
  userId: USERS[i].id,
  displayName: USERS[i].name,
  ...(role ? { role } : {}),
});

function pickCharacter(name: string, character: string) {
  fireEvent.change(screen.getByLabelText(`${name} — character`), { target: { value: character } });
}

describe("ClocktowerForm — Travellers", () => {
  it("offers the edition's Travellers and defaults a picked one to the good side", () => {
    let latest: MatchOutcomeTeams | null = null;
    render(
      <Harness
        initial={{
          kind: "teams",
          teams: [{ members: [member(0, "Empath"), member(1)] }, { members: [member(2, "Imp")] }],
          winnerTeamIndices: [],
        }}
        onValue={(v) => {
          latest = v;
        }}
      />,
    );
    expect(screen.getAllByRole("option", { name: "Gunslinger" }).length).toBeGreaterThan(0);
    pickCharacter("Paul", "Gunslinger");

    expect(screen.getByText("1 traveller")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paul travels as good" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const good = (latest as MatchOutcomeTeams | null)?.teams[0].members.map((m) => m.role);
    expect(good).toEqual(["Empath", "Gunslinger"]);
  });

  it("moves a Traveller to the evil team when the Storyteller's call is recorded", async () => {
    let latest: MatchOutcomeTeams | null = null;
    render(
      <Harness
        initial={{
          kind: "teams",
          teams: [
            { members: [member(0, "Empath"), member(1, "Gunslinger")] },
            { members: [member(2, "Imp")] },
          ],
          winnerTeamIndices: [],
        }}
        onValue={(v) => {
          latest = v;
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Paul travels as evil" }));
    // Rows are kept in display-name order (Juliane, Mantas, Paul), so the
    // evil team lists Juliane's Imp before Paul's Gunslinger.
    const teams = (latest as MatchOutcomeTeams | null)?.teams;
    expect(teams?.[0].members.map((m) => m.role)).toEqual(["Empath"]);
    expect(teams?.[1].members.map((m) => m.role)).toEqual(["Imp", "Gunslinger"]);
    // Read back from the wire on the next render: the side is the team.
    expect(screen.getByRole("button", { name: "Paul travels as evil" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Residents' counts leave the Traveller out; the winner buttons are untouched.
    expect(screen.getByText("Good 1")).toBeInTheDocument();
    expect(screen.getByText("Evil 1")).toBeInTheDocument();
  });

  it("swapping a Traveller for a resident drops the recorded side", () => {
    let latest: MatchOutcomeTeams | null = null;
    render(
      <Harness
        initial={{
          kind: "teams",
          teams: [
            { members: [member(0, "Empath")] },
            { members: [member(1, "Gunslinger"), member(2, "Imp")] },
          ],
          winnerTeamIndices: [],
        }}
        onValue={(v) => {
          latest = v;
        }}
      />,
    );
    pickCharacter("Paul", "Librarian");
    expect(screen.queryByRole("button", { name: /Paul travels as/ })).toBeNull();
    const teams = (latest as MatchOutcomeTeams | null)?.teams;
    expect(teams?.[0].members.map((m) => m.role)).toEqual(["Empath", "Librarian"]);
    expect(teams?.[1].members.map((m) => m.role)).toEqual(["Imp"]);
  });
});
