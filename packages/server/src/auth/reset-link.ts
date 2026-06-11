// Password reset without email. The admin mints a one-time reset link in
// Admin → Users; better-auth's `sendResetPassword` callback (auth/config.ts)
// hands the freshly-minted token to the in-memory sink below, and the admin
// endpoint reads it right after awaiting `auth.api.requestPasswordReset`.
//
// Why AsyncLocalStorage: the callback is invoked *inside* the request's async
// context, so the capture is scoped per-call and concurrency-safe — two admins
// minting links at once never cross tokens. Nothing is persisted (better-auth
// owns the short-lived `verification` row, single-use + expiry); we add no
// table and surface the token exactly once over HTTPS.

import { AsyncLocalStorage } from "node:async_hooks";

type ResetSink = { token: string | null };

const resetStore = new AsyncLocalStorage<ResetSink>();

/** Called by the better-auth `sendResetPassword` callback. No-op outside a capture scope. */
export function captureResetToken(token: string): void {
  const sink = resetStore.getStore();
  if (sink) sink.token = token;
}

/**
 * Run `fn` (a call to `auth.api.requestPasswordReset`) while capturing any reset
 * token emitted by `sendResetPassword`. Returns the fn's result plus the token
 * (null when none was emitted — e.g. the email had no account).
 */
export async function withResetCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; token: string | null }> {
  const sink: ResetSink = { token: null };
  const result = await resetStore.run(sink, fn);
  return { result, token: sink.token };
}

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** First configured web origin, or the Vite dev server in development. */
export function webOrigin(): string {
  const first = (process.env.WEB_ORIGIN ?? "").split(",")[0] ?? "";
  return normalizeOrigin(first) || "http://localhost:5173";
}

/** The one-time, copy-and-share reset URL the admin hands to the user. */
export function resetPasswordWebUrl(token: string): string {
  return `${webOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
}
