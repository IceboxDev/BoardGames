import { DEFAULT_QUIZTOPIA_SETTINGS, type Journal } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The journal's contract: days newest first, answers hidden until clicked,
// filters over what is loaded, "study again" carries the day's ids, and
// older days load on demand with the server's cursor.

const TODAY = "2026-10-07";

function page(date: string, nextBefore: string | null): Journal {
  return {
    days: [
      {
        date,
        reviewed: 3,
        knew: 2,
        newQuestions: 1,
        articlesRead: 1,
        sets: [
          {
            setId: "c001-s01",
            category: 1,
            titleEn: `Brecht ${date}`,
            titleDe: `Brecht ${date}`,
            readAt: `${date}T18:00:00.000Z`,
            questions: [
              {
                questionId: "c001-s01-q0",
                q: 0,
                en: `Who wrote the Kinderhymne? (${date})`,
                de: "Wer schrieb die Kinderhymne?",
                answerEn: "Bertolt Brecht",
                answerDe: "Bertolt Brecht",
                grades: ["again", "good"],
                firstSeen: true,
                fromGame: false,
              },
              {
                questionId: "c001-s01-q1",
                q: 1,
                en: `Which anthem? (${date})`,
                de: "Welche Hymne?",
                answerEn: "Das Lied der Deutschen",
                answerDe: "Das Lied der Deutschen",
                grades: ["good"],
                firstSeen: false,
                fromGame: true,
              },
            ],
          },
        ],
      },
    ],
    nextBefore,
  };
}

const journalMock = vi.fn();
const navigate = vi.fn();

vi.mock("../../api", () => ({
  myReportsQuery: () => async () => ({ reports: [], unread: 0 }),
  todayKey: () => TODAY,
  settingsQuery: () => async () => DEFAULT_QUIZTOPIA_SETTINGS,
  putSettings: async () => DEFAULT_QUIZTOPIA_SETTINGS,
  journalQuery: (opts: { before?: string }) => async () => journalMock(opts),
}));

vi.mock("../../hooks/useContent", () => ({
  useCardArticles: () => ({ data: undefined, isPending: true }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

import WikiJournal from "./WikiJournal";

function renderJournal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WikiJournal />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockReset();
  journalMock.mockReset();
  journalMock.mockImplementation(async (opts: { before?: string }) =>
    opts.before ? page("2026-10-01", null) : page(TODAY, TODAY),
  );
});

describe("WikiJournal", () => {
  it("lists the day with its article and hides answers until asked", async () => {
    const user = userEvent.setup();
    renderJournal();
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Brecht ${TODAY}` })).toBeInTheDocument();
    expect(screen.queryByText("Bertolt Brecht")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Show the answer to: Who wrote the Kinderhymne/ }),
    );
    expect(screen.getByText("Bertolt Brecht")).toBeInTheDocument();
    // The other answer stays hidden.
    expect(screen.queryByText("Das Lied der Deutschen")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Passage in the article →" })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/stage-music/c001#q1",
    );
  });

  it("filters to the missed questions", async () => {
    const user = userEvent.setup();
    renderJournal();
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Missed" }));
    expect(screen.getByText(/Who wrote the Kinderhymne/)).toBeInTheDocument();
    expect(screen.queryByText(/Which anthem/)).not.toBeInTheDocument();
  });

  it("searches what is loaded", async () => {
    const user = userEvent.setup();
    renderJournal();
    await screen.findByRole("heading", { name: "Today" });
    await user.type(screen.getByRole("searchbox", { name: "Search your journal" }), "anthem");
    expect(screen.getByText(/Which anthem/)).toBeInTheDocument();
    expect(screen.queryByText(/Who wrote the Kinderhymne/)).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search your journal" }));
    await user.type(screen.getByRole("searchbox", { name: "Search your journal" }), "zzz");
    expect(screen.getByText(/Nothing in the loaded days matches/)).toBeInTheDocument();
  });

  it("studies the day's questions, or just its misses, again", async () => {
    const user = userEvent.setup();
    renderJournal();
    const day = (await screen.findByRole("heading", { name: "Today" })).closest("li");
    if (!day) throw new Error("no day");
    await user.click(within(day).getByRole("button", { name: "Study these 2 again" }));
    expect(navigate).toHaveBeenLastCalledWith(
      "/play/quiztopia/solo/study?ids=c001-s01-q0%2Cc001-s01-q1",
    );
    await user.click(within(day).getByRole("button", { name: "Study 1 missed" }));
    expect(navigate).toHaveBeenLastCalledWith("/play/quiztopia/solo/study?ids=c001-s01-q0");
  });

  it("loads older days with the server's cursor", async () => {
    const user = userEvent.setup();
    renderJournal();
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Load older days" }));
    await waitFor(() =>
      expect(journalMock).toHaveBeenLastCalledWith({
        before: TODAY,
        days: 7,
        tz: expect.any(String),
      }),
    );
    expect(await screen.findByRole("link", { name: "Brecht 2026-10-01" })).toBeInTheDocument();
    expect(screen.getByText("That's where your journal begins.")).toBeInTheDocument();
  });

  it("says so when there is nothing yet", async () => {
    journalMock.mockImplementation(async () => ({ days: [], nextBefore: null }));
    renderJournal();
    expect(await screen.findByText("Your journal is empty")).toBeInTheDocument();
  });
});
