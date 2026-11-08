import { afterEach, describe, expect, it, vi } from "vitest";
import { aiAvailable, resolveModel, resolveTransport, tierModel } from "./config";
import { type AiRole, PROFILES, parseModelId, roleModel } from "./models";
import { hasListPrice } from "./pricing";

afterEach(() => {
  vi.unstubAllEnvs();
});

function clearAiEnv() {
  for (const name of [
    "AI_PROFILE",
    "AI_MODEL",
    "AI_MODEL_DND",
    "AI_MODEL_DND_EXTRACT",
    "AI_MODEL_AVATAR",
    "AI_TRANSPORT",
    "AI_TRANSPORT_DND_EXTRACT",
    "AI_GATEWAY_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "AI_SUSPENDED",
    "CODENAMES_MODEL_EXPERT",
  ]) {
    vi.stubEnv(name, "");
  }
}

describe("parseModelId", () => {
  it("reads registry ids and treats bare slugs as gateway slugs", () => {
    expect(parseModelId("anthropic:claude-opus-5-5")).toEqual({
      id: "anthropic:claude-opus-5-5",
      provider: "anthropic",
      model: "claude-opus-5-5",
    });
    expect(parseModelId("openai/gpt-5.2")).toEqual({
      id: "gateway:openai/gpt-5.2",
      provider: "gateway",
      model: "openai/gpt-5.2",
    });
  });
});

describe("resolveModel", () => {
  it("prefers override, then feature var, then AI_MODEL, then the profile's role", () => {
    clearAiEnv();
    expect(resolveModel("dnd", "x/override").id).toBe("gateway:x/override");
    vi.stubEnv("AI_MODEL_DND", "a/feature");
    vi.stubEnv("AI_MODEL", "anthropic:claude-sonnet-5-5");
    expect(resolveModel("dnd").id).toBe("gateway:a/feature");
    vi.stubEnv("AI_MODEL_DND", "");
    expect(resolveModel("dnd").id).toBe("anthropic:claude-sonnet-5-5");
    vi.stubEnv("AI_MODEL", "");
    expect(resolveModel("dnd").id).toBe("gateway:openai/gpt-5.2");
  });

  it("follows the profile", () => {
    clearAiEnv();
    vi.stubEnv("AI_PROFILE", "anthropic");
    expect(resolveModel("dnd").id).toBe("anthropic:claude-opus-5-5");
    expect(resolveModel("probe").id).toBe("anthropic:claude-haiku-5-5");
  });

  it("rejects an unknown profile", () => {
    clearAiEnv();
    vi.stubEnv("AI_PROFILE", "carrier-pigeon");
    expect(() => resolveModel("dnd")).toThrow(/AI_PROFILE/);
  });

  it("never falls avatar back to the global text model", () => {
    clearAiEnv();
    vi.stubEnv("AI_MODEL", "b/global-text");
    expect(resolveModel("avatar").id).toBe("gateway:google/gemini-3.1-flash-image");
    vi.stubEnv("AI_MODEL_AVATAR", "g/image");
    expect(resolveModel("avatar").id).toBe("gateway:g/image");
  });

  it("gives an image-less profile the gateway's image model only when its key is set", () => {
    clearAiEnv();
    vi.stubEnv("AI_PROFILE", "anthropic");
    expect(roleModel("image")).toBeNull();
    expect(() => resolveModel("avatar")).toThrow(/no image model/);
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    expect(resolveModel("avatar").id).toBe("gateway:google/gemini-3.1-flash-image");
  });
});

describe("profiles", () => {
  it("give every text role a model, and every anthropic model a list price", () => {
    const textRoles: AiRole[] = ["fast", "balanced", "smart"];
    for (const [profile, roles] of Object.entries(PROFILES)) {
      for (const role of textRoles) {
        const id = roles[role];
        expect(id, `${profile}.${role}`).toBeTruthy();
        const ref = parseModelId(id ?? "");
        expect(ref.provider, `${profile}.${role}`).toBe(profile);
        if (ref.provider === "anthropic") expect(hasListPrice(ref), ref.id).toBe(true);
      }
    }
  });

  it("game tiers follow the profile unless their env var pins them", () => {
    clearAiEnv();
    expect(tierModel("CODENAMES_MODEL_EXPERT", "smart")).toBe("gateway:openai/gpt-5.2");
    vi.stubEnv("AI_PROFILE", "anthropic");
    expect(tierModel("CODENAMES_MODEL_EXPERT", "smart")).toBe("anthropic:claude-opus-5-5");
    vi.stubEnv("CODENAMES_MODEL_EXPERT", "openai/gpt-5.5");
    expect(tierModel("CODENAMES_MODEL_EXPERT", "smart")).toBe("gateway:openai/gpt-5.5");
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
  it("requires the profile's key and no suspension", () => {
    clearAiEnv();
    expect(aiAvailable()).toBe(false);
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    expect(aiAvailable()).toBe(true);
    vi.stubEnv("AI_SUSPENDED", "1");
    expect(aiAvailable()).toBe(false);
  });

  it("follows the profile's provider", () => {
    clearAiEnv();
    vi.stubEnv("AI_PROFILE", "anthropic");
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    expect(aiAvailable()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    expect(aiAvailable()).toBe(true);
  });
});
