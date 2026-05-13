// SHA-256 hash of the raw calendar-feed token. The raw token (`cs_<43>`)
// carries 256 bits of entropy and is never stored at rest — we only persist
// this digest and look it up over a UNIQUE index. Pure, no I/O, deterministic
// — placed in `core` so unit tests run in the existing vitest suite.
//
// Node and the browser both ship Web Crypto today, so we use the platform's
// subtle.digest. Async (returns a hex string) — callers await it once at
// boundary code (token mint, token lookup middleware).

const HEX = "0123456789abcdef";

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    out += HEX[b >> 4];
    out += HEX[b & 0xf];
  }
  return out;
}

export async function hashFeedToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

// Greppable redaction helper. Every log path that could touch a token must
// route the message through this so accidental token leaks become `cs_***`
// in logs and crash reports. The 43-char body is the raw token length.
const TOKEN_PATTERN = /cs_[A-Za-z0-9_-]{43}/g;
export function redactToken(s: string): string {
  return s.replace(TOKEN_PATTERN, "cs_***");
}
