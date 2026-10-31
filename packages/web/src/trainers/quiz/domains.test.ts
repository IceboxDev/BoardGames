import { QUIZ_DOMAINS } from "@boardgames/core/quiz/taxonomy";
import { describe, expect, it } from "vitest";
import { DOMAIN_SLUGS_WITH_ART, DOMAINS } from "./domains";

describe("quiz domains", () => {
  it("gives every taxonomy domain its own ink, colour and icon", () => {
    expect(DOMAIN_SLUGS_WITH_ART).toEqual(QUIZ_DOMAINS.map((d) => d.slug));
    expect(new Set(DOMAINS.map((d) => d.ink)).size).toBe(DOMAINS.length);
    expect(new Set(DOMAINS.map((d) => d.icon)).size).toBe(DOMAINS.length);
    for (const d of DOMAINS) expect(d.color).toBe(`var(--color-domain-${d.slug})`);
  });
});
