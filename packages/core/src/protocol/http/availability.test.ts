import { describe, expect, it } from "vitest";
import {
  AggregateAvailabilityMapSchema,
  AvailabilityCountsSchema,
  AvailabilityMapSchema,
} from "./availability.ts";

describe("AvailabilityMapSchema", () => {
  it("accepts can/maybe entries with valid date keys", () => {
    expect(() =>
      AvailabilityMapSchema.parse({ "2026-05-05": "can", "2026-05-06": "maybe" }),
    ).not.toThrow();
  });

  it("accepts an empty map", () => {
    expect(AvailabilityMapSchema.parse({})).toEqual({});
  });

  it("rejects unknown availability values", () => {
    expect(() => AvailabilityMapSchema.parse({ "2026-05-05": "yes" })).toThrow();
  });
});

describe("AvailabilityCountsSchema", () => {
  it("accepts integer counts", () => {
    expect(() =>
      AvailabilityCountsSchema.parse({ "2026-05-05": { can: 3, maybe: 2 } }),
    ).not.toThrow();
  });

  it("rejects negative counts", () => {
    expect(() => AvailabilityCountsSchema.parse({ "2026-05-05": { can: -1, maybe: 0 } })).toThrow();
  });
});

describe("AggregateAvailabilityMapSchema", () => {
  it("accepts a populated aggregate", () => {
    expect(() =>
      AggregateAvailabilityMapSchema.parse({
        "2026-05-05": [{ userId: "u1", name: "Alice", status: "can" }],
      }),
    ).not.toThrow();
  });

  it("rejects an entry missing userId", () => {
    expect(() =>
      AggregateAvailabilityMapSchema.parse({
        "2026-05-05": [{ name: "Alice", status: "can" }],
      }),
    ).toThrow();
  });
});
