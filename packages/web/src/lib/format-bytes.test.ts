import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("uses MB from 1 MiB upward", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("uses KB below 1 MiB", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(500_000)).toBe("488 KB");
  });

  // Regression: PdfDropField's copy had no KB branch, so a real 12 KB character
  // sheet rendered as "0.0 MB" in the drop field.
  it("never renders a real file as 0", () => {
    expect(formatBytes(12_000)).toBe("12 KB");
    expect(formatBytes(300)).toBe("1 KB");
    expect(formatBytes(1)).toBe("1 KB");
  });

  // The `Math.max(1, …)` floor means even a 0-byte file reads "1 KB". Pinned
  // deliberately: this is the pre-existing behavior of the KB/MB copy, and a
  // zero-byte PDF is not a case the upload flow can reach.
  it("floors at 1 KB rather than showing 0", () => {
    expect(formatBytes(0)).toBe("1 KB");
  });
});
