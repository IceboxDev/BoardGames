// Wire schemas for the personal iCalendar (ICS) subscription feature.
// The raw token is a `cs_`-prefixed url-safe base64 string of 32 random bytes
// (43 chars after stripping base64 padding) — Stripe-style typed-secret prefix
// for log greppability and future secret-scanner integration. The DB never
// stores the raw token; only a sha256 hex digest.

import { z } from "zod";

export const CalendarFeedTokenSchema = z
  .string()
  .regex(/^cs_[A-Za-z0-9_-]{43}$/, "Expected 'cs_'-prefixed url-safe base64url token")
  .brand<"CalendarFeedToken">();
export type CalendarFeedToken = z.infer<typeof CalendarFeedTokenSchema>;

// Response from POST /api/calendar/feed/token. The raw token is included here
// exactly once, immediately after generation. Subsequent reads (GET /status)
// never expose it; if the user lost their URL they must regenerate.
export const CalendarFeedTokenResponseSchema = z.object({
  token: CalendarFeedTokenSchema,
  // Full https:// URL the user pastes into their calendar app.
  subscribeUrl: z.string().url(),
  // Same URL with the webcal:// scheme — Apple Calendar and most mobile
  // calendars treat this as a deep link that opens the OS subscribe sheet.
  webcalUrl: z.string().regex(/^webcal:\/\//, "Expected webcal:// scheme"),
  createdAt: z.string(),
});
export type CalendarFeedTokenResponse = z.infer<typeof CalendarFeedTokenResponseSchema>;

// Response from GET /api/calendar/feed/status. Drives the modal's three
// render states (never-connected / connected / just-regenerated) without
// exposing the token itself.
export const CalendarFeedStatusSchema = z.object({
  connected: z.boolean(),
  createdAt: z.string().nullable(),
  lastAccessedAt: z.string().nullable(),
});
export type CalendarFeedStatus = z.infer<typeof CalendarFeedStatusSchema>;
