import {
  OkResponseSchema,
  type OnlineMode,
  SetOnlineModeBodySchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export async function adminSetOnlineMode(userId: string, onlineMode: OnlineMode) {
  await apiFetch(`/api/admin/users/${userId}/online-mode`, {
    method: "POST",
    body: { onlineMode },
    request: SetOnlineModeBodySchema,
    response: OkResponseSchema,
  });
}
