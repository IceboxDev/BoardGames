import { afterEach, describe, expect, it, vi } from "vitest";
import { aiSuspended } from "./ai-suspend";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aiSuspended", () => {
  it("is off when the variable is unset or empty", () => {
    vi.stubEnv("AI_SUSPENDED", "");
    expect(aiSuspended()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("is on for %s", (value) => {
    vi.stubEnv("AI_SUSPENDED", value);
    expect(aiSuspended()).toBe(true);
  });

  it.each(["0", "false", "no", "off"])("is off for %s", (value) => {
    vi.stubEnv("AI_SUSPENDED", value);
    expect(aiSuspended()).toBe(false);
  });
});
