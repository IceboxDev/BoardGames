import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-fetch.ts";
import { PlayerPageFrame, PlayerQueryBoundary } from "./PlayerPageFrame";

function query<T>(over: Partial<{ data: T; isPending: boolean; error: unknown }>) {
  return {
    data: over.data,
    isPending: over.isPending ?? false,
    isError: over.error !== undefined,
    error: over.error,
    refetch: vi.fn(),
  };
}

const COPY = {
  loadingLabel: "Loading the thing…",
  errorTitle: "Couldn't load the thing",
  errorDescription: "Something went wrong fetching the thing. Try again.",
};

describe("PlayerQueryBoundary", () => {
  it("renders the labelled loading state while pending", () => {
    render(
      <PlayerQueryBoundary query={query<string>({ isPending: true })} {...COPY}>
        {(d) => <p>{d}</p>}
      </PlayerQueryBoundary>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading the thing…");
  });

  it("reads a 404 as 'Player not found' with the shared copy", () => {
    render(
      <PlayerQueryBoundary query={query<string>({ error: new ApiError(404, "nope") })} {...COPY}>
        {(d) => <p>{d}</p>}
      </PlayerQueryBoundary>,
    );
    expect(screen.getByText("Player not found")).toBeInTheDocument();
    expect(screen.getByText("This player doesn't exist or has been removed.")).toBeInTheDocument();
  });

  it("uses the page's own copy for any other failure, with a working Retry", async () => {
    const q = query<string>({ error: new Error("boom") });
    render(
      <PlayerQueryBoundary query={q} {...COPY}>
        {(d) => <p>{d}</p>}
      </PlayerQueryBoundary>,
    );
    expect(screen.getByText("Couldn't load the thing")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(q.refetch).toHaveBeenCalledTimes(1);
  });

  it("lets `resolveError` take first say and fall through with null", () => {
    const resolveError = (error: unknown) =>
      error instanceof ApiError && error.code === undefined
        ? { title: "Rolling out", description: "Give it a minute." }
        : null;
    const { rerender } = render(
      <PlayerQueryBoundary
        query={query<string>({ error: new ApiError(404, "x") })}
        resolveError={resolveError}
        {...COPY}
      >
        {(d) => <p>{d}</p>}
      </PlayerQueryBoundary>,
    );
    expect(screen.getByText("Rolling out")).toBeInTheDocument();
    rerender(
      <PlayerQueryBoundary
        query={query<string>({
          error: new ApiError(404, "x", "NOT_FOUND"),
        })}
        resolveError={resolveError}
        {...COPY}
      >
        {(d) => <p>{d}</p>}
      </PlayerQueryBoundary>,
    );
    expect(screen.getByText("Player not found")).toBeInTheDocument();
  });

  it("renders the data branch through the render prop", () => {
    render(
      <PlayerQueryBoundary query={query({ data: "payload" })} {...COPY}>
        {(d) => <p>got {d}</p>}
      </PlayerQueryBoundary>,
    );
    expect(screen.getByText("got payload")).toBeInTheDocument();
  });
});

describe("PlayerPageFrame", () => {
  it("adds the top nav with a Back button to the given target", () => {
    render(
      <MemoryRouter>
        <PlayerPageFrame query={query({ data: 1 })} back="/u/u1" {...COPY}>
          {() => <p>body</p>}
        </PlayerPageFrame>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/u/u1");
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
