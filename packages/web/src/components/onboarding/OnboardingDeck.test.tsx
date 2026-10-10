import { ONBOARDING_CARDS } from "@boardgames/core/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TOUR_CARDS } from "./cards";
import { OnboardingDeck } from "./OnboardingDeck";

// The welcome tour: walkable by buttons and keys, practised on the real
// calendar cell / RSVP switch / vote buttons, and reporting how far the
// member got whether they finish, start marking, or close early.

function renderDeck() {
  const onClose = vi.fn();
  const onStart = vi.fn();
  render(<OnboardingDeck firstName="Ada" onClose={onClose} onStart={onStart} />);
  return { onClose, onStart };
}

/** Walk forward to a card and wait until its body has slid in. */
async function goTo(user: ReturnType<typeof userEvent.setup>, title: string) {
  const card = TOUR_CARDS.find((c) => c.title === title);
  if (!card) throw new Error(`no card titled ${title}`);
  for (let i = 0; i < TOUR_CARDS.length && !screen.queryByRole("heading", { name: title }); i++) {
    await user.click(screen.getByRole("button", { name: /Let's go|Next/ }));
  }
  await waitFor(() => expect(document.querySelector(`[data-card="${card.id}"]`)).not.toBeNull());
}

describe("OnboardingDeck", () => {
  it("has as many cards as the server counts", () => {
    expect(TOUR_CARDS).toHaveLength(ONBOARDING_CARDS);
  });

  it("greets by name and walks forward and back by buttons and arrow keys", async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(screen.getByText(/Hi Ada!/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Let's go" }));
    expect(screen.getByRole("heading", { name: "1 · Mark when you're free" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("heading", { name: "Hot days" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("heading", { name: "1 · Mark when you're free" }),
    ).toBeInTheDocument();
  });

  it("ticks 'Try it' once a real day is made Can and another Maybe", async () => {
    const user = userEvent.setup();
    renderDeck();
    await goTo(user, "1 · Mark when you're free");
    expect(screen.getByText(/Try it: Make one day Can and one Maybe/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^12/ }));
    expect(screen.getByRole("button", { name: /^12 — can/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /^13/ }));
    await user.click(screen.getByRole("button", { name: /^13/ }));
    expect(screen.getByRole("button", { name: /^13 — maybe/ })).toBeInTheDocument();
    expect(screen.getByText("Nice — that's it!")).toBeInTheDocument();
  });

  it("practises the RSVP switch and the vote buttons", async () => {
    const user = userEvent.setup();
    renderDeck();
    await goTo(user, "Going or not?");
    await user.click(screen.getByRole("button", { name: /Not going/ }));
    await user.click(screen.getByRole("button", { name: /Going/ }));
    expect(screen.getByText("Nice — that's it!")).toBeInTheDocument();

    await goTo(user, "3 · Vote for games");
    await user.click(screen.getByRole("button", { name: /^Hype:/ }));
    expect(screen.getByRole("button", { name: /^Hype:/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Nice — that's it!")).toBeInTheDocument();
  });

  it("reports a skip with how far the member got", async () => {
    const user = userEvent.setup();
    const first = renderDeck();
    await user.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(first.onClose).toHaveBeenCalledWith("skipped", 1);
  });

  it("finishes on the last card — Done, or straight to marking days", async () => {
    const user = userEvent.setup();
    const { onClose, onStart } = renderDeck();
    await goTo(user, "That's it!");
    await user.click(screen.getByRole("button", { name: "Mark my first days" }));
    expect(onStart).toHaveBeenCalledWith(ONBOARDING_CARDS);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledWith("finished", ONBOARDING_CARDS);
  });
});
