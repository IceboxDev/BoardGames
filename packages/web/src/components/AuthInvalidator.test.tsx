import type { SessionUser } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthInvalidator } from "./AuthInvalidator";

// AuthInvalidator now reads from `useCurrentUser` rather than directly
// from better-auth's `useSession`. Mocking the hook lets each test drive
// auth state imperatively without having to plumb a full session through.
vi.mock("../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: vi.fn(),
}));

const removeClient = vi.fn();
vi.mock("../lib/query-persister", () => ({
  queryPersister: { removeClient: () => removeClient() },
}));

import { useCurrentUser } from "../hooks/useCurrentUser.ts";

const mockUseCurrentUser = vi.mocked(useCurrentUser);

type Result = ReturnType<typeof useCurrentUser>;

function withClient(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// Build a minimum-shape SessionUser fixture; the invalidator only reads
// `.id`, so we cast to satisfy the type without filling every field.
function userWithId(id: string): SessionUser {
  return { id, email: `${id}@example.com`, role: "user", onlineEnabled: false } as SessionUser;
}

beforeEach(() => {
  mockUseCurrentUser.mockReset();
  removeClient.mockReset();
});

describe("AuthInvalidator", () => {
  it("does nothing while the session is still loading (first paint)", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: true, isAdmin: false } as Result);
    const qc = new QueryClient();
    const Wrapper = withClient(qc);
    qc.setQueryData(["x"], "hello");
    render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    expect(qc.getQueryData(["x"])).toBe("hello");
    expect(removeClient).not.toHaveBeenCalled();
  });

  it("does NOT wipe on the very first non-loading render (initial sign-in)", () => {
    // initialized.current = false on mount → guard sets lastUserId and
    // returns without invalidating. Documents the intentional first-render
    // no-op.
    mockUseCurrentUser.mockReturnValue({
      user: userWithId("u1"),
      isLoading: false,
      isAdmin: false,
    } as Result);
    const qc = new QueryClient();
    qc.setQueryData(["x"], "hello");
    const Wrapper = withClient(qc);
    render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    expect(qc.getQueryData(["x"])).toBe("hello");
    expect(removeClient).not.toHaveBeenCalled();
  });

  it("wipes the cache + persister when the user id changes (sign-out → sign-in as someone else)", () => {
    let result: Result = { user: userWithId("u1"), isLoading: false, isAdmin: false } as Result;
    mockUseCurrentUser.mockImplementation(() => result);
    const qc = new QueryClient();
    qc.setQueryData(["x"], "hello");
    const Wrapper = withClient(qc);
    const { rerender } = render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    // Flip the user id and rerender — the effect should wipe + remove
    // persisted.
    result = { user: userWithId("u2"), isLoading: false, isAdmin: false } as Result;
    act(() => {
      rerender(
        <Wrapper>
          <AuthInvalidator />
        </Wrapper>,
      );
    });
    expect(qc.getQueryData(["x"])).toBeUndefined();
    expect(removeClient).toHaveBeenCalledTimes(1);
  });

  it("wipes when the user signs out (user id goes from set to null)", () => {
    let result: Result = { user: userWithId("u1"), isLoading: false, isAdmin: false } as Result;
    mockUseCurrentUser.mockImplementation(() => result);
    const qc = new QueryClient();
    qc.setQueryData(["x"], "hello");
    const Wrapper = withClient(qc);
    const { rerender } = render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    result = { user: null, isLoading: false, isAdmin: false } as Result;
    act(() => {
      rerender(
        <Wrapper>
          <AuthInvalidator />
        </Wrapper>,
      );
    });
    expect(qc.getQueryData(["x"])).toBeUndefined();
    expect(removeClient).toHaveBeenCalledTimes(1);
  });

  it("does NOT wipe when the user id stays the same across rerenders", () => {
    mockUseCurrentUser.mockReturnValue({
      user: userWithId("u1"),
      isLoading: false,
      isAdmin: false,
    } as Result);
    const qc = new QueryClient();
    qc.setQueryData(["x"], "hello");
    const Wrapper = withClient(qc);
    const { rerender } = render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    act(() =>
      rerender(
        <Wrapper>
          <AuthInvalidator />
        </Wrapper>,
      ),
    );
    expect(qc.getQueryData(["x"])).toBe("hello");
    expect(removeClient).not.toHaveBeenCalled();
  });
});
