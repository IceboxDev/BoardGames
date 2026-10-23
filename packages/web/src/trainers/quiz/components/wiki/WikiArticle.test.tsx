import type { Article } from "@boardgames/core/quiz/content-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The article page's contract: every fact's answer comes from its span
// (never from text search), each mark is a button that opens its question
// row, "Show answer" toggles, and prev/next are real links within the
// article's sub-category.

const ARTICLE_EN = "Alpha one. Beta two. Gamma three. Delta four.\n\nEpsilon five.";
const ARTICLE_DE = "Alpha eins. Beta zwei. Gamma drei. Delta vier.\n\nEpsilon fünf.";
const ANSWERS_EN = ["one", "two", "three", "four", "five"];
const ANSWERS_DE = ["eins", "zwei", "drei", "vier", "fünf"];

function span(text: string, answer: string): [number, number] {
  return [text.indexOf(answer), answer.length];
}

const num5 = (n: number) => String(n).padStart(5, "0");

function article(id: string): Article {
  const num = Number(id.slice(1));
  return {
    id,
    domain: "society",
    sub: "politics",
    images: [],
    titleEn: `Title ${id}`,
    titleDe: `Titel ${id}`,
    bodyEn: ARTICLE_EN,
    bodyDe: ARTICLE_DE,
    notesEn: num === 2 ? "The card misprints the year." : "",
    notesDe: num === 2 ? "Die Karte nennt das falsche Jahr." : "",
    facts: ANSWERS_EN.map((a, q) => {
      const n = (num - 1) * 5 + q + 1;
      const text = { id: `w${num5(n)}`, en: `Question ${q + 1} (en)?`, de: `Frage ${q + 1} (de)?` };
      return {
        id: `f${num5(n)}`,
        answerEn: a,
        answerDe: ANSWERS_DE[q],
        spans: { en: span(ARTICLE_EN, a), de: span(ARTICLE_DE, ANSWERS_DE[q]) },
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
        wordings: [
          q === 0
            ? {
                ...text,
                origin: "printed" as const,
                printed: { source: "quiztopia" as const, card: "c001", category: 7 },
                ...(num === 2 ? { cardText: "Is one the answer? (card)" } : {}),
              }
            : { ...text, origin: "generated" as const },
        ],
      };
    }),
    ...(num === 2
      ? {
          retired: [
            {
              id: "f00999",
              answerEn: "Old answer",
              answerDe: "Alte Antwort",
              timeline: {
                kind: "event" as const,
                start: "1900",
                end: null,
                precision: "year" as const,
                approx: false,
                ongoing: false,
                labelEn: "Old",
                labelDe: "Alt",
              },
              source: { url: "https://en.wikipedia.org/wiki/Old", title: "Old", lang: "en" },
              wordings: [
                {
                  id: "w00999",
                  en: "Retired question?",
                  de: "Alte Frage?",
                  origin: "generated" as const,
                },
              ],
              retired: { at: "2026-10-21", reason: "Duplicate of Q2.", replacedBy: ["f00007"] },
            },
          ],
        }
      : {}),
  };
}

const HISTORY = {
  articleId: "a0002",
  retired: [],
  entries: [
    {
      seq: 1,
      at: "2026-09-17",
      kind: "printed",
      target: { type: "wording", id: "w00006" },
      reason: "Printed on Quiztopia card c001.",
      by: "Quiztopia import",
      ref: "quiz-archive/transcripts/quiztopia/c001.json",
      actor: { kind: "agent", name: "transcriber", model: "claude-opus" },
      run: "tp-enrich",
      confidence: "high",
      changes: [{ field: "en", new: "Is one the answer? (card)" }],
    },
    {
      seq: 2,
      at: "2026-10-20",
      kind: "reworded",
      target: { type: "wording", id: "w00006" },
      reason: "A yes/no card made open.",
      by: "owner",
      changes: [{ field: "en", old: "Is one the answer? (card)", new: "Question 1 (en)?" }],
    },
    {
      seq: 3,
      at: "2026-10-21",
      kind: "corrected",
      target: { type: "article", id: "a0002" },
      reason: `${"A very long reason that goes on. ".repeat(8)}The end.`,
      by: "enrich batch 128",
      sources: [{ url: "https://en.wikipedia.org/wiki/Gamma" }],
      changes: [
        {
          field: "bodyEn",
          diff: [
            ["=", 8],
            ["-", "Gamma"],
            ["+", "Gamma"],
            ["=", 10],
          ],
        },
      ],
    },
    {
      seq: 4,
      at: "2026-10-21",
      kind: "retired",
      target: { type: "fact", id: "f00999" },
      reason: "Duplicate of Q2.",
      by: "coordinator",
    },
  ],
};

const INDEX_ARTICLES = ["a0001", "a0002", "a0003"].map((id) => {
  const a = article(id);
  return {
    id,
    domain: a.domain,
    sub: a.sub,
    titleEn: a.titleEn,
    titleDe: a.titleDe,
    factIds: a.facts.map((f) => f.id),
    sources: ["quiztopia"],
  };
});

