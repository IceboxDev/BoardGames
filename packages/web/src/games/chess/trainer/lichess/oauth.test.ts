import { describe, expect, it } from "vitest";
import { pkceChallenge } from "./oauth";

describe("PKCE", () => {
  it("matches RFC 7636's worked example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
