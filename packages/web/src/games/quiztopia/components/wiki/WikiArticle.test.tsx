import type {
  CardArticles,
  CardQuestions,
  ContentSetArticle,
  ContentSetQuestions,
} from "@boardgames/core/games/quiztopia/content-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The article page's contract: the five answers come from the importer's
// spans (never from text search), each mark is a button that opens its
// question row, "Show answer" toggles, and prev/next are real links.

const ARTICLE_EN = "Alpha one. Beta two. Gamma three. Delta four.\n\nEpsilon five.";
const ARTICLE_DE = "Alpha eins. Beta zwei. Gamma drei. Delta vier.\n\nEpsilon fünf.";
const ANSWERS_EN = ["one", "two", "three", "four", "five"];
const ANSWERS_DE = ["eins", "zwei", "drei", "vier", "fünf"];

function spansFor(text: string, answers: string[]): [number, number][] {
  return answers.map((a) => [text.indexOf(a), a.length]);
}

function articleSet(cardId: string, n: number): ContentSetArticle {
  return {
    id: `${cardId}-s${String(n).padStart(2, "0")}`,
    titleEn: `Title ${cardId} ${n}`,
    titleDe: `Titel ${cardId} ${n}`,
    articleEn: ARTICLE_EN,
    articleDe: ARTICLE_DE,
    answerSpans: {
      en: spansFor(ARTICLE_EN, ANSWERS_EN) as ContentSetArticle["answerSpans"]["en"],
      de: spansFor(ARTICLE_DE, ANSWERS_DE) as ContentSetArticle["answerSpans"]["de"],
    },
  };
}

function questionSet(cardId: string, n: number): ContentSetQuestions {
  const sid = `${cardId}-s${String(n).padStart(2, "0")}`;
  return {
    id: sid,
    n,
    notesEn: n === 7 ? "The card misprints the year." : "",
    notesDe: n === 7 ? "Die Karte nennt das falsche Jahr." : "",
    questions: ANSWERS_EN.map((a, q) => ({
      id: `${sid}-q${q}`,
      en: `Question ${q + 1} (en)?`,
      de: `Frage ${q + 1} (de)?`,
      answerEn: a,
      answerDe: ANSWERS_DE[q],
      timeline: {
        kind: "event" as const,
        start: ["1841-08-26", "1900", "-44", "1950", "2001"][q],
        end: null,
        precision: q === 0 ? ("day" as const) : ("year" as const),
        approx: false,
        ongoing: false,
        labelEn: `Label ${a}`,
        labelDe: `Etikett ${ANSWERS_DE[q]}`,
      },
      source: {
        url: `https://en.wikipedia.org/wiki/Source_${q}`,
        title: `Source ${q} – Wikipedia`,
        lang: "en",
      },
    })),
  };
}

function articles(cardId: string): CardArticles {
  return { id: cardId, sets: Array.from({ length: 12 }, (_, i) => articleSet(cardId, i + 1)) };
}

function questions(cardId: string): CardQuestions {
  return {
    id: cardId,
    sourceImage: `${cardId}.jpg`,
    sets: Array.from({ length: 12 }, (_, i) => questionSet(cardId, i + 1)),
  };
}

vi.mock("../../../../hooks/useGameShell", () => ({
  useGameShell: () => ({ def: { slug: "quiztopia" } }),
}));

vi.mock("../../hooks/useQuiztopiaSettings", () => ({
  useQuiztopiaSettings: () => ({
    settings: {
      language: "en",
      newPerDay: 10,
      newPerDayByCategory: {},
      includeLeeches: false,
      newCardOrder: "sets",
      gameReviewsAffectSrs: false,
    },
    loaded: true,
    save: vi.fn(),
    saving: false,
    saveError: null,
  }),
}));

vi.mock("../../content", () => ({
  CARD_IDS: ["c001", "c002", "c003"],
  findArticle: (card: CardArticles, setId: string) =>
    card.sets[Number.parseInt(setId.slice(6, 8), 10) - 1] ?? null,
}));

vi.mock("../../hooks/useContent", () => ({
  useCardArticles: (cardId: string) => ({
    data: articles(cardId),
    isPending: false,
    isError: false,
    error: null,
  }),
  useCardQuestions: (cardId: string) => ({
    data: questions(cardId),
    isPending: false,
    isError: false,
    error: null,
  }),
  useTitles: () => ({ data: undefined, isPending: true, isError: false, error: null }),
}));

const postWikiReadMock = vi.fn();
vi.mock("../../api", () => ({
  statesQuery: () => async () => ({ states: [] }),
  wikiReadsQuery: () => async () => ({ reads: [] }),
  pinsQuery: () => async () => ({
    pins: [
      {
        questionId: "c002-s07-q0",
        state: "review",
        known: true,
        lastReviewedAt: "2026-09-20T10:00:00.000Z",
      },
    ],
  }),
  postWikiRead: (body: unknown) => postWikiReadMock(body),
}));

import WikiArticle from "./WikiArticle";

