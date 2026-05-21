import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { jsonMutation, jsonQuery } from "./typed-query";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("jsonQuery", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ name: "Lina" }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a function that calls apiFetch with the supplied path and signal", async () => {
    const schema = z.object({ name: z.string() });
    const queryFn = jsonQuery("/api/me", schema);
    const controller = new AbortController();
    // React Query passes a `QueryFunctionContext`; we synthesize the minimal one we need.
    const result = await queryFn({
      signal: controller.signal,
      // biome-ignore lint/suspicious/noExplicitAny: stubbed context object for the queryFn signature
    } as any);
    expect(result).toEqual({ name: "Lina" });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.signal).toBe(controller.signal);
  });
});

describe("jsonMutation", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to POST and sends the body through to apiFetch", async () => {
    const responseSchema = z.object({ ok: z.boolean() });
    const requestSchema = z.object({ slug: z.string() });
    const mutate = jsonMutation("/api/x", { request: requestSchema, response: responseSchema });
    const result = await mutate({ slug: "uno" });
    expect(result).toEqual({ ok: true });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"slug":"uno"}');
  });

  it("respects an explicit method override", async () => {
    const mutate = jsonMutation(
      "/api/x",
      { response: z.object({ ok: z.boolean() }) },
      { method: "DELETE" },
    );
    await mutate(undefined as never);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });
});
