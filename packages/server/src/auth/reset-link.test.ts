import { describe, expect, it } from "vitest";
import { captureResetToken, resetPasswordWebUrl, withResetCapture } from "./reset-link.ts";

describe("withResetCapture", () => {
  it("captures a token emitted inside the callback", async () => {
    const { result, token } = await withResetCapture(async () => {
      captureResetToken("tok_123");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(token).toBe("tok_123");
  });

  it("returns a null token when none is emitted", async () => {
    const { token } = await withResetCapture(async () => "noop");
    expect(token).toBeNull();
  });

  it("captureResetToken outside a capture scope is a no-op", () => {
    expect(() => captureResetToken("orphan")).not.toThrow();
  });

  it("keeps concurrent captures isolated", async () => {
    const [a, b] = await Promise.all([
      withResetCapture(async () => {
        await new Promise((r) => setTimeout(r, 5));
        captureResetToken("A");
      }),
      withResetCapture(async () => {
        captureResetToken("B");
      }),
    ]);
    expect(a.token).toBe("A");
    expect(b.token).toBe("B");
  });
});

describe("resetPasswordWebUrl", () => {
  it("builds a /reset-password URL with an encoded token", () => {
    const url = resetPasswordWebUrl("a b/c");
    expect(url).toContain("/reset-password?token=");
    expect(url).toContain("a%20b%2Fc");
  });
});
