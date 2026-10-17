import { describe, expect, it } from "vitest";
import { avatarBody, avatarUrlFor } from "./player-avatars.ts";

const WEBP = `data:image/webp;base64,${Buffer.from("webp bytes").toString("base64")}`;

describe("avatarUrlFor", () => {
  it("names a stored picture by a versioned URL that changes with the picture", () => {
    const url = avatarUrlFor("user-1", WEBP);
    expect(url).toMatch(/^\/api\/avatars\/user-1\?v=[\w-]{12}$/);
    expect(avatarUrlFor("user-1", WEBP)).toBe(url);
    expect(avatarUrlFor("user-1", `${WEBP}AA`)).not.toBe(url);
  });

  it("has no URL without a picture it can serve", () => {
    expect(avatarUrlFor("user-1", null)).toBeNull();
    expect(avatarUrlFor("user-1", "")).toBeNull();
    expect(avatarUrlFor("user-1", "http://insecure.example/a.png")).toBeNull();
    expect(avatarUrlFor("user-1", "data:text/html;base64,PGI+")).toBeNull();
  });
});

describe("avatarBody", () => {
  it("decodes a stored data URI into its bytes and type", () => {
    const body = avatarBody(WEBP);
    expect(body).toMatchObject({ kind: "bytes", contentType: "image/webp" });
    expect(body?.kind === "bytes" && body.bytes.toString()).toBe("webp bytes");
  });

  it("redirects to a sign-in provider's picture", () => {
    expect(avatarBody("https://lh3.example.com/a/xyz")).toEqual({
      kind: "redirect",
      url: "https://lh3.example.com/a/xyz",
    });
  });

  it("serves nothing else", () => {
    expect(avatarBody(null)).toBeNull();
    expect(avatarBody("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(avatarBody("javascript:alert(1)")).toBeNull();
  });
});
