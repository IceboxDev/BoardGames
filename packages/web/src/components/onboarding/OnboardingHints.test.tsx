import type { HintId } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../../lib/query-keys";

// The hint engine: one hint at a time, the earliest due among those whose
// control is on screen; a dismissal is saved and the next one follows; and
// nothing shows while a popup greeting is up.

let due: HintId[] = [];
const seenMock = vi.fn();

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: { id: "u1", name: "Ada", onlineMode: "offline" },
    isAdmin: false,
  }),
}));
vi.mock("../../lib/onboarding", () => ({
  fetchOnboarding: async () => ({ hintsDue: due }),
  markHintSeen: (id: HintId) => seenMock(id),
}));
vi.mock("../../lib/greetings", () => ({
  fetchGreeting: async () => ({ greeting: null, players: {} }),
}));

import { OnboardingHintsProvider, useOnboardingHint } from "./OnboardingHints";

function Control({ hint: id }: { hint: HintId }) {
  useOnboardingHint(id, true);
  // A laid-out box, so the hint can find and place itself.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
    if (el) {
      el.getBoundingClientRect = () =>
        ({
          top: 100,
          left: 40,
          width: 100,
          height: 40,
          right: 140,
          bottom: 140,
          x: 40,
          y: 100,
          toJSON() {},
        }) as DOMRect;
    }
  }, [id]);
  return <span data-tour={id}>{id}</span>;
}

function renderWith(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <OnboardingHintsProvider>
        <Control hint="night-vote" />
        <Control hint="night-rsvp" />
      </OnboardingHintsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  due = ["night-rsvp", "night-vote"];
  seenMock.mockReset();
  seenMock.mockImplementation(async (id: HintId) => {
    due = due.filter((d) => d !== id);
    return { hintsDue: due };
  });
});

describe("onboarding hints", () => {
  it("shows the earliest due hint alone, then the next after Got it", async () => {
    const user = userEvent.setup();
    renderWith();
    expect(
      await screen.findByRole("dialog", { name: "You're marked as going" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Vote for games" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(seenMock).toHaveBeenCalledWith("night-rsvp");
    expect(await screen.findByRole("dialog", { name: "Vote for games" })).toBeInTheDocument();
  });

  it("shows nothing when no hint is due", async () => {
    due = [];
    renderWith();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits while a popup greeting is up", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.greetings(), { greeting: { kind: "onboarding" }, players: {} });
    renderWith(qc);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    qc.setQueryData(qk.greetings(), { greeting: null, players: {} });
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "You're marked as going" })).toBeInTheDocument(),
    );
  });
});
