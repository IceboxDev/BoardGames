import { describe, expect, it } from "vitest";
import { describeDbTarget, resolveDbTarget } from "./db-target.ts";

const ENV = {
  TURSO_DATABASE_URL: "libsql://boardgames-staging-example.turso.io",
  TURSO_AUTH_TOKEN: "staging-token",
  PROD_TURSO_DATABASE_URL: "libsql://boardgames-example.turso.io",
  PROD_TURSO_AUTH_TOKEN: "prod-token",
};

describe("resolveDbTarget", () => {
  it("defaults to the staging pair and lets a writer through", () => {
    const target = resolveDbTarget({ argv: [], env: ENV, writes: true });
    expect(target).toEqual({
      url: ENV.TURSO_DATABASE_URL,
      authToken: "staging-token",
      host: "boardgames-staging-example.turso.io",
      kind: "staging",
    });
  });

  it("refuses to write to a non-staging host without --prod", () => {
    const env = { ...ENV, TURSO_DATABASE_URL: ENV.PROD_TURSO_DATABASE_URL };
    expect(() => resolveDbTarget({ argv: [], env, writes: true })).toThrow(/refusing to WRITE/);
  });

  it("still allows a read-only script on a non-staging host", () => {
    const env = { ...ENV, TURSO_DATABASE_URL: ENV.PROD_TURSO_DATABASE_URL };
    expect(resolveDbTarget({ argv: [], env, writes: false }).kind).toBe("other");
  });

  it("selects the production pair only with an explicit --prod", () => {
    const target = resolveDbTarget({ argv: ["--prod"], env: ENV, writes: true });
    expect(target.kind).toBe("production");
    expect(target.url).toBe(ENV.PROD_TURSO_DATABASE_URL);
    expect(target.authToken).toBe("prod-token");
  });

  it("fails loudly when the requested pair is missing", () => {
    expect(() => resolveDbTarget({ argv: ["--prod"], env: {}, writes: false })).toThrow(
      /PROD_TURSO_DATABASE_URL is required/,
    );
    expect(() => resolveDbTarget({ argv: [], env: {}, writes: false })).toThrow(
      /TURSO_DATABASE_URL is required/,
    );
  });

  it("lets a local database through only with --unsafe-target", () => {
    const env = { TURSO_DATABASE_URL: "file:local.db" };
    expect(() => resolveDbTarget({ argv: [], env, writes: true })).toThrow(/refusing to WRITE/);
    const target = resolveDbTarget({ argv: ["--unsafe-target"], env, writes: true });
    expect(target).toMatchObject({ host: "file:local.db", kind: "other" });
  });

  it("announces the target in plain words", () => {
    const prod = resolveDbTarget({ argv: ["--prod"], env: ENV, writes: false });
    expect(describeDbTarget(prod, "backup")).toBe(
      "[db-target] backup: PRODUCTION (boardgames-example.turso.io)",
    );
    const staging = resolveDbTarget({ argv: [], env: ENV, writes: false });
    expect(describeDbTarget(staging, "audit")).toContain("staging (boardgames-staging-example");
  });
});
