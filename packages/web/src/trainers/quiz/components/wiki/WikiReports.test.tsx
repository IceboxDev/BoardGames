import type { MyReport, MyReports } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Your reports: outcomes with the reviewer's note, new ones highlighted and
// marked seen on the visit, and open ones withdrawable after a confirm.

const seenMock = vi.fn();
const withdrawMock = vi.fn();
let mine: MyReports;

vi.mock("../../api", () => ({
  myReportsQuery: () => async () => mine,
  markReportsSeen: (body: { ids: number[] }) => seenMock(body),
  withdrawReport: (id: number) => withdrawMock(id),
  createReport: vi.fn(),
}));

import WikiReports from "./WikiReports";

function report(id: number, over: Partial<MyReport>): MyReport {
  return {
    id,
    target: { kind: "question", id: "f00003" },
    articleId: "a0001",
    domain: "music-stage",
    issue: "wrong-answer",
    language: "en",
    message: null,
    surface: "trainer",
    status: "open",
    resolutionNote: null,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
    resolvedAt: null,
    unread: false,
    snapshot: {
      kind: "question",
      en: "Who wrote the Kinderhymne?",
      de: "Wer schrieb die Kinderhymne?",
      answerEn: "Brecht",
      answerDe: "Brecht",
      timeline: null,
      source: null,
    },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WikiReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mine = {
    reports: [
      report(2, {
        status: "fixed",
        resolutionNote: "Corrected to Bertolt Brecht, thanks!",
        resolvedAt: "2026-10-06T10:00:00.000Z",
        unread: true,
      }),
      report(1, { issue: "typo", message: "Brect" }),
    ],
    unread: 1,
  };
  seenMock.mockReset();
  seenMock.mockImplementation(async () => ({
    reports: mine.reports.map((r) => ({ ...r, unread: false })),
    unread: 0,
  }));
  withdrawMock.mockReset();
  withdrawMock.mockImplementation(async () => ({ reports: [mine.reports[0]], unread: 0 }));
});

describe("WikiReports", () => {
  it("shows outcomes with the reviewer's note and marks new ones seen", async () => {
    renderPage();
    expect(await screen.findByText("Corrected to Bertolt Brecht, thanks!")).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    await waitFor(() => expect(seenMock).toHaveBeenCalledWith({ ids: [2] }));
    // Still highlighted for this visit after being marked seen.
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Corrected to Bertolt Brecht, thanks!");
    await user.click(screen.getByRole("button", { name: "Under review 1" }));
    expect(screen.queryByText("Corrected to Bertolt Brecht, thanks!")).not.toBeInTheDocument();
    expect(screen.getByText("Brect")).toBeInTheDocument();
  });

  it("withdraws an open report after a confirm", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Brect");
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    const confirmDialog = await screen.findByRole("dialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(withdrawMock).toHaveBeenCalledWith(1));
  });

  it("explains how to report when there's nothing yet", async () => {
    mine = { reports: [], unread: 0 };
    renderPage();
    expect(await screen.findByText("No reports yet")).toBeInTheDocument();
  });
});
