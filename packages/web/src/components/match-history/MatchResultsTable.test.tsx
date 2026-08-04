import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../ui/Button";
import {
  formatDiff,
  type MatchColumn,
  MatchResultsLayout,
  MatchResultsTable,
  MatchTally,
  ResultText,
  scoreToneClass,
} from "./MatchResultsTable";

type Row = { id: number; you: number; opp: number };

const ROWS: Row[] = [
  { id: 1, you: 40, opp: 20 },
  { id: 2, you: 10, opp: 30 },
];

const COLUMNS: MatchColumn<Row>[] = [
  { id: "n", header: "#", cell: (_r, i) => i + 1 },
  {
    id: "you",
    header: "You",
    align: "right",
    cellClassName: (r) => scoreToneClass(r.you > r.opp ? "win" : "loss"),
    cell: (r) => r.you,
  },
  { id: "diff", header: "Diff", align: "right", cell: (r) => formatDiff(r.you - r.opp) },
];

describe("MatchResultsTable", () => {
  it("renders one header per column and one row per entry", () => {
    render(<MatchResultsTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    // 1 header row + 2 body rows
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("applies per-row cell classes (score coloring)", () => {
    render(<MatchResultsTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const winCell = screen.getByText("40").closest("td");
    const lossCell = screen.getByText("10").closest("td");
    expect(winCell?.className).toMatch(/text-emerald-400/);
    expect(lossCell?.className).toMatch(/text-rose-400/);
  });

  it("makes rows clickable only when onSelectRow is provided", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <MatchResultsTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />,
    );
    expect(screen.getByText("40").closest("tr")?.className).not.toMatch(/cursor-pointer/);

    rerender(
      <MatchResultsTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        onSelectRow={(r) => onSelect(r.id)}
      />,
    );
    const row = screen.getByText("40").closest("tr");
    expect(row?.className).toMatch(/cursor-pointer/);
    if (row) await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("formatDiff signs positive diffs and leaves zero/negative alone", () => {
    expect(formatDiff(12)).toBe("+12");
    expect(formatDiff(0)).toBe("0");
    expect(formatDiff(-3)).toBe("-3");
  });
});

describe("MatchResultsLayout / MatchTally / ResultText", () => {
  it("renders title, tally line and footer around the table", () => {
    render(
      <MatchResultsLayout
        title="Match History"
        tally={<MatchTally total={5} wins={3} losses={1} draws={1} />}
        footer={<Button variant="link">Back</Button>}
      >
        <div>table-here</div>
      </MatchResultsLayout>,
    );
    expect(screen.getByRole("heading", { name: "Match History" })).toBeInTheDocument();
    expect(screen.getByText("3W")).toBeInTheDocument();
    expect(screen.getByText("1L")).toBeInTheDocument();
    expect(screen.getByText("1D")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("ResultText colors by outcome", () => {
    render(
      <>
        <ResultText outcome="win">Win</ResultText>
        <ResultText outcome="draw">Draw</ResultText>
      </>,
    );
    expect(screen.getByText("Win").className).toMatch(/text-emerald-400/);
    expect(screen.getByText("Draw").className).toMatch(/text-fg-muted/);
  });
});
