// The grid scan: the model's answer → the wire's 25 cells, or a problem said
// to the player; and the route around it. The model is a canned transport.

import { CodenamesScanResponseSchema } from "@boardgames/core/protocol";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { setAiTransportsForTests } from "./ai/generate";
import type { AiTransportRequest } from "./ai/transports/types";
import { normalizeScan, ScanProblem } from "./codenames-scan.ts";

vi.mock("../db.ts", () => ({
  getDb: () => null,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { codenamesScanRoutes } = await import("../auth-routes/codenames-scan.ts");

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const cells = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ word: ` WORD${i} `, sure: true, cover: null }));

function stubAi(answer: unknown, seen: AiTransportRequest[] = []) {
  vi.stubEnv("AI_SUSPENDED", "");
  vi.stubEnv("AI_PROFILE", "");
  vi.stubEnv("AI_MODEL", "");
  vi.stubEnv("AI_MODEL_CODENAMES_SCAN", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("AI_TRANSPORT", "sync");
  setAiTransportsForTests({
    sync: async (req) => {
      seen.push(req);
      return answer;
    },
  });
  return seen;
}

afterEach(() => {
  setAiTransportsForTests(null);
  vi.unstubAllEnvs();
});

function app() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: "member-1", role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/games/codenames/scan", codenamesScanRoutes);
  return a;
}

const post = (body: unknown) =>
  app().request("/api/games/codenames/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("normalizeScan", () => {
  it("keeps German words exactly as printed and tidies spaces", () => {
    const grid = cells(25);
    grid[0] = { word: "  STRAẞE ", sure: true, cover: null };
    grid[1] = { word: "GRÖSSE", sure: false, cover: null };
    const out = normalizeScan({ problem: null, language: "de", cells: grid });
    expect(out.cells[0]).toEqual({ word: "STRAẞE", sure: true, cover: null });
    expect(out.cells[1]?.sure).toBe(false);
    expect(out.cells[2]?.word).toBe("WORD2");
    expect(out.language).toBe("de");
  });

  it("takes a hidden word under a cover as sure, a blank uncovered one as not", () => {
    const grid = cells(25);
    grid[3] = { word: "", sure: true, cover: "red" } as never;
    grid[4] = { word: "", sure: true, cover: null };
    const out = normalizeScan({ problem: null, language: "en", cells: grid });
    expect(out.cells[3]).toEqual({ word: "", sure: true, cover: "red" });
    expect(out.cells[4]?.sure).toBe(false);
  });

  it("turns the model's problem, or a grid that isn't 25 cards, into a ScanProblem", () => {
    expect(() => normalizeScan({ problem: "No grid here", language: null, cells: [] })).toThrow(
      "No grid here",
    );
    expect(() => normalizeScan({ problem: null, language: "en", cells: cells(20) })).toThrow(
      ScanProblem,
    );
    expect(() => normalizeScan("nonsense")).toThrow(ScanProblem);
  });
});

describe("POST /api/games/codenames/scan", () => {
  it("sends the photo to the model and answers with the grid", async () => {
    const seen = stubAi({ problem: null, language: "en", cells: cells(25) });
    const res = await post({ image: PHOTO });
    expect(res.status).toBe(200);
    const grid = CodenamesScanResponseSchema.parse(await res.json());
    expect(grid.cells).toHaveLength(25);
    const parts = seen[0]?.user;
    expect(Array.isArray(parts) && parts[1]).toMatchObject({
      type: "file",
      mediaType: "image/jpeg",
      dataUri: PHOTO,
    });
  });

  it("says why a photo couldn't be read", async () => {
    stubAi({ problem: "That's a cat, not a grid", language: null, cells: [] });
    const res = await post({ image: PHOTO });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "That's a cat, not a grid" });
  });

  it("is unavailable while AI is switched off", async () => {
    stubAi({});
    vi.stubEnv("AI_SUSPENDED", "1");
    const res = await post({ image: PHOTO });
    expect(res.status).toBe(503);
  });

  it("rejects a body that isn't a photo", async () => {
    stubAi({});
    const res = await post({ image: "data:text/plain;base64,aGk=" });
    expect(res.status).toBe(400);
  });
});
