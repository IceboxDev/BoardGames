import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth-client BEFORE importing the hook. The hook reads
// `authClient.admin.listUsers` at call time, so we only need to stub
// that one method — each test seeds the mock with the response shape
// it wants to assert against.
const listUsersMock = vi.fn();
vi.mock("../lib/auth-client.ts", () => ({
  authClient: {
    admin: {
      listUsers: (args: unknown) => listUsersMock(args),
    },
  },
}));

import { useAdminUsers } from "./useAdminUsers";

function withClient() {
  // Each test gets a fresh QueryClient with retries disabled so an
  // intentional error doesn't trigger react-query's exponential
  // backoff (and add ~6s of test wall time).
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  listUsersMock.mockReset();
});

describe("useAdminUsers", () => {
  it("parses the admin.listUsers response through AdminUserListSchema", async () => {
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          {
            id: "u1",
            email: "a@b.com",
            name: "Anya",
            role: "admin",
            onlineMode: "both",
            createdAt: "2026-05-21T00:00:00.000Z",
          },
          {
            id: "u2",
            email: "c@d.com",
            name: "Cal",
            role: "user",
            onlineMode: "offline",
            createdAt: "2026-05-21T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });

    const { result } = renderHook(() => useAdminUsers(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].id).toBe("u1");
    expect(result.current.data?.[1].name).toBe("Cal");
  });

  it("passes a large LIST_LIMIT so consumers share a single cache entry", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    const { result } = renderHook(() => useAdminUsers(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listUsersMock).toHaveBeenCalledOnce();
    // The exact value is an implementation detail, but the contract is
    // "high enough to fit every install we ship to" — assert the limit
    // is at least 200, which is the highest value any previous inline
    // call site requested before this hook consolidated them.
    const [callArgs] = listUsersMock.mock.calls;
    const limit = (callArgs?.[0] as { query?: { limit?: number } } | undefined)?.query?.limit;
    expect(limit).toBeGreaterThanOrEqual(200);
  });

  it("throws when better-auth reports an error (RouteErrorBoundary catches it)", async () => {
    listUsersMock.mockResolvedValue({
      data: null,
      error: { message: "forbidden" },
    });

    const { result } = renderHook(() => useAdminUsers(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("forbidden");
  });

  it("falls back to a generic message when better-auth's error has no .message", async () => {
    listUsersMock.mockResolvedValue({ data: null, error: {} });
    const { result } = renderHook(() => useAdminUsers(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Failed to load users");
  });

  it("surfaces a ZodError when the wire shape is malformed", async () => {
    // A row missing `name` violates the schema — the parse rejection
    // becomes the query error, which the boundary renders as a
    // SchemaError-style "Unexpected response" screen.
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "u1", email: "a@b.com", createdAt: "2026-05-21" }] },
      error: null,
    });
    const { result } = renderHook(() => useAdminUsers(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("returns an empty array when the response omits a users field", async () => {
    listUsersMock.mockResolvedValue({ data: undefined, error: null });
    const { result } = renderHook(() => useAdminUsers(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
