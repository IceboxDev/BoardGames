import { ErrorResponseSchema } from "@boardgames/core/protocol/common";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { apiUrl } from "./api-base.ts";

// ── Errors ─────────────────────────────────────────────────────────────

/** Thrown for non-2xx responses; `message` is the server's error envelope. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown when a payload (request or response) doesn't match its schema. */
export class SchemaError extends Error {
  constructor(
    public readonly issues: readonly StandardSchemaV1.Issue[],
    public readonly stage: "request" | "response",
  ) {
    const path = issues[0]?.path
      ?.map((p: PropertyKey | { key: PropertyKey }) => (typeof p === "object" ? p.key : p))
      .join(".");
    super(
      `Schema validation failed (${stage})${path ? ` at "${path}"` : ""}: ${issues[0]?.message ?? "unknown"}`,
    );
    this.name = "SchemaError";
  }
}

// ── apiFetch ───────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiFetchOptions<TBody, TResp> {
  method?: HttpMethod;
  body?: TBody;
  /**
   * Optional symmetric request validation. Cheap and catches typos.
   * Typed against the schema's INPUT so callers can pass raw strings for
   * branded fields (DateKey, TimeOfDay, etc.) — the schema brands at
   * `validate()` time, but the JSON payload on the wire is the raw input.
   */
  request?: StandardSchemaV1<TBody, unknown>;
  /** Required: the response is parsed through this; TResp is the output. */
  response: StandardSchemaV1<unknown, TResp>;
  signal?: AbortSignal;
}

/**
 * Typed JSON fetch with schema validation on both ends.
 *
 * - 401 / non-2xx → {@link ApiError} carrying the server's `{ error, code }` envelope.
 * - Bad shape → {@link SchemaError} with the offending path.
 * - Network error / abort → re-thrown verbatim.
 *
 * Always sends `credentials: "include"` to preserve session cookies.
 */
export async function apiFetch<TResp, TBody = void>(
  path: string,
  opts: ApiFetchOptions<TBody, TResp>,
): Promise<TResp> {
  const { method = "GET", body, request, response, signal } = opts;

  if (request && body !== undefined) {
    const validated = await runStandard(request, body);
    if (validated.issues) throw new SchemaError(validated.issues, "request");
  }

  const init: RequestInit = { method, credentials: "include", signal };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(apiUrl(path), init);

  if (!res.ok) {
    const envelope = await readErrorEnvelope(res);
    throw new ApiError(res.status, envelope.error, envelope.code);
  }

  // 204 No Content / empty body → assume the response schema accepts undefined.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    const validated = await runStandard(response, undefined);
    if (validated.issues) throw new SchemaError(validated.issues, "response");
    return validated.value;
  }

  const json = (await res.json()) as unknown;
  const validated = await runStandard(response, json);
  if (validated.issues) throw new SchemaError(validated.issues, "response");
  return validated.value;
}

// ── Internals ──────────────────────────────────────────────────────────

async function runStandard<T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown,
): Promise<StandardSchemaV1.Result<T>> {
  const result = schema["~standard"].validate(value);
  return result instanceof Promise ? await result : result;
}

async function readErrorEnvelope(res: Response): Promise<{ error: string; code?: string }> {
  try {
    const json = (await res.json()) as unknown;
    const parsed = ErrorResponseSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // Not JSON or malformed — fall through.
  }
  return { error: `Request failed (${res.status})` };
}
