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
// ← / → walk the river, district filters narrow it, and an empty timeline
// explains where pins come from.

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

const PATHS = trainerPaths("/play/quiztopia/solo");

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
});

const pinButtons = () => screen.getAllByRole("button").filter((b) => b.id.startsWith("tl-c"));

const focusedPinId = () =>
  document.querySelector('button[id^="tl-c"][aria-pressed="true"]')?.id ?? null;

describe("TimelineView", () => {
  it("renders every pin in time order under the seven eras", () => {
    renderView();
    const ids = pinButtons().map((b) => b.id.replace(/^tl-/, ""));
    expect(ids).toEqual(PREVIEW_TIMELINE.map((it) => it.questionId));
    expect(ids[0]).toBe("c010-s10-q0"); // the Big Bang first
    expect(screen.getByText("c. 13.8 billion years ago")).toBeInTheDocument();
    expect(screen.getByText("15 March 44 BC")).toBeInTheDocument();
    expect(screen.getByText("born 1954")).toBeInTheDocument();
    expect(screen.getByText(/moments pinned across/)).toBeInTheDocument();
  });

  it("opens a focused pin's detail and walks it with the arrow keys", async () => {
    const user = userEvent.setup();
    renderView({ initial: "c037-s01-q1" });
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
    expect(within(detail).getByRole("link", { name: /Read in the wiki/ })).toHaveAttribute(
      "href",
      "/play/quiztopia/solo/wiki/stage-music/c037#q2",
    );
    const at = PREVIEW_TIMELINE.findIndex((it) => it.questionId === "c037-s01-q1");
    await user.keyboard("{ArrowRight}");
    expect(focusedPinId()).toBe(`tl-${PREVIEW_TIMELINE[at + 1].questionId}`);
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(focusedPinId()).toBe(`tl-${PREVIEW_TIMELINE[at - 1].questionId}`);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("filters by district and by known / learning", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: /Stage & Music/ }));
    const stage = pinButtons();
    expect(stage.length).toBe(PREVIEW_TIMELINE.filter((it) => it.n === 1).length);
    await user.click(screen.getByRole("button", { name: "All districts" }));
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
