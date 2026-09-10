// Member-facing arrivals: the photo bytes behind an arrival greeting.
//
//   GET /api/arrivals/:id/photos/:slug → image/webp
//
// Behind plain requireAuth (like /api/greetings): an admin whose own account
// is online-mode still needs the photos in the admin card. Arrivals are
// immutable — retract deletes, republish mints a new id — so the response
// can be cached by the browser forever. `private` keeps the CDN in front of
// the API from caching an auth-gated body.

import { authedApp } from "../auth/index.ts";
import { arrivalPhoto } from "../lib/arrivals.ts";
import { errorResponse } from "../lib/error-response.ts";

export const arrivalRoutes = authedApp();

arrivalRoutes.get("/:id/photos/:slug", async (c) => {
  const bytes = await arrivalPhoto(c.req.param("id"), c.req.param("slug"));
  if (!bytes) return errorResponse(c, 404, "no such photo", "NOT_FOUND");
  return c.body(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), 200, {
    "Content-Type": "image/webp",
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
});
