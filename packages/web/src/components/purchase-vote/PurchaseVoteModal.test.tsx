import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { games } from "../../games/registry";
import { PurchaseVoteModalView } from "./PurchaseVoteModal";

// The voting screen is deliberate: picks are local, nothing saves until
// Submit, and a saved confirmation follows. Worth pinning: the dirty-check
// gating on Submit, the Submit/Update label split, local toggling through
// the callback, and the saved screen's content.

const CANDIDATES = games.slice(0, 4);

function renderModal(overrides: Partial<Parameters<typeof PurchaseVoteModalView>[0]> = {}) {
  const onToggle = vi.fn();
  const onSubmit = vi.fn();
  render(
    <PurchaseVoteModalView
      candidates={CANDIDATES}
      selected={[]}
      savedVotes={[]}
      voterCount={4}
      requiredVoters={8}
      view="picking"
      pollClosed={false}
      saving={false}
      error={null}
      onToggle={onToggle}
      onSubmit={onSubmit}
      onClose={() => {}}
      {...overrides}
    />,
  );
  return { onToggle, onSubmit };
}

describe("PurchaseVoteModalView", () => {
  it("explains the flow and disables Submit with no picks", () => {
    renderModal();
    expect(screen.getByText("Vote for the next game purchase")).toBeInTheDocument();
    expect(screen.getByText(/Pick up to 3 games, then submit/)).toBeInTheDocument();
    expect(screen.getByText(/4 of 8 players have voted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit votes" })).toBeDisabled();
  });

  it("toggles a pick on the centered card through the callback, without saving", () => {
    const { onToggle, onSubmit } = renderModal();
    const pick = screen
      .getAllByRole("button", { name: /^pick$/i })
      .find((b) => !b.hasAttribute("disabled"));
    expect(pick).toBeDefined();
    if (pick) fireEvent.click(pick);
    expect(onToggle).toHaveBeenCalledWith(expect.any(String));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enables Submit once picks differ from the saved set", () => {
    const slug = CANDIDATES[0]?.slug ?? "";
    renderModal({ selected: [slug] });
    expect(screen.getByText("2 picks left")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit votes" });
    expect(submit).toBeEnabled();
  });

  it("disables Submit when the selection matches what is already saved", () => {
    const slug = CANDIDATES[0]?.slug ?? "";
    renderModal({ selected: [slug], savedVotes: [slug] });
    expect(screen.getByRole("button", { name: "Update votes" })).toBeDisabled();
  });

  it("allows withdrawing all votes — clearing a saved set is a change", () => {
    const slugs = CANDIDATES.slice(0, 2).map((g) => g.slug);
    const { onSubmit } = renderModal({ selected: [], savedVotes: slugs });
    const withdraw = screen.getByRole("button", { name: "Withdraw votes" });
    expect(withdraw).toBeEnabled();
    fireEvent.click(withdraw);
    expect(onSubmit).toHaveBeenCalled();
  });

  it("labels the action Update when votes were saved before", () => {
    const slugs = CANDIDATES.slice(0, 2).map((g) => g.slug);
    renderModal({ selected: [...slugs, CANDIDATES[2]?.slug ?? ""], savedVotes: slugs });
    expect(screen.getByRole("button", { name: "Update votes" })).toBeEnabled();
  });

  it("shows the saved confirmation with picks and participation", () => {
    const slugs = CANDIDATES.slice(0, 3).map((g) => g.slug);
    renderModal({ view: "saved", selected: slugs, savedVotes: slugs });
    expect(screen.getByText("Your votes are in")).toBeInTheDocument();
    // Appears in both the subheader and the confirmation body.
    expect(screen.getAllByText(/4 of 8 players have voted/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    for (const g of CANDIDATES.slice(0, 3)) {
      expect(screen.getByText(g.title)).toBeInTheDocument();
    }
  });

  it("announces a poll the player's own submit just closed", () => {
    const slugs = CANDIDATES.slice(0, 3).map((g) => g.slug);
    renderModal({ view: "saved", selected: slugs, savedVotes: slugs, pollClosed: true });
    expect(screen.getByText(/the vote is closed and the winner is on the way/)).toBeInTheDocument();
  });
});
