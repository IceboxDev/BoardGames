import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { apiFetch } from "./api-fetch.ts";

/**
 * Build a React Query `queryFn` that fetches `path` and validates the
 * response through `schema`. Threads the AbortSignal automatically — most
 * hand-rolled `lib/*.ts` fetchers forget to do this.
 *
 * Usage:
 *   useQuery({ queryKey: qk.calendarLocks(), queryFn: jsonQuery("/api/calendar/locks", CalendarLocksSchema) })
 */
export function jsonQuery<T>(
  path: string,
  schema: StandardSchemaV1<unknown, T>,
): (ctx: QueryFunctionContext) => Promise<T> {
  return ({ signal }) => apiFetch(path, { response: schema, signal });
}

interface MutationSchemas<TBody, TResp> {
  request?: StandardSchemaV1<unknown, TBody>;
  response: StandardSchemaV1<unknown, TResp>;
}

/**
 * Build a typed `mutationFn` for React Query mutations. Validates the
 * request body if a `request` schema is supplied, and always validates
 * the response.
 */
export function jsonMutation<TBody, TResp>(
  path: string,
  schemas: MutationSchemas<TBody, TResp>,
  init: { method?: "POST" | "PUT" | "DELETE" } = {},
): (body: TBody) => Promise<TResp> {
  return (body) =>
    apiFetch(path, {
      method: init.method ?? "POST",
      body,
      request: schemas.request,
      response: schemas.response,
    });
}
