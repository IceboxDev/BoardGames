import type { Learning } from "@boardgames/core/games/chess/trainer/drill";
import { TRAINER_FOLDERS } from "@boardgames/core/games/chess/trainer/folders";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { flatten } from "./folder-tree";
import { aboutTime, etaSeconds, suggestions } from "./home-plan";
import { TrainerHome } from "./TrainerHome";

const placed = flatten(TRAINER_FOLDERS.w).filter((p) => p.parents.length > 0);
const [a, b, c, d] = placed;

const l = (over: Partial<Learning>): Learning => ({
  learnt: 0,
  learning: 0,
  fresh: 0,
  due: 0,
  practisedToday: 0,
  pending: 0,
  pendingLines: 0,
  unasked: 0,
  unreached: 0,
  ...over,
});

describe("trainer home", () => {
  it("suggests due folders first, then finished folders before ones the farm may add to", () => {
    if (!a || !b || !c || !d) throw new Error("not enough folders");
    const due = { placed: a, l: l({ learnt: 5, due: 2 }), games: 10 };
    const growing = { placed: b, l: l({ fresh: 9, pending: 3, pendingLines: 3 }), games: 9000 };
    const finished = { placed: c, l: l({ fresh: 4 }), games: 100 };
    const updated = { placed: d, l: l({ learnt: 6, fresh: 1 }), games: 50 };
    expect(suggestions([growing, finished, due, updated]).map((f) => f.placed)).toEqual([
      a,
      d,
      c,
      b,
    ]);
  });

  it("leads with the next folder, studies it whole and lets a thumbnail take its place", () => {
    if (!a || !b) throw new Error("not enough folders");
    const onDrill = vi.fn();
    render(
      <TrainerHome
        color="w"
        overview={null}
        onDrill={onDrill}
        onShowMap={() => {}}
        onShowBoard={() => {}}
        folders={[
          { placed: a, l: l({ fresh: 8 }), games: 5000 },
          { placed: b, l: l({ learnt: 3, due: 3 }), games: 10 },
        ]}
      />,
    );
    expect(screen.getByText("Due now")).toBeTruthy();
    // No move counts anywhere: a folder is studied whole.
    expect(screen.queryByText(/\d+ new/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Review the folder/ })[0] as HTMLElement);
    expect(onDrill).toHaveBeenCalledWith(b.folder.id);
    const card = screen
      .getAllByRole("button", { pressed: false })
      .find((el) => el.textContent?.includes("New")) as HTMLElement;
    fireEvent.click(card);
    expect(screen.getByText(/Selected · New/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Learn the folder/ })[0] as HTMLElement);
    expect(onDrill).toHaveBeenLastCalledWith(a.folder.id);
  });
});

describe("back from the farm", () => {
  it("waits for a folder's last position: running ends in half a job, queued after its place", () => {
    const places = {
      a: { status: "running" as const, ahead: 0 },
      b: { status: "queued" as const, ahead: 9 },
    };
    // 10 lanes, 600 s a job: b is in the first round after the running one.
    expect(etaSeconds([{ fen: "a" }], places, 10, 600)).toBe(300);
    expect(etaSeconds([{ fen: "a" }, { fen: "b" }, { fen: "gone" }], places, 10, 600)).toBe(900);
    expect(etaSeconds([{ fen: "b" }], places, 0, 600)).toBeNull();
    expect(etaSeconds([{ fen: "gone" }], places, 10, 600)).toBeNull();
    expect(aboutTime(900)).toBe("about 15 min");
    expect(aboutTime(5 * 3600)).toBe("about 5 h");
    expect(aboutTime(4 * 86400)).toBe("about 4 days");
  });
});

describe("loading", () => {
  it('shows the page\'s shape while loading, never "nothing to study"', () => {
    render(
      <TrainerHome
        color="w"
        overview={null}
        onDrill={() => {}}
        onShowMap={() => {}}
        onShowBoard={() => {}}
        folders={[]}
        loading
      />,
    );
    expect(screen.queryByText("Nothing to study yet")).toBeNull();
    expect(screen.getByText("Loading your folders…")).toBeTruthy();
  });
});
