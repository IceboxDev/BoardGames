import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParticipantPicker } from "./ParticipantPicker";

const USERS = [
  { id: "m1", name: "Mantas" },
  { id: "m2", name: "Paul" },
  { id: "g1", name: "Diego", guest: true },
  { id: "g2", name: "Isabel", guest: true },
];

describe("ParticipantPicker", () => {
  it("lays out members and folds the guests behind a count chip", () => {
    render(<ParticipantPicker users={USERS} selectedIds={[]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Mantas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paul" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Diego" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Isabel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 guests" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps a guest who is in the match visible while folded", () => {
    render(<ParticipantPicker users={USERS} selectedIds={["g2"]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Isabel" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Diego" })).not.toBeInTheDocument();
  });

  it("unfolds the rest of the guests and lets one be picked", async () => {
    const onChange = vi.fn();
    render(<ParticipantPicker users={USERS} selectedIds={["m1"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "2 guests" }));
    expect(screen.getByRole("button", { name: "2 guests" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Diego" }));
    expect(onChange).toHaveBeenCalledWith([
      { userId: "m1", displayName: "Mantas" },
      { userId: "g1", displayName: "Diego" },
    ]);
  });

  it("shows no guests chip when everyone is a member", () => {
    render(<ParticipantPicker users={USERS.slice(0, 2)} selectedIds={[]} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /guest/ })).not.toBeInTheDocument();
  });
});