vi.mock("../../../../hooks/useGameShell", () => ({
  useGameShell: () => ({ def: { slug: "quiztopia" } }),
}));

vi.mock("../../hooks/useQuizSettings", () => ({
  useQuizSettings: () => ({
    settings: {
      language: { primary: "en", secondary: null },
      newFactsPerDay: 15,
      includeLeeches: false,
      gameReviewsAffectSrs: false,
      sources: ["quiztopia", "trivial-pursuit"],
      excludeFromAll: [],
    },
    loaded: true,
    save: vi.fn(),
    saving: false,
    saveError: null,
  }),
}));

vi.mock("../../hooks/useContent", () => ({
  useArticle: (id: string) => ({
    data: article(id),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQuizIndex: () => ({
    data: {
      articles: INDEX_ARTICLES,
      article: (id: string) => INDEX_ARTICLES.find((a) => a.id === id),
      articleOf: (f: string) => INDEX_ARTICLES.find((a) => a.factIds.includes(f)),
    },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// Members by default; the admin test flips it to see the desk's grade + photo.
const session = { isAdmin: false };
vi.mock("../../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAdmin: session.isAdmin }),
}));

const provenanceMock = vi.fn(async (id: string) => {
  const { FIXTURE_PROVENANCE } = await import("../../../../components/admin/quiz-desk/fixtures");
  const base = FIXTURE_PROVENANCE.a0001;
  if (!base) throw new Error("fixture missing");
  // Pin the fixture's first fact onto this article's Q1.
  return { ...base, facts: [{ ...base.facts[0], id: "f00006" }], article: { ...base.article, id } };
});
vi.mock("../../../../components/admin/quiz-desk/api", () => ({
  httpQuizDeskApi: { id: "test", provenance: (id: string) => provenanceMock(id) },
  deskKeys: { provenance: (api: string, id: string) => ["quiz", "desk", api, "provenance", id] },
}));

const postWikiReadMock = vi.fn();
const historyMock = vi.fn(async (_id: string) => HISTORY);
const deleteWikiReadMock = vi.fn(async (_body: { articleId: string }) => ({ reads: [] }));
vi.mock("../../api", () => ({
  myReportsQuery: () => async () => ({ reports: [], unread: 0 }),
  statesQuery: () => async () => ({ states: [] }),
  wikiReadsQuery: () => async () => ({ reads: [] }),
  articleHistoryQuery: (id: string) => () => historyMock(id),
  pinsQuery: () => async () => ({
    pins: [
      {
        questionId: "f00006",
        state: "review",
        known: true,
        lastReviewedAt: "2026-09-20T10:00:00.000Z",
      },
    ],
    summary: { dated: 1, spanYears: 0 },
  }),
  postWikiRead: (body: unknown) => postWikiReadMock(body),
  deleteWikiRead: (body: { articleId: string }) => deleteWikiReadMock(body),
}));

import WikiArticle from "./WikiArticle";

function renderArticle(path = "/trainer/quiz/wiki/article/a0002") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trainer/quiz/wiki/article/:articleId" element={<WikiArticle />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  postWikiReadMock.mockReset();
  // The server's real answer: the caller's whole read list.
  postWikiReadMock.mockImplementation(async (body: { articleId: string }) => ({
    reads: [{ articleId: body.articleId, readAt: "2026-09-24T12:00:00.000Z" }],
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

describe("WikiArticle", () => {
  it("renders every fact's answer as a mark built from its span, in the text's order", async () => {
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
    // Each mark is addressable for the `#<factId>` deep link.
    expect(document.getElementById("f00008")?.textContent).toBe("threeQ3");
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

  it("links to the previous and next article of the same sub-category", async () => {
    renderArticle();
    await screen.findByRole("article");
    expect(screen.getByRole("link", { name: "Previous article" })).toHaveAttribute(
      "href",
      "/trainer/quiz/wiki/article/a0001",
    );
    expect(screen.getByRole("link", { name: "Next article" })).toHaveAttribute(
      "href",
      "/trainer/quiz/wiki/article/a0003",
    );
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("has no previous link on the first article and says which games print a fact", async () => {
    renderArticle("/trainer/quiz/wiki/article/a0001");
    await screen.findByRole("article");
    expect(screen.queryByRole("link", { name: "Previous article" })).toBeNull();
    expect(screen.getByRole("link", { name: "Next article" })).toHaveAttribute(
      "href",
      "/trainer/quiz/wiki/article/a0002",
    );
    expect(screen.getAllByText("Printed in Quiztopia")).toHaveLength(1);
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
      "/trainer/quiz/timeline?q=f00006",
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
    await user.click(await screen.findByRole("button", { name: /Mark as read/ }));
    await waitFor(() => expect(postWikiReadMock).toHaveBeenCalledTimes(1));
    expect(postWikiReadMock).toHaveBeenCalledWith({ articleId: "a0002" });
    expect(await screen.findByText("Read", { selector: "span" })).toBeInTheDocument();
    expect(postWikiReadMock).toHaveBeenCalledTimes(1);
  });

  it("unmarks a read marked by mistake", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    await user.click(await screen.findByRole("button", { name: /Mark as read/ }));
    await waitFor(() => expect(postWikiReadMock).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole("button", { name: /Mark as unread/ }));
    await waitFor(() => expect(deleteWikiReadMock).toHaveBeenCalledWith({ articleId: "a0002" }));
    expect(await screen.findByRole("button", { name: /Mark as read/ })).toBeEnabled();
    expect(screen.queryByText("Read", { selector: "span" })).not.toBeInTheDocument();
  });

  it("bounces a malformed article id to the archive", () => {
    renderArticle("/trainer/quiz/wiki/article/nope");
    expect(screen.getByText("elsewhere")).toBeInTheDocument();
  });

  it("shows a reworked printed question's card text under it", async () => {
    renderArticle();
    await screen.findByRole("article");
    const rows = screen
      .getAllByRole("listitem")
      .filter((li) => within(li).queryByText(/^Question/));
    expect(within(rows[0]).getByText("Is one the answer? (card)")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/On the card/)).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/On the card/)).toBeNull();
  });

  it("lists retired questions collapsed, with their reason and the question that replaced them", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    const toggle = screen.getByRole("button", { name: /Retired questions \(1\)/ });
    expect(screen.queryByText("Retired question?")).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Retired question?")).toBeInTheDocument();
    expect(screen.getByText("Duplicate of Q2.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Now asked as Q2/ })).toHaveAttribute(
      "href",
      "/trainer/quiz/wiki/article/a0002#f00007",
    );
  });

  it("loads the history on demand and shows it per question with kinds, diffs and sources", async () => {
    const user = userEvent.setup();
    historyMock.mockClear();
    renderArticle();
    await screen.findByRole("article");
    expect(historyMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(historyMock).toHaveBeenCalledWith("a0002");

    const q1 = await screen.findByRole("region", { name: /^Q1 · / });
    expect(within(q1).getByText("Printed")).toBeInTheDocument();
    expect(within(q1).getByText("Reworded")).toBeInTheDocument();
    expect(within(q1).getByText("A yes/no card made open.")).toBeInTheDocument();
    // old → new: the old value struck through.
    const struck = within(q1).getByText("Is one the answer? (card)", { selector: "del" });
    expect(struck).toBeInTheDocument();

    const art = screen.getByRole("region", { name: /^The article/ });
    expect(within(art).getByText("Corrected")).toBeInTheDocument();
    expect(within(art).getByText("enrich batch 128")).toBeInTheDocument();
    expect(within(art).getByRole("link", { name: /en\.wikipedia\.org/ })).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Gamma",
    );
    // The body diff: only the changed run, with its context read from the current text.
    expect(within(art).getByText("Gamma", { selector: "ins" })).toBeInTheDocument();
    expect(within(art).getByText("Gamma", { selector: "del" })).toBeInTheDocument();
    expect(within(art).getByText(/Beta two\.\s*$/)).toBeInTheDocument();
    // A long reason is clamped behind "More".
    await user.click(within(art).getByRole("button", { name: "More" }));
    expect(within(art).getByRole("button", { name: "Less" })).toBeInTheDocument();

    const retired = screen.getByRole("region", { name: /^Retired · Retired question\?/ });
    expect(within(retired).getByText("Retired", { selector: "span" })).toBeInTheDocument();
  });

  it("links an entry's ref to the archive and shows its actor, run and confidence", async () => {
    const user = userEvent.setup();
    renderArticle();
    await screen.findByRole("article");
    await user.click(screen.getByRole("button", { name: "History" }));
    const q1 = await screen.findByRole("region", { name: /^Q1 · / });
    expect(
      within(q1).getByRole("link", { name: /transcripts\/quiztopia\/c001\.json/ }),
    ).toHaveAttribute(
      "href",
      "https://github.com/IceboxDev/BoardGames/blob/master/packages/quiz-archive/transcripts/quiztopia/c001.json",
    );
    expect(within(q1).getByText("agent: transcriber (claude-opus)")).toBeInTheDocument();
    expect(within(q1).getByText("run tp-enrich")).toBeInTheDocument();
    expect(within(q1).getByText("confidence high")).toBeInTheDocument();
    // Members never see the desk's grade nor ask for it.
    expect(within(q1).queryByText(/^Grade /)).toBeNull();
    expect(provenanceMock).not.toHaveBeenCalled();
  });

  it("gives admins each fact's grade and card photo link", async () => {
    session.isAdmin = true;
    try {
      const user = userEvent.setup();
      renderArticle();
      await screen.findByRole("article");
      await user.click(screen.getByRole("button", { name: "History" }));
      const q1 = await screen.findByRole("region", { name: /^Q1 · / });
      expect(await within(q1).findByText(/^Grade A:/)).toBeInTheDocument();
      expect(within(q1).getByRole("link", { name: /Card photo c001/ })).toHaveAttribute(
        "href",
        expect.stringContaining("/quiztopia/c001.jpg"),
      );
      expect(provenanceMock).toHaveBeenCalledWith("a0002");
    } finally {
      session.isAdmin = false;
    }
  });
});
