import { afterEach, describe, expect, it } from "vitest";
import { __setAgentVerifierForTests, agentApp, requireAgent } from "./agent-auth.ts";

const UID = "agent-694f77bd2067c8f21866f81a";

function buildApp() {
  const app = agentApp();
  app.use("*", requireAgent);
  app.get("/probe", (c) => c.json({ uid: c.get("agentUid") }));
  return app;
}

afterEach(() => {
  delete process.env.VESTAUTH_ALLOWED_AGENT_UIDS;
  __setAgentVerifierForTests(null);
});

describe("requireAgent", () => {
  it("404s every request while the allowlist env var is unset (dark by default)", async () => {
    delete process.env.VESTAUTH_ALLOWED_AGENT_UIDS;
    const res = await buildApp().request("/probe");
    expect(res.status).toBe(404);
  });

  it("401s an unsigned request (real SDK: missing Signature-Agent, no network)", async () => {
    process.env.VESTAUTH_ALLOWED_AGENT_UIDS = UID;
    const res = await buildApp().request("/probe");
    expect(res.status).toBe(401);
  });

  it("401s a forged Signature-Agent host (real SDK: untrusted fqdn, no network)", async () => {
    process.env.VESTAUTH_ALLOWED_AGENT_UIDS = UID;
    const res = await buildApp().request("/probe", {
      headers: {
        "Signature-Agent": '"https://evil.example.com"',
        "Signature-Input": 'sig1=("@authority");created=1;keyid="k";alg="ed25519"',
        Signature: "sig1=:AAAA:",
      },
    });
    expect(res.status).toBe(401);
  });

  it("sets agentUid for a verified, allowlisted agent", async () => {
    process.env.VESTAUTH_ALLOWED_AGENT_UIDS = ` ${UID} , agent-other`;
    __setAgentVerifierForTests(async () => ({ uid: UID }));
    const res = await buildApp().request("/probe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: UID });
  });

  it("403s a verified agent whose uid is not allowlisted", async () => {
    process.env.VESTAUTH_ALLOWED_AGENT_UIDS = UID;
    __setAgentVerifierForTests(async () => ({ uid: "agent-someone-else" }));
    const res = await buildApp().request("/probe");
    expect(res.status).toBe(403);
  });
});
