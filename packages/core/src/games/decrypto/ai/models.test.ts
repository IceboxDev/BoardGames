import { describe, expect, it } from "vitest";
import {
  canonicalDecryptoModel,
  DECRYPTO_AI_MODELS,
  DEFAULT_DECRYPTO_MODEL,
  isKnownDecryptoModel,
  LEGACY_DECRYPTO_MODEL_IDS,
} from "./models";

describe("decrypto model tiers", () => {
  it("uses provider-neutral tier ids", () => {
    for (const model of DECRYPTO_AI_MODELS) {
      expect(model.id).toMatch(/^decrypto-/);
    }
    expect(isKnownDecryptoModel(DEFAULT_DECRYPTO_MODEL)).toBe(true);
  });

  it("canonicalizes every legacy GPT id to a known tier", () => {
    for (const [legacy, tier] of Object.entries(LEGACY_DECRYPTO_MODEL_IDS)) {
      expect(canonicalDecryptoModel(legacy)).toBe(tier);
      expect(isKnownDecryptoModel(legacy)).toBe(true);
    }
    expect(canonicalDecryptoModel("gpt-5.5")).toBe("decrypto-expert");
  });

  it("passes unknown ids through and reports them unknown", () => {
    expect(canonicalDecryptoModel("mystery-model")).toBe("mystery-model");
    expect(isKnownDecryptoModel("mystery-model")).toBe(false);
  });
});
