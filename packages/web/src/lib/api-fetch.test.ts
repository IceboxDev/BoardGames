import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiFetch, SchemaError } from "./api-fetch";

// Helper for constructing fetch responses without juggling Response.json args.
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

describe("apiFetch — happy path", () => {
  const responseSchema = z.object({ ok: z.boolean(), name: z.string() });
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true, name: "Mantas" }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the response through the schema and returns the typed value", async () => {
    const out = await apiFetch("/api/me", { response: responseSchema });
    expect(out).toEqual({ ok: true, name: "Mantas" });
  });

  it("sends GET by default with credentials: include", async () => {
    await apiFetch("/api/me", { response: responseSchema });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    // No Content-Type when there's no body.
    expect(init.headers).toBeUndefined();
  });

  it("serializes JSON body, sets Content-Type, and validates request schema", async () => {
    const requestSchema = z.object({ name: z.string().min(1) });
    await apiFetch("/api/echo", {
      method: "POST",
      body: { name: "Lina" },
      request: requestSchema,
      response: responseSchema,
    });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"name":"Lina"}');
  });

  it("passes the AbortSignal through to fetch", async () => {
    const controller = new AbortController();
    await apiFetch("/api/me", { response: responseSchema, signal: controller.signal });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("treats 204 No Content as undefined and validates it through the schema", async () => {
    fetchSpy.mockResolvedValueOnce(noContent());
    const schema = z.undefined();
    const out = await apiFetch<undefined>("/api/whatever", {
      method: "DELETE",
      response: schema,
    });
    expect(out).toBeUndefined();
  });

  it('treats content-length: "0" the same as 204', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { "content-length": "0" } }),
    );
    const schema = z.undefined();
    await expect(apiFetch("/api/empty", { response: schema })).resolves.toBeUndefined();
  });
});

describe("apiFetch — error paths", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ApiError carrying the server's error envelope (string + code)", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: "Unauthorized", code: "auth/required" }, { status: 401 }),
    );
    const responseSchema = z.unknown();
    let caught: unknown;
    try {
      await apiFetch("/api/me", { response: responseSchema });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.status).toBe(401);
    expect(err.message).toBe("Unauthorized");
    expect(err.code).toBe("auth/required");
  });

  it("falls back to a generic message if the error envelope can't be parsed", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("not json", { status: 500 }));
    let caught: unknown;
    try {
      await apiFetch("/api/x", { response: z.unknown() });
    } catch (err) {
      caught = err;
    }
    const err = caught as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("Request failed (500)");
  });

  it("throws SchemaError on a malformed response body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: "yes" }));
    const responseSchema = z.object({ ok: z.boolean() });
    let caught: unknown;
    try {
      await apiFetch("/api/me", { response: responseSchema });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaError);
    expect((caught as SchemaError).stage).toBe("response");
  });

  it("throws SchemaError on a malformed request body (does not call fetch)", async () => {
    const requestSchema = z.object({ name: z.string().min(1) });
    let caught: unknown;
    try {
      await apiFetch("/api/echo", {
        method: "POST",
        body: { name: "" },
        request: requestSchema,
        response: z.unknown(),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaError);
    expect((caught as SchemaError).stage).toBe("request");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-throws AbortError from a cancelled signal", async () => {
    const controller = new AbortController();
    fetchSpy.mockImplementationOnce(() =>
      Promise.reject(new DOMException("aborted", "AbortError")),
    );
    controller.abort();
    await expect(
      apiFetch("/api/me", { response: z.unknown(), signal: controller.signal }),
    ).rejects.toThrow("aborted");
  });
});
