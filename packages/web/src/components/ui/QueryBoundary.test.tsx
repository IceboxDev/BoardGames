import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryBoundary } from "./QueryBoundary";

const base = { data: undefined, isPending: false, isError: false, error: null };

describe("QueryBoundary", () => {
  it("renders the loading state while pending", () => {
    render(<QueryBoundary query={{ ...base, isPending: true }}>{() => <p>data</p>}</QueryBoundary>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("data")).not.toBeInTheDocument();
  });

  it("renders an error alert when the query errored with no data", () => {
    render(
      <QueryBoundary query={{ ...base, isError: true, error: new Error("boom") }}>
        {() => <p>data</p>}
      </QueryBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders children with the resolved data", () => {
    render(<QueryBoundary query={{ ...base, data: "hi" }}>{(d) => <p>{d}</p>}</QueryBoundary>);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("renders the empty node when isEmpty matches", () => {
    render(
      <QueryBoundary
        query={{ ...base, data: [] as string[] }}
        isEmpty={(d) => d.length === 0}
        empty={<p>empty</p>}
      >
        {() => <p>list</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.queryByText("list")).not.toBeInTheDocument();
  });

  it("keeps showing data during a background refetch error", () => {
    render(
      <QueryBoundary query={{ ...base, data: "cached", isError: true, error: new Error("x") }}>
        {(d) => <p>{d}</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText("cached")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
