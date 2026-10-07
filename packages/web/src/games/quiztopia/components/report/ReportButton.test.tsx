import type { MyReport, MyReports } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keysCaptured } from "../../keys";

// The report flow's contract: a quiet flag that opens a guided form; issues
// that would give the answer away are hidden before a reveal; "Something
// else" needs words; an open report turns the flag into "Reported" and the
// form into edit / withdraw; and while the form is open the screen behind
// takes no shortcuts.

const createMock = vi.fn();
const withdrawMock = vi.fn();
let mine: MyReports = { reports: [], unread: 0 };

vi.mock("../../api", () => ({
  myReportsQuery: () => async () => mine,
  createReport: (body: unknown) => createMock(body),
  withdrawReport: (id: number) => withdrawMock(id),
  markReportsSeen: async () => mine,
}));

import { ReportButton } from "./ReportButton";

const TARGET = { kind: "question", id: "c001-s01-q2" } as const;

function openReport(over: Partial<MyReport> = {}): MyReport {
  return {
    id: 7,
    target: TARGET,
    setId: "c001-s01",
    category: 1,
    issue: "typo",
    language: "en",
    message: "‘Brect’ should be ‘Brecht’",
    surface: "trainer",
    status: "open",
    resolutionNote: null,
    createdAt: "2026-10-06T10:00:00.000Z",
    updatedAt: "2026-10-06T10:00:00.000Z",
    resolvedAt: null,
    unread: false,
    snapshot: {
      kind: "question",
      en: "Who wrote it?",
      de: "Wer schrieb es?",
      answerEn: "Brecht",
      answerDe: "Brecht",
      timeline: null,
      source: null,
    },
    ...over,
  };
}

function renderButton(hideSpoilers = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReportButton
          context={{
            target: TARGET,
            title: "Who wrote it?",
            category: 1,
            surface: "trainer",
            hideSpoilers,
            language: "en",
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mine = { reports: [], unread: 0 };
  createMock.mockReset();
  createMock.mockImplementation(async (body: { issue: MyReport["issue"] }) => ({
    report: openReport({ issue: body.issue }),
    updated: false,
  }));
  withdrawMock.mockReset();
  withdrawMock.mockResolvedValue({ reports: [], unread: 0 });
});

describe("ReportButton", () => {
  it("files a report through the guided form", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Report a problem with this question" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Who wrote it?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Wrong answer/ }));
    await user.click(screen.getByRole("button", { name: "Both" }));
    await user.type(screen.getByRole("textbox"), "It's Bertolt Brecht");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(createMock).toHaveBeenCalledWith({
      target: TARGET,
      issue: "wrong-answer",
      language: "both",
      message: "It's Bertolt Brecht",
      surface: "trainer",
    });
    expect(await screen.findByText("Thanks — report sent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your reports →" })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/reports",
    );
  });

  it("hides answer-giving issues before the reveal", async () => {
    const user = userEvent.setup();
    renderButton(true);
    await user.click(screen.getByRole("button", { name: "Report a problem with this question" }));
    expect(screen.queryByRole("button", { name: /Wrong answer/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Typo or formatting/ })).toBeInTheDocument();
  });

  it("asks for words when the issue is 'Something else'", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Report a problem with this question" }));
    await user.click(screen.getByRole("button", { name: /Something else/ }));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(screen.getByText(/Say what's wrong/)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("reopens an open report for editing or withdrawal", async () => {
    mine = { reports: [openReport()], unread: 0 };
    const user = userEvent.setup();
    renderButton();
    await user.click(await screen.findByRole("button", { name: /Reported/ }));
    expect(screen.getByRole("textbox")).toHaveValue("‘Brect’ should be ‘Brecht’");
    expect(screen.getByRole("button", { name: "Update report" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw report" }));
    expect(withdrawMock).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Report withdrawn")).toBeInTheDocument();
  });

  it("captures the keyboard only while the form is open", async () => {
    const user = userEvent.setup();
    renderButton();
    expect(keysCaptured()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Report a problem with this question" }));
    expect(keysCaptured()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(keysCaptured()).toBe(false));
  });
});
