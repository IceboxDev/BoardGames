import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, SchemaError } from "../lib/api-fetch";
import { describeError, RouteErrorBoundary, RouteErrorBoundaryClass } from "./RouteErrorBoundary";

// Each test in this file deliberately throws inside a child component. The
// boundary logs to console.error, which would otherwise spam the test
// output and obscure real failures — silence it just for this suite.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// biome-ignore lint/style/useComponentExportOnlyModules: test-local throw component; never exported
function Boom({ error }: { error: unknown }): never {
  throw error;
}

function renderWithBoundary(child: React.ReactNode, initialPath = "/page-a") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/page-a" element={child} />
          <Route path="/page-b" element={<div>Page B</div>} />
        </Routes>
      </RouteErrorBoundary>
    </MemoryRouter>,
  );
}

describe("RouteErrorBoundary — happy path", () => {
  it("renders children when no error is thrown", () => {
    renderWithBoundary(<div>Hello</div>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});

describe("RouteErrorBoundary — generic Error", () => {
  it("catches and renders the generic fallback panel", () => {
    renderWithBoundary(<Boom error={new Error("oops something broke")} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred")).toBeInTheDocument();
    // Surfaces the underlying message so users can paste it into bug reports.
    expect(screen.getByText("oops something broke")).toBeInTheDocument();
    // Both recovery affordances are present.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  });

  it("wraps non-Error throws (legal in JS) instead of crashing", () => {
    renderWithBoundary(<Boom error={"string thrown directly"} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Stringified by `getDerivedStateFromError`.
    expect(screen.getByText(/string thrown directly/)).toBeInTheDocument();
  });
});

describe("RouteErrorBoundary — ApiError specialization", () => {
  it("renders the 'request failed' eyebrow and status detail for non-auth errors", () => {
    renderWithBoundary(<Boom error={new ApiError(500, "internal explosion", "DB_FAIL")} />);
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("Server returned an error")).toBeInTheDocument();
    expect(screen.getByText(/500.*DB_FAIL.*internal explosion/)).toBeInTheDocument();
  });

  it("renders the 'Not allowed' title for 401", () => {
    renderWithBoundary(<Boom error={new ApiError(401, "unauthenticated")} />);
    expect(screen.getByText("Not allowed")).toBeInTheDocument();
    expect(screen.getByText(/session may have expired/)).toBeInTheDocument();
  });

  it("renders the 'Not allowed' title for 403", () => {
    renderWithBoundary(<Boom error={new ApiError(403, "forbidden")} />);
    expect(screen.getByText("Not allowed")).toBeInTheDocument();
  });
});

describe("RouteErrorBoundary — SchemaError specialization", () => {
  it("surfaces the validation stage + path so engineers can diagnose drift", () => {
    const err = new SchemaError(
      [{ message: "Expected string, received number", path: ["users", 0, "name"] }],
      "response",
    );
    renderWithBoundary(<Boom error={err} />);
    expect(screen.getByText("Data shape mismatch")).toBeInTheDocument();
    expect(screen.getByText(/response.*users\.0\.name/)).toBeInTheDocument();
  });

  it("handles issues whose path entries are { key } objects (zod's structural shape)", () => {
    const err = new SchemaError(
      // biome-ignore lint/suspicious/noExplicitAny: simulating the legacy zod object-path shape
      [{ message: "missing", path: [{ key: "users" } as any, { key: "id" } as any] }],
      "response",
    );
    renderWithBoundary(<Boom error={err} />);
    expect(screen.getByText(/users\.id/)).toBeInTheDocument();
  });
});

describe("RouteErrorBoundary — recovery", () => {
  it('clears the error when "Try again" is clicked', async () => {
    // The child throws only the FIRST time it is rendered (anywhere in
    // the test). After the boundary resets, the child re-renders and
    // succeeds. A module-scoped counter (rather than per-instance state)
    // survives the boundary's remount so the second render observes
    // `attempts === 2` and returns the recovered DOM.
    let attempts = 0;
    function FlakyChild(): never {
      attempts += 1;
      throw new Error(`render #${attempts} boom`);
    }
    function Recovered() {
      return <div>recovered</div>;
    }
    // Swap which child the route renders between the failure and the
    // retry. This is a clean expression of "the underlying condition has
    // changed when the user retries" — without relying on any state that
    // survives the boundary's unmount cycle.
    const { rerender } = renderWithBoundary(<FlakyChild />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <MemoryRouter initialEntries={["/page-a"]}>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/page-a" element={<Recovered />} />
            <Route path="/page-b" element={<div>Page B</div>} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    // Boundary still showing error (its state hasn't cleared yet — the
    // pathname didn't change). Click Try again to flush.
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("recovered")).toBeInTheDocument();
    // React 18+ may legally retry a failing render once before settling
    // the error into the boundary, so we don't assert `attempts === 1`
    // here — what we care about is that the recovered subtree renders.
    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  it("clears the error in place when resetKey changes (auto-reset on navigation)", () => {
    // Drive the class component directly with a `resetKey` prop. This is
    // the exact contract the function wrapper relies on — when
    // `useLocation().pathname` changes, it forwards the new value as
    // `resetKey` and `getDerivedStateFromProps` clears the error without
    // remounting the subtree. The first render throws; the second render
    // changes `resetKey` AND replaces the child with a non-throwing one,
    // mirroring the route-swap that happens during a real navigation.
    const { rerender } = render(
      <RouteErrorBoundaryClass resetKey="/page-a">
        <Boom error={new Error("page A blew up")} />
      </RouteErrorBoundaryClass>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <RouteErrorBoundaryClass resetKey="/page-b">
        <div>Page B contents</div>
      </RouteErrorBoundaryClass>,
    );
    expect(screen.getByText("Page B contents")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the error in place when resetKey stays the same across rerenders", () => {
    // The complement of the previous test: same pathname → same resetKey
    // → boundary holds its error state. This guarantees that an unrelated
    // re-render of a parent (e.g. a sibling state change) doesn't
    // accidentally clear an in-flight error.
    const { rerender } = render(
      <RouteErrorBoundaryClass resetKey="/page-a">
        <Boom error={new Error("still broken")} />
      </RouteErrorBoundaryClass>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <RouteErrorBoundaryClass resetKey="/page-a">
        <div>recovered but resetKey unchanged</div>
      </RouteErrorBoundaryClass>,
    );
    // Error screen still showing — the boundary doesn't auto-clear.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("recovered but resetKey unchanged")).toBeNull();
  });
});

describe("describeError — pure mapping", () => {
  it("classifies ApiError 401 as 'Not allowed'", () => {
    expect(describeError(new ApiError(401, "no")).title).toBe("Not allowed");
  });

  it("classifies ApiError 500 as 'Server returned an error'", () => {
    expect(describeError(new ApiError(500, "no")).title).toBe("Server returned an error");
  });

  it("classifies SchemaError with the data-shape title", () => {
    const e = new SchemaError([{ message: "bad", path: [] }], "request");
    expect(describeError(e).title).toBe("Unexpected response");
  });

  it("falls back to a generic title for plain Errors", () => {
    expect(describeError(new Error("boom")).title).toBe("An unexpected error occurred");
  });
});
