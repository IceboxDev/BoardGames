import { afterEach, describe, expect, it, vi } from "vitest";
import { aiAvailable, resolveModel, resolveTransport } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

function clearAiEnv() {
  for (const name of [
    "AI_MODEL",
    "AI_MODEL_DND",
    "AI_MODEL_DND_EXTRACT",
    "AI_MODEL_AVATAR",
    "AI_TRANSPORT",
    "AI_TRANSPORT_DND_EXTRACT",
    "AI_GATEWAY_API_KEY",
    "OPENAI_API_KEY",
    "AI_SUSPENDED",
  ]) {
    vi.stubEnv(name, "");
  }
}

describe("resolveModel", () => {
  it("prefers override, then feature var, then AI_MODEL, then the default", () => {
    clearAiEnv();
    expect(resolveModel("dnd", "x/override")).toBe("x/override");
    vi.stubEnv("AI_MODEL_DND", "a/feature");
    vi.stubEnv("AI_MODEL", "b/global");
    expect(resolveModel("dnd")).toBe("a/feature");
    vi.stubEnv("AI_MODEL_DND", "");
    expect(resolveModel("dnd")).toBe("b/global");
    vi.stubEnv("AI_MODEL", "");
    expect(resolveModel("dnd")).toBe("openai/gpt-5.2");
  });

  it("never falls avatar back to the global text model", () => {
    clearAiEnv();
    vi.stubEnv("AI_MODEL", "b/global-text");
    expect(resolveModel("avatar")).toBe("google/gemini-3.1-flash-image");
    vi.stubEnv("AI_MODEL_AVATAR", "g/image");
    expect(resolveModel("avatar")).toBe("g/image");
  });
});

describe("resolveTransport", () => {
  it("defaults to stream and honors feature-specific overrides", () => {
    clearAiEnv();
    expect(resolveTransport("dnd")).toBe("stream");
    vi.stubEnv("AI_TRANSPORT", "sync");
    expect(resolveTransport("dnd")).toBe("sync");
    vi.stubEnv("AI_TRANSPORT_DND_EXTRACT", "openai-background");
    expect(resolveTransport("dnd-extract")).toBe("openai-background");
    expect(resolveTransport("dnd")).toBe("sync");
  });

  it("ignores unknown transport values", () => {
    clearAiEnv();
    vi.stubEnv("AI_TRANSPORT", "carrier-pigeon");
    expect(resolveTransport("dnd")).toBe("stream");
  });
});

describe("aiAvailable", () => {
  it("requires a key and no suspension", () => {
    clearAiEnv();
    expect(aiAvailable()).toBe(false);
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    expect(aiAvailable()).toBe(true);
    vi.stubEnv("AI_SUSPENDED", "1");
    expect(aiAvailable()).toBe(false);
  });

  it("counts the OpenAI escape hatch as available", () => {
    clearAiEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk");
    expect(aiAvailable()).toBe(true);
  });
});
