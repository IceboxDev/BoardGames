import { describe, expect, it } from "vitest";
import { errorMessageOf } from "./error-message";

describe("errorMessageOf", () => {
  it("returns null for null / undefined errors", () => {
    expect(errorMessageOf(null, "fallback")).toBeNull();
    expect(errorMessageOf(undefined, "fallback")).toBeNull();
  });

  it("returns the message of an Error instance", () => {
    expect(errorMessageOf(new Error("Bad token"), "fallback")).toBe("Bad token");
  });

  it("uses the fallback when an Error has an empty / whitespace message", () => {
    expect(errorMessageOf(new Error(""), "Save failed")).toBe("Save failed");
    expect(errorMessageOf(new Error("   "), "Save failed")).toBe("Save failed");
  });

  it("returns a plain string error verbatim", () => {
    expect(errorMessageOf("Disconnected", "fallback")).toBe("Disconnected");
  });

  it("uses the fallback for a blank string error", () => {
    expect(errorMessageOf("   ", "fallback")).toBe("fallback");
    expect(errorMessageOf("", "fallback")).toBe("fallback");
  });

  it("uses the fallback for non-Error, non-string truthy values", () => {
    expect(errorMessageOf({ status: 500 }, "fallback")).toBe("fallback");
    expect(errorMessageOf(42, "fallback")).toBe("fallback");
    expect(errorMessageOf(true, "fallback")).toBe("fallback");
  });

  it("chains cleanly with ?? to combine multiple sources", () => {
    const first = errorMessageOf(null, "first failed");
    const second = errorMessageOf(new Error("second message"), "second failed");
    const third = errorMessageOf(null, "third failed");
    expect(first ?? second ?? third).toBe("second message");
  });
});
