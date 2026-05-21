import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthInvalidator } from "./AuthInvalidator";

// Mock useSession (better-auth) and the query persister so we can drive
// auth-state transitions imperatively and assert cache-wipe side effects.
vi.mock("../lib/auth-client", () => ({
  useSession: vi.fn(),
}));

const removeClient = vi.fn();
vi.mock("../lib/query-persister", () => ({
  queryPersister: { removeClient: () => removeClient() },
}));

import { useSession } from "../lib/auth-client";

const mockUseSession = vi.mocked(useSession);

function withClient(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseSession.mockReset();
  removeClient.mockReset();
});

describe("AuthInvalidator", () => {
  it("does nothing while the session is still pending (first paint)", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: true,
      // biome-ignore lint/suspicious/noExplicitAny: minimal session-hook return shim
    } as any);
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

  it("does NOT wipe on the very first non-pending render (initial sign-in)", () => {
    // initialized.current = false on mount → guard sets lastUserId and returns
    // without invalidating. Documents the intentional first-render no-op.
    mockUseSession.mockReturnValue({
      data: { user: { id: "u1" } },
      isPending: false,
      // biome-ignore lint/suspicious/noExplicitAny: minimal session-hook return shim
    } as any);
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
    let session: { data: unknown; isPending: boolean } = {
      data: { user: { id: "u1" } },
      isPending: false,
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal session-hook return shim
    mockUseSession.mockImplementation(() => session as any);
    const qc = new QueryClient();
    qc.setQueryData(["x"], "hello");
    const Wrapper = withClient(qc);
    const { rerender } = render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    // Now flip the user id and rerender — the effect should wipe + remove persisted.
    session = { data: { user: { id: "u2" } }, isPending: false };
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
    let session: { data: unknown; isPending: boolean } = {
      data: { user: { id: "u1" } },
      isPending: false,
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal session-hook return shim
    mockUseSession.mockImplementation(() => session as any);
    const qc = new QueryClient();
    qc.setQueryData(["x"], "hello");
    const Wrapper = withClient(qc);
    const { rerender } = render(
      <Wrapper>
        <AuthInvalidator />
      </Wrapper>,
    );
    session = { data: null, isPending: false };
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
    // biome-ignore lint/suspicious/noExplicitAny: minimal session-hook return shim
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false } as any);
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
