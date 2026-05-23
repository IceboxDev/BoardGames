// Short-lived WebSocket auth tickets.
//
// In prod the browser talks to the API over the Vercel `/api` proxy, so the
// better-auth session cookie is scoped to the *web* origin. The WebSocket,
// however, dials the API server directly (cross-origin to Railway) because
// Vercel can't proxy WS upgrades — so that cookie never reaches the `/ws`
// handshake. The client first fetches a ticket over the cookie-authed HTTP
// path (`GET /api/ws-ticket`) and appends it as `?ticket=` to the WS URL;
// the upgrade middleware (`requireWsAuth`) verifies it.
//
// The ticket is an HMAC-signed `{u: userId, e: expiry}` blob keyed on the
// same secret better-auth uses. It is short-lived (the client fetches a fresh
// one on every connect attempt) so the replay window is tiny.

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const TICKET_TTL_MS = 30_000;

// Falls back to a fixed dev string when the secret is unset (local dev relies
// on the same-origin cookie anyway). Signing and verifying both run in the
// same process, so whatever this resolves to is internally consistent.
function ticketSecret(): string {
  return process.env.BETTER_AUTH_SECRET ?? "dev-insecure-ws-ticket-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
}

const TicketPayloadSchema = z.object({
  u: z.string().min(1),
  e: z.number(),
});

export function signWsTicket(userId: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + TICKET_TTL_MS })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId for a valid, unexpired ticket, or `null` otherwise. */
export function verifyWsTicket(ticket: string, now: number = Date.now()): string | null {
  const dot = ticket.indexOf(".");
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const provided = ticket.slice(dot + 1);

  const expectedBuf = Buffer.from(sign(payload));
  const providedBuf = Buffer.from(provided);
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(providedBuf, expectedBuf)) return null;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = TicketPayloadSchema.safeParse(json);
  if (!parsed.success) return null;
  if (now > parsed.data.e) return null;
  return parsed.data.u;
}
