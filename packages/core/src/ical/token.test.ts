import { describe, expect, it } from "vitest";
import { hashFeedToken, redactToken } from "./token.ts";

describe("hashFeedToken", () => {
  it("matches a known SHA-256 vector for ASCII input", async () => {
    // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const got = await hashFeedToken("hello");
    expect(got).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("hashes the empty string to the canonical SHA-256 of zero bytes", async () => {
    const got = await hashFeedToken("");
    expect(got).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is deterministic — same input yields same digest", async () => {
    const raw = `cs_${"a".repeat(43)}`;
    const a = await hashFeedToken(raw);
    const b = await hashFeedToken(raw);
    expect(a).toBe(b);
  });

  it("produces a 64-char lowercase hex digest", async () => {
    const got = await hashFeedToken(`cs_${"a".repeat(43)}`);
    expect(got).toMatch(/^[0-9a-f]{64}$/);
  });

  it("yields distinct digests for distinct tokens", async () => {
    const a = await hashFeedToken(`cs_${"a".repeat(43)}`);
    const b = await hashFeedToken(`cs_${"b".repeat(43)}`);
    expect(a).not.toBe(b);
  });

  it("UTF-8 encodes the input", async () => {
    // Distinct UTF-8 bytes for emoji vs the literal 4-char escape produce
    // distinct digests — guards against an accidental UTF-16 encoding.
    const a = await hashFeedToken("🎲");
    const b = await hashFeedToken("\\u{1f3b2}");
    expect(a).not.toBe(b);
  });
});

describe("redactToken", () => {
  it("redacts a single cs_ token in a log message", () => {
    const raw = `cs_${"a".repeat(43)}`;
    expect(redactToken(`Token rejected: ${raw}`)).toBe("Token rejected: cs_***");
  });

  it("redacts multiple tokens in the same string", () => {
    const a = `cs_${"a".repeat(43)}`;
    const b = `cs_${"b".repeat(43)}`;
    expect(redactToken(`old=${a} new=${b}`)).toBe("old=cs_*** new=cs_***");
  });

  it("leaves messages without a token shape intact", () => {
    expect(redactToken("nothing to redact here")).toBe("nothing to redact here");
  });

  it("does not redact strings shorter than 43 chars after the prefix", () => {
    expect(redactToken(`cs_${"a".repeat(20)}`)).toBe(`cs_${"a".repeat(20)}`);
  });
});