function renderArticle(path = "/play/quiztopia/solo/wiki/politics/c002") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/play/quiztopia/solo/wiki/:category/:cardId" element={<WikiArticle />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  postWikiReadMock.mockReset();
  // The server's real answer: the caller's whole read list.
  postWikiReadMock.mockImplementation(async (body: { setId: string }) => ({
    reads: [{ setId: body.setId, readAt: "2026-09-24T12:00:00.000Z" }],
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

describe("WikiArticle", () => {
  it("renders the five answers as marks built from the spans, in the text's order", async () => {
    renderArticle();
    const article = await screen.findByRole("article");
    const marks = within(article).getAllByRole("button");
    expect(marks).toHaveLength(5);
    expect(marks.map((m) => m.textContent)).toEqual([
      "oneQ1",
      "twoQ2",
      "threeQ3",
      "fourQ4",
      "fiveQ5",
    ]);
    // The paragraph break survives segmentation.
    expect(within(article).getAllByText(/Epsilon/)).toHaveLength(1);
    expect(article.querySelectorAll("p")).toHaveLength(2);
    // Each mark is addressable for the `#q<n>` deep link.
    expect(document.getElementById("q3")?.textContent).toBe("threeQ3");
  });

  it("toggles a question's answer from the row and opens it from its mark", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    const rows = screen
      .getAllByRole("listitem")
      .filter((li) => within(li).queryByText(/^Question/));
    expect(rows).toHaveLength(5);

    const show = within(rows[1]).getByRole("button", { name: /Show answer/ });
    expect(within(rows[1]).queryByText("two")).toBeNull();
    await user.click(show);
    expect(within(rows[1]).getByText("two")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: /Hide answer/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.click(within(rows[1]).getByRole("button", { name: /Hide answer/ }));
    expect(within(rows[1]).queryByText("two")).toBeNull();

    // A mark in the prose opens its row.
    const article = screen.getByRole("article");
    await user.click(within(article).getByRole("button", { name: /^four/ }));
    expect(within(rows[3]).getByText("four")).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: /^four/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("links to the previous and next card of the same district", async () => {
    renderArticle();
    await screen.findByRole("article");
    expect(screen.getByRole("link", { name: "Previous card" })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/politics/c001",
    );
    expect(screen.getByRole("link", { name: "Next card" })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/politics/c003",
    );
  });

  it("has no previous link on the first card and shows the editor's note", async () => {
    renderArticle("/play/quiztopia/solo/wiki/politics/c001");
    // (the same district's set on the first card)
    await screen.findByRole("article");
    expect(screen.queryByRole("link", { name: "Previous card" })).toBeNull();
    expect(screen.getByRole("link", { name: "Next card" })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/politics/c002",
    );
    expect(screen.getByText("The card misprints the year.")).toBeInTheDocument();
  });

  it("shows each question's date and source, links pinned ones to the timeline, and lists sources", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    const rows = screen
      .getAllByRole("listitem")
      .filter((li) => within(li).queryByText(/^Question/));
    // Date only until the answer is shown — the label often names it.
    expect(within(rows[0]).getByText("26 August 1841")).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/Label one/)).toBeNull();
    await user.click(within(rows[0]).getByRole("button", { name: /Show answer/ }));
    expect(within(rows[0]).getByText(/Label one/)).toBeInTheDocument();
    expect(within(rows[2]).getByText("44 BC")).toBeInTheDocument();
    // Every question carries its own source.
    expect(within(rows[1]).getByRole("link", { name: /en\.wikipedia\.org/ })).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Source_1",
    );
    // The source link opens in a new tab and names the domain.
    const source = within(rows[0]).getByRole("link", { name: /en\.wikipedia\.org/ });
    expect(source).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Source_0");
    expect(source).toHaveAttribute("target", "_blank");
    // Only the pinned question links to the timeline.
    expect(await within(rows[0]).findByRole("link", { name: /Show on timeline/ })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/timeline?q=c002-s07-q0",
    );
    expect(within(rows[2]).queryByRole("link", { name: /Show on timeline/ })).toBeNull();
    // The article foot lists each source once.
    const sources = screen.getByRole("heading", { name: "Sources" }).closest("section");
    expect(sources).not.toBeNull();
    if (!sources) return;
    expect(
      within(sources)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual([0, 1, 2, 3, 4].map((q) => `https://en.wikipedia.org/wiki/Source_${q}`));
  });

  it("shows only the reading language's editor's note", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    expect(screen.getByText("The card misprints the year.")).toBeInTheDocument();
    expect(screen.queryByText("Die Karte nennt das falsche Jahr.")).toBeNull();
    await user.keyboard("l"); // L cycles EN → DE
    expect(await screen.findByText("Die Karte nennt das falsche Jahr.")).toBeInTheDocument();
    expect(screen.queryByText("The card misprints the year.")).toBeNull();
  });

  it("marks the article read from the chip and updates the badge", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    await user.click(await screen.findByRole("button", { name: /Mark read/ }));
    expect(postWikiReadMock).toHaveBeenCalledWith({ setId: "c002-s07" });
    expect(await screen.findByText("Read", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read/ })).toBeDisabled();
    expect(postWikiReadMock).toHaveBeenCalledTimes(1);
  });

  it("bounces an unknown card to the district list", () => {
    renderArticle("/play/quiztopia/solo/wiki/politics/c999");
    expect(screen.getByText("elsewhere")).toBeInTheDocument();
  });
});
