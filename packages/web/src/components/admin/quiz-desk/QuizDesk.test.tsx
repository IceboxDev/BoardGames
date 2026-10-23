import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { QuizDeskApiProvider } from "./api";
import { fixtureQuizDeskApi } from "./fixtures";
import { QuizDesk } from "./QuizDesk";

// The desk over the fixture API: each tab renders its data, filters narrow
// the lists, and a target opens the article's provenance with the grade's
// explanation, the card photo, the transcript and Wikidata links.

vi.mock("../../../trainers/quiz/hooks/useContent", () => {
  const articles = [
    { id: "a0001", domain: "music-stage", titleEn: "Two Germanys", titleDe: "Zwei", factIds: [] },
    {
      id: "a0042",
      domain: "history",
      titleEn: "The Hanseatic League",
      titleDe: "Die Hanse",
      factIds: [],
    },
  ];
  return {
    useQuizIndex: () => ({
      data: { articles, article: (id: string) => articles.find((a) => a.id === id) },
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.search}</output>;
}

function renderDesk(path = "/admin/quiz-desk") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QuizDeskApiProvider value={fixtureQuizDeskApi}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/admin/quiz-desk"
              element={
                <>
                  <QuizDesk />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QuizDeskApiProvider>
    </QueryClientProvider>,
  );
}

describe("QuizDesk", () => {
  it("shows the overview: shape deviations, grades, backlog and retired counts", async () => {
    renderDesk();
    const shape = await screen.findByRole("region", { name: "Shape per domain" });
    expect(within(shape).getByText(/3 off target/)).toBeInTheDocument();
    const history = within(shape).getByRole("row", { name: /^History/ });
    expect(within(history).getByText("−2")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Every active fact: A \d+/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Retired by code" })).toHaveTextContent("quota-trim");
    expect(screen.getByText("Backlog (6)")).toBeInTheDocument();
  });

  it("filters the backlog and opens a target's provenance", async () => {
    const user = userEvent.setup();
    renderDesk("/admin/quiz-desk?tab=backlog");
    // Open by default: 5 open items.
    expect(await screen.findByText("5 items")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "photo-check" }));
    expect(await screen.findByText("1 item")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quiztopia c001" }));
    expect(screen.getByTestId("where")).toHaveTextContent("tab=provenance&article=a0001");
    expect(
      await screen.findByRole("heading", { name: /Two Germanys, Two Anthems/ }),
    ).toBeInTheDocument();
  });

  it("filters the retired list by code and text", async () => {
    const user = userEvent.setup();
    renderDesk("/admin/quiz-desk?tab=retired");
    expect(await screen.findByText("6 retired items")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Retirement code" }), "none");
    expect(await screen.findByText("1 retired item")).toBeInTheDocument();
    expect(screen.getByText(/Retired before codes existed/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Retirement code" }), "");
    await user.type(screen.getByRole("searchbox", { name: "Search retired items" }), "toronto");
    await waitFor(() => expect(screen.getByText("1 retired item")).toBeInTheDocument());
    expect(screen.getByText("→ Toronto")).toBeInTheDocument();
  });

  it("shows a fact's provenance: grade tooltip, sources, photo, transcript, entities", async () => {
    renderDesk("/admin/quiz-desk?tab=provenance&article=a0001");
    const q1 = await screen.findByText(/Who wrote the poem „Die Kinderhymne“/);
    const card = q1.closest("li");
    if (!card) throw new Error("fact card not found");
    const grade = within(card).getByText(/^Grade A:/);
    expect(grade.textContent).toContain("2 independent sources");
    expect(within(card).getByRole("link", { name: /Card photo/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/quiztopia/c001.jpg"),
    );
    expect(within(card).getByText(/90° clockwise turn/)).toBeInTheDocument();
    expect(within(card).getByText(/Answer printed upside down/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Bertolt Brecht/ })).toHaveAttribute(
      "href",
      "https://www.wikidata.org/wiki/Q38757",
    );
    expect(
      within(card).getByText(/Kinderhymne ist ein Gedicht von Bertolt Brecht/),
    ).toBeInTheDocument();
    expect(within(card).getAllByText(/verified 2026-10-23/).length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Reports" })).toHaveTextContent("#12");
    expect(screen.getAllByRole("link", { name: /run research-07/ })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("quiz-archive/runs/research-07"),
    );
  });
});
