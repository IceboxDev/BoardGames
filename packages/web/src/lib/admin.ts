import { OkResponseSchema, SetOnlineBodySchema } from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export async function adminSetOnline(userId: string, onlineEnabled: boolean) {
  await apiFetch(`/api/admin/users/${userId}/online`, {
    method: "POST",
    body: { onlineEnabled },
    request: SetOnlineBodySchema,
    response: OkResponseSchema,
  });
}
