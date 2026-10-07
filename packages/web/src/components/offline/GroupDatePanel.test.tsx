import type { GroupDayMatch } from "@boardgames/core/availability/group-match";
import type { ProfileDirectoryEntry } from "@boardgames/core/protocol";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupDatePanel } from "./GroupDatePanel";
import { fitLine } from "./group-fit";

const member = (id: string, name: string): ProfileDirectoryEntry => ({
  id,
  name,
  image: null,
  tagline: null,
  accentHex: null,
  gamesOwned: 0,
  nextNightDateKey: null,
});
const MEMBERS = [member("ana", "Ana Lopez"), member("ben", "Ben"), member("cid", "Cid")];
const NAMES = new Map(MEMBERS.map((m) => [m.id, m.name]));

const match = (over: Partial<GroupDayMatch>): GroupDayMatch => ({
  date: "2026-10-16",
  can: [],
  maybe: [],
  missing: [],
  away: [],
  tier: "all",
  nightKey: "2026-10-16",
  ...over,
});

describe("fitLine", () => {
  it("says who is missing in as few words as it can", () => {
    expect(fitLine(match({ can: ["ana", "ben"], maybe: ["cid"] }), NAMES)).toBe(
      "All 3 free · 1 maybe",
    );
    expect(fitLine(match({ can: ["ben", "cid"], missing: ["ana"] }), NAMES)).toBe("All but Ana");
    expect(fitLine(match({ can: ["cid"], missing: ["ana", "ben"] }), NAMES)).toBe(
      "Missing Ana, Ben",
    );
    expect(fitLine(match({ maybe: ["ana"] }), NAMES)).toBe("Maybe");
  });
});

describe("GroupDatePanel", () => {
  const base = {
    members: MEMBERS,
    onToggle: () => {},
    onClear: () => {},
    names: NAMES,
  };

  it("asks for people before it ranks anything", () => {
    render(<GroupDatePanel {...base} selectedIds={new Set()} ranked={[]} onPickNight={() => {}} />);
    expect(screen.getByText("Pick people to see when they're free.")).toBeInTheDocument();
  });

  it("locks the ranked night's free slot", () => {
    const onPickNight = vi.fn();
    render(
      <GroupDatePanel
        {...base}
        selectedIds={new Set(["ana", "ben"])}
        ranked={[match({ can: ["ana", "ben"], nightKey: "2026-10-16_2" })]}
        onPickNight={onPickNight}
      />,
    );
    expect(screen.getByText(/2nd night/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Lock .* All 2 free$/ }));
    expect(onPickNight).toHaveBeenCalledWith("2026-10-16_2");
  });

  it("owns up when no night suits everyone", () => {
    render(
      <GroupDatePanel
        {...base}
        selectedIds={new Set(["ana", "ben", "cid"])}
        ranked={[match({ tier: "most", can: ["ana", "ben"], missing: ["cid"] })]}
        onPickNight={() => {}}
      />,
    );
    expect(screen.getByText(/No night suits everyone yet/)).toBeInTheDocument();
  });
});
