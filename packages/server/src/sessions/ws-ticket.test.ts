import { describe, expect, it } from "vitest";
import { signWsTicket, verifyWsTicket } from "./ws-ticket.ts";

describe("ws-ticket", () => {
  it("round-trips a freshly signed ticket back to its user id", () => {
    const ticket = signWsTicket("user-123");
    expect(verifyWsTicket(ticket)).toBe("user-123");
  });

  it("rejects a ticket whose payload was tampered with", () => {
    const ticket = signWsTicket("user-123");
    const [, sig] = ticket.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ u: "attacker", e: Date.now() + 30_000 }),
    ).toString("base64url");
    expect(verifyWsTicket(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects a ticket with a tampered signature", () => {
    const ticket = signWsTicket("user-123");
    const [payload] = ticket.split(".");
    expect(verifyWsTicket(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects an expired ticket", () => {
    const signedAt = 1_000_000;
    const ticket = signWsTicket("user-123", signedAt);
    // 30s TTL — one ms past expiry must fail.
    expect(verifyWsTicket(ticket, signedAt + 30_000 + 1)).toBeNull();
    // Exactly at expiry still passes.
    expect(verifyWsTicket(ticket, signedAt + 30_000)).toBe("user-123");
  });

  it("rejects malformed tickets", () => {
    expect(verifyWsTicket("")).toBeNull();
    expect(verifyWsTicket("nodot")).toBeNull();
    expect(verifyWsTicket(".onlysig")).toBeNull();
    expect(verifyWsTicket("notbase64!.sig")).toBeNull();
  });

  describe("secret handling", () => {
    // Save/restore the two env vars these tests mutate so ordering stays clean.
    const savedSecret = process.env.BETTER_AUTH_SECRET;
    const savedNodeEnv = process.env.NODE_ENV;
    const restore = () => {
      if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = savedSecret;
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
    };

    it("refuses to sign with the insecure fallback secret in production", () => {
      delete process.env.BETTER_AUTH_SECRET;
      process.env.NODE_ENV = "production";
      try {
        expect(() => signWsTicket("user-123")).toThrow(/BETTER_AUTH_SECRET/);
      } finally {
        restore();
      }
    });

    it("allows the dev fallback outside production", () => {
      delete process.env.BETTER_AUTH_SECRET;
      process.env.NODE_ENV = "development";
      try {
        const ticket = signWsTicket("user-123");
        expect(verifyWsTicket(ticket)).toBe("user-123");
      } finally {
        restore();
      }
    });
  });
});
