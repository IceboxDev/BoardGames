import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trainerPaths } from "../../paths";
import { PREVIEW_TIMELINE } from "./preview-fixture";
import { TimelineView } from "./TimelineView";

// The timeline's contract over the preview fixture: every pin is a card in
// time order, `?q=` focus opens the detail with the full date and source,
// ← / → walk the river, domain filters narrow it, and an empty timeline
// explains where pins come from.

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

const PATHS = trainerPaths("/trainer/quiz");

function Harness({ initial = null, empty = false }: { initial?: string | null; empty?: boolean }) {
  const [focus, setFocus] = useState<string | null>(initial);
  return (
    <TimelineView
      items={empty ? [] : PREVIEW_TIMELINE}
      totalPins={empty ? 0 : PREVIEW_TIMELINE.length}
      undated={0}
      paths={PATHS}
      focusId={focus}
      onFocus={setFocus}
    />
  );
}

function renderView(props: { initial?: string | null; empty?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Harness {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

const pinButtons = () => screen.getAllByRole("button").filter((b) => b.id.startsWith("tl-f"));

const focusedPinId = () =>
  document.querySelector('button[id^="tl-f"][aria-pressed="true"]')?.id ?? null;

describe("TimelineView", () => {
  it("renders every pin in time order under named blocks", () => {
    renderView();
    const ids = pinButtons().map((b) => b.id.replace(/^tl-/, ""));
    expect(ids).toEqual(PREVIEW_TIMELINE.map((it) => it.questionId));
    expect(ids[0]).toBe("f00586"); // the Big Bang first
    expect(screen.getByText("c. 13.8 billion years ago")).toBeInTheDocument();
    expect(screen.getByText("15 March 44 BC")).toBeInTheDocument();
    expect(screen.getByText("born 1954")).toBeInTheDocument();
    expect(screen.getByText(/moments pinned across/)).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: /1st millennium BC/ })[0]).toBeInTheDocument();
  });

  it("folds a block away, remembers it, and unfolds it for a focused pin", async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    const caesar = PREVIEW_TIMELINE.find((it) => it.event.start === "-44-03-15");
    if (!caesar) throw new Error("fixture lost Caesar");
    const all = PREVIEW_TIMELINE.length;
    await user.click(screen.getAllByRole("button", { name: /^Fold 1st millennium BC/ })[0]);
    expect(pinButtons().length).toBeLessThan(all);
    expect(document.getElementById(`tl-${caesar.questionId}`)).toBeNull();
    unmount();

    // The fold survives a reload, and focusing a pin inside undoes it.
    renderView({ initial: caesar.questionId });
    expect(pinButtons()).toHaveLength(all);
    expect(screen.queryByRole("button", { name: "Reset blocks" })).toBeNull();
  });

  it("opens a focused pin's detail and walks it with the arrow keys", async () => {
    const user = userEvent.setup();
    renderView({ initial: "f02162" });
    // jsdom is a narrow viewport: the detail opens in the bottom sheet.
    const detail = screen.getByRole("dialog");
    expect(within(detail).getByText("26 August 1841")).toBeInTheDocument();
    expect(
      within(detail).getByText("August Heinrich Hoffmann von Fallersleben"),
    ).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /de\.wikipedia\.org/ })).toHaveAttribute(
      "href",
      "https://de.wikipedia.org/wiki/Das_Lied_der_Deutschen",
    );
    expect(await within(detail).findByRole("link", { name: /Read in the wiki/ })).toHaveAttribute(
      "href",
      "/trainer/quiz/wiki/article/a0433#f02162",
    );
    const at = PREVIEW_TIMELINE.findIndex((it) => it.questionId === "f02162");
    await user.keyboard("{ArrowRight}");
    expect(focusedPinId()).toBe(`tl-${PREVIEW_TIMELINE[at + 1].questionId}`);
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(focusedPinId()).toBe(`tl-${PREVIEW_TIMELINE[at - 1].questionId}`);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("filters by domain and by known / learning", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: /^Music/ }));
    const stage = pinButtons();
    expect(stage.length).toBe(PREVIEW_TIMELINE.filter((it) => it.domain === "music-stage").length);
    await user.click(screen.getByRole("button", { name: "All domains" }));
    expect(pinButtons()).toHaveLength(PREVIEW_TIMELINE.length);
    await user.click(screen.getByRole("tab", { name: "Learning" }));
    expect(pinButtons()).toHaveLength(PREVIEW_TIMELINE.filter((it) => !it.known).length);
  });

  it("lets the open pin be filtered away without snapping the filters back", async () => {
    const user = userEvent.setup();
    const learning = PREVIEW_TIMELINE.find((it) => !it.known);
    renderView({ initial: learning?.questionId ?? null });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Known" }));
    expect(pinButtons()).toHaveLength(PREVIEW_TIMELINE.filter((it) => it.known).length);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains where pins come from when there are none", () => {
    renderView({ empty: true });
    expect(screen.getByRole("heading", { name: "Nothing pinned yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start studying" })).toBeInTheDocument();
  });
});
