import { describe, expect, it } from "vitest";
import { SchemaError } from "./api-fetch";
import { parseServerMessage } from "./ws-client";

describe("parseServerMessage", () => {
  it("parses a well-formed ServerMessage envelope", () => {
    const raw = JSON.stringify({
      type: "session-created",
      sessionId: "sess-1",
      playerView: { foo: "bar" },
      legalActions: [],
      phase: "active",
    });
    const msg = parseServerMessage(raw);
    expect(msg.type).toBe("session-created");
  });

  it("throws SchemaError when the payload is not JSON", () => {
    let caught: unknown;
    try {
      parseServerMessage("{not-json");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaError);
    expect((caught as SchemaError).stage).toBe("response");
    expect((caught as SchemaError).message).toContain("not valid JSON");
  });

  it("throws SchemaError when the envelope shape is wrong", () => {
    const raw = JSON.stringify({ type: "totally-not-a-real-message" });
    expect(() => parseServerMessage(raw)).toThrow(SchemaError);
  });

  it("throws SchemaError when a required field is missing", () => {
    // `session-created` requires sessionId + playerView + legalActions.
    const raw = JSON.stringify({ type: "session-created" });
    expect(() => parseServerMessage(raw)).toThrow(SchemaError);
  });
});
