import type { AdminReports } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-fetch";

// The admin queue: the content now beside what each reporter wrote (and saw,
// when it differs), resolve with a note for every open report on the card,
// a clear message when another admin got there first, and the fix brief.

const resolveMock = vi.fn();
const reopenMock = vi.fn();
let queue: AdminReports;

vi.mock("../../games/quiztopia/api", () => ({
  adminReportsQuery: () => async () => queue,
  resolveReports: (body: unknown) => resolveMock(body),
  reopenReport: (id: number) => reopenMock(id),
}));

import { QuiztopiaReportsCard } from "./QuiztopiaReportsCard";

const NOW = {
  kind: "question" as const,
  en: "Which war ended in 1648?",
  de: "Welcher Krieg endete 1648?",
  answerEn: "The Thirty Years' War",
  answerDe: "Der Dreißigjährige Krieg",
  timeline: null,
  source: null,
};

function baseQueue(): AdminReports {
  return {
    counts: { open: 2, fixed: 0, declined: 0 },
    groups: [
      {
        target: { kind: "question", id: "c014-s06-q2" },
        setId: "c014-s06",
        category: 6,
        current: NOW,
        changedSinceReport: true,
        sourceImage: "IMG_0014.jpg",
        reports: [1, 2].map((id) => ({
          id,
          reporterId: `u${id}`,
          reporterName: id === 1 ? "Anna" : "Ben",
          issue: id === 1 ? ("wrong-answer" as const) : ("typo" as const),
          language: "en" as const,
          message: id === 1 ? "It was the Eighty Years' War too" : null,
          surface: "trainer" as const,
          status: "open" as const,
          resolutionNote: null,
          resolvedAt: null,
          resolvedByName: null,
          createdAt: "2026-10-06T10:00:00.000Z",
          contentVersion: "v1",
          snapshot: id === 2 ? { ...NOW, answerEn: "Thirty Year War" } : NOW,
        })),
      },
    ],
  };
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <QuiztopiaReportsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queue = baseQueue();
  resolveMock.mockReset();
  resolveMock.mockResolvedValue({ resolved: 2 });
  reopenMock.mockReset();
});

describe("QuiztopiaReportsCard", () => {
  it("shows the content now, what each reporter wrote, and what one of them saw", async () => {
    renderCard();
    expect(await screen.findByText("“It was the Eighty Years' War too”")).toBeInTheDocument();
    expect(screen.getByText("Content changed since a report")).toBeInTheDocument();
    expect(screen.getByText(/They saw: answer “Thirty Year War”/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in the wiki →" })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/history/c014#q3",
    );
  });

  it("resolves every open report on the card with the note", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("“It was the Eighty Years' War too”");
    await user.type(screen.getByRole("textbox", { name: "Note to the reporter" }), "Kept as is");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(resolveMock).toHaveBeenCalledWith({
        ids: [1, 2],
        status: "declined",
        note: "Kept as is",
      }),
    );
  });

  it("says so when another admin resolved it first", async () => {
    resolveMock.mockRejectedValue(new ApiError(409, "These reports were already resolved"));
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("“It was the Eighty Years' War too”");
    await user.click(screen.getByRole("button", { name: "Mark fixed" }));
    expect(
      await screen.findByText(/These reports were already resolved — the list is refreshed/),
    ).toBeInTheDocument();
  });

  it("copies the fix brief", async () => {
    const user = userEvent.setup();
    // After setup: user-event installs its own clipboard on navigator.
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderCard();
    await screen.findByText("“It was the Eighty Years' War too”");
    await user.click(screen.getByRole("button", { name: "Copy fix brief" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0]?.[0])).toContain(
      "content/questions/c014.json → sets[5].questions[2]",
    );
  });
});
