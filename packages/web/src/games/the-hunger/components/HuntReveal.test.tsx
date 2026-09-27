import { buildPlayerView } from "@boardgames/core/games/the-hunger/player-view";
import { afterSetup } from "@boardgames/core/games/the-hunger/test-helpers";
import type { HungerPlayerView, LogEntry } from "@boardgames/core/games/the-hunger/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HuntReveal from "./HuntReveal";

const tavernHunt: LogEntry = {
  t: "hunt",
  p: 0,
  source: "tavern",
  cards: ["mindy#0", "tyson#0"],
  vp: 1,
};

function withLog(view: HungerPlayerView, ...entries: LogEntry[]): HungerPlayerView {
  return { ...view, log: [...view.log, ...entries] };
}

describe("HuntReveal", () => {
  it("shows the Tavern's cards face up once you hunt it", () => {
    const view = buildPlayerView(afterSetup(2, 7), 0);
    const { rerender } = render(<HuntReveal view={view} />);
    expect(screen.queryByText("What was hiding in the Tavern")).toBeNull();
    rerender(<HuntReveal view={withLog(view, tavernHunt)} />);
    expect(screen.getByText("What was hiding in the Tavern")).toBeInTheDocument();
    expect(screen.getByText(/2 cards, now yours · \+1 VP/)).toBeInTheDocument();
  });

  it("stays shut for history already on screen, and for someone else's hunt", () => {
    const view = withLog(buildPlayerView(afterSetup(2, 7), 0), tavernHunt);
    const { rerender } = render(<HuntReveal view={view} />);
    expect(screen.queryByText("What was hiding in the Tavern")).toBeNull();
    rerender(<HuntReveal view={withLog(view, { ...tavernHunt, p: 1 })} />);
    expect(screen.queryByText("What was hiding in the Tavern")).toBeNull();
  });
});
