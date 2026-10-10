// The first-use hints of onboarding (the tour itself is the `onboarding`
// greeting — auth-routes/greetings.ts serves and acks it).
//
//   GET  /api/onboarding            → { hintsDue }
//   POST /api/onboarding/hints/seen → { id } → { hintsDue }

import { MarkHintSeenBodySchema, OnboardingResponseSchema } from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { zJsonBody } from "../lib/error-response.ts";
import { hintsDue, markHintSeen, readOnboarding } from "../lib/onboarding.ts";

export const onboardingRoutes = authedApp();

onboardingRoutes.get("/", async (c) => {
  const user = c.get("user");
  const state = await readOnboarding(getDb(), user.id);
  return c.json(OnboardingResponseSchema.parse({ hintsDue: hintsDue(state) }));
});

onboardingRoutes.post("/hints/seen", zJsonBody(MarkHintSeenBodySchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.valid("json");
  const db = getDb();
  await markHintSeen(db, user.id, id);
  return c.json(
    OnboardingResponseSchema.parse({ hintsDue: hintsDue(await readOnboarding(db, user.id)) }),
  );
});
