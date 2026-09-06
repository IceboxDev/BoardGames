import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { WIDE_BOARD_QUERY } from "../../hooks/useMediaQuery";
import GameScreen from "./GameScreen";

// The phone-safety contract. Rails are mounted in exactly one place: in the
// board row when the viewport is wide, in a bottom sheet behind the rail bar
// when it is not. The old default rendered both rails at every width, which
// on a 360px phone spent 544px on chrome before the board got a pixel.

function setViewport(wide: boolean) {
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === WIDE_BOARD_QUERY ? wide : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return () => Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
}

// biome-ignore lint/style/useComponentExportOnlyModules: test fixture
function Board(props: Partial<Parameters<typeof GameScreen>[0]>) {
  return (
    <GameScreen
      leftSidebar={<div>score-rail</div>}
      sidebar={<div>history-rail</div>}
      fan={<div>fan</div>}
      {...props}
    >
      <div>board</div>
    </GameScreen>
  );
}

describe("GameScreen — rails", () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it("wide: mounts both rails in the row at the layout rail widths, no rail bar", () => {
    restore = setViewport(true);
    render(<Board leftSidebarTitle="Score" />);
    const asides = screen.getAllByRole("complementary");
    expect(asides).toHaveLength(2);
    expect(asides[0]?.className).toContain("w-board-rail");
    expect(asides[1]?.className).toContain("w-history-rail");
    expect(screen.getByText("score-rail")).toBeInTheDocument();
    expect(screen.getByText("history-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("rail-bar")).toBeNull();
  });

  it("narrow: no rails in the row; the rail bar opens each rail in a bottom sheet", async () => {
    restore = setViewport(false);
    render(<Board leftSidebarTitle="Score" />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByText("score-rail")).toBeNull();
    expect(screen.queryByText("history-rail")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Score" }));
    const sheet = screen.getByRole("dialog", { name: "Score" });
    expect(sheet.dataset.side).toBe("bottom");
    expect(screen.getByText("score-rail")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("dialog", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText("history-rail")).toBeInTheDocument();
  });

  it("narrow: the left rail's sheet takes `leftSidebarLabel`, then the title, then 'Score'", () => {
    restore = setViewport(false);
    const { rerender } = render(<Board leftSidebarTitle="Approach" leftSidebarLabel="Players" />);
    expect(screen.getByRole("button", { name: "Players" })).toBeInTheDocument();
    rerender(<Board leftSidebarTitle="Approach" />);
    expect(screen.getByRole("button", { name: "Approach" })).toBeInTheDocument();
    rerender(<Board />);
    expect(screen.getByRole("button", { name: "Score" })).toBeInTheDocument();
  });

  it("narrow: only renders a button for rails the game actually passes", () => {
    restore = setViewport(false);
    render(
      <GameScreen sidebar={<div>history-rail</div>}>
        <div>board</div>
      </GameScreen>,
    );
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Score" })).toBeNull();
  });

  it("narrow + mobileRails='none': the game owns its phone panels — no rail bar", () => {
    restore = setViewport(false);
    render(<Board mobileRails="none" />);
    expect(screen.queryByTestId("rail-bar")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("narrow + pinSidebars: legacy always-visible rails", () => {
    restore = setViewport(false);
    render(<Board pinSidebars />);
    expect(screen.getAllByRole("complementary")).toHaveLength(2);
    expect(screen.queryByTestId("rail-bar")).toBeNull();
  });

  it("no rails at all: nothing extra is rendered at any width", () => {
    restore = setViewport(false);
    render(
      <GameScreen>
        <div>board</div>
      </GameScreen>,
    );
    expect(screen.queryByTestId("rail-bar")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
