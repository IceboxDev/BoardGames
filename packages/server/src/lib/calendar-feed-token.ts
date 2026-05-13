// Server-side token minting for the personal iCalendar feed.
//
// Raw token format: `cs_<43-char url-safe base64url>`. 32 random bytes
// (256 bits of entropy) from Node's `crypto.randomBytes` → base64 → strip
// `=` padding → swap `+`/`/` to `-`/`_`. The `cs_` prefix is a Stripe-style
// typed-secret marker so accidental leaks become trivially greppable.
//
// We never persist the raw token; the caller hashes it via core's
// `hashFeedToken` and stores the digest. The plaintext leaves the server
// exactly once, in the POST /api/calendar/feed/token response.

import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 32; // 256 bits of entropy; base64 yields 44 chars → 43 after stripping '='.

export function generateRawToken(): string {
  // `base64url` encoding emits the url-safe alphabet (`-` `_`) and omits
  // padding, matching the regex enforced by CalendarFeedTokenSchema.
  const body = randomBytes(TOKEN_BYTES).toString("base64url");
  return `cs_${body}`;
}
