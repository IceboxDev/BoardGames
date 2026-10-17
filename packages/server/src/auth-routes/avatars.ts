// Every member's profile picture by user id, for game tables:
//
//   GET /api/avatars/:userId?v=<version> → image bytes, or a redirect to the
//   sign-in provider's picture
//
// Behind plain requireAuth (like arrival photos): a table's players see each
// other whether or not their accounts are offline-mode members, so this is
// not behind `/api/profiles`' requireOffline. A versioned URL
// (`avatarUrlFor`) names one image forever and is cached as immutable;
// `private` keeps the CDN in front of the API from caching an auth-gated body.

import { authedApp } from "../auth/index.ts";
import { errorResponse } from "../lib/error-response.ts";
import { avatarBody, storedImage } from "../lib/player-avatars.ts";

export const avatarImageRoutes = authedApp();

avatarImageRoutes.get("/:userId", async (c) => {
  const body = avatarBody(await storedImage(c.req.param("userId")));
  if (!body) return errorResponse(c, 404, "no avatar", "NOT_FOUND");
  const cache = c.req.query("v") ? "private, max-age=31536000, immutable" : "private, max-age=300";
  if (body.kind === "redirect") {
    c.header("Cache-Control", cache);
    return c.redirect(body.url, 302);
  }
  const { bytes } = body;
  return c.body(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), 200, {
    "Content-Type": body.contentType,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  });
});
