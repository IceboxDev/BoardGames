import { scoreGroupDates } from "@boardgames/core/availability/group-match";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dateKey } from "../../lib/offline-availability";
import Calendar from "./Calendar";

const START = new Date(2026, 9, 12); // Mon 12 Oct 2026
const day = (d: number) => dateKey(new Date(2026, 9, d));

describe("Calendar — Find a date", () => {
  it("rings the dates that suit the group and dims, but keeps clickable, the rest", () => {
    const ids = new Set(["ana", "ben"]);
    const availability = {
      [day(16)]: [
        { userId: "ana", name: "Ana", status: "can" as const },
        { userId: "ben", name: "Ben", status: "maybe" as const },
        { userId: "zed", name: "Zed", status: "can" as const },
      ],
      [day(17)]: [{ userId: "ana", name: "Ana", status: "can" as const }],
    };
    const byDate = scoreGroupDates({
      group: [...ids],
      dates: Array.from({ length: 42 }, (_, i) => dateKey(new Date(2026, 9, 12 + i))),
      availability,
    });
    render(
      <Calendar
        weekStart={START}
        availability={{}}
        dayLabels={availability}
        lockMode
        onLockToggle={() => {}}
        group={{
          ids,
          byDate,
          names: new Map([
            ["ana", "Ana"],
            ["ben", "Ben Ode"],
          ]),
        }}
      />,
    );
    const all = screen.getByTitle("All 2 free (1 maybe)");
    expect(all).toBeEnabled();
    // Only the group's names: Zed marked the day but isn't who we're asking about.
    expect(all).not.toHaveTextContent("Zed");
    const short = screen.getByTitle("Missing: Ben");
    expect(short).toBeEnabled();
    expect(short.className).toContain("opacity-35");
  });
});
