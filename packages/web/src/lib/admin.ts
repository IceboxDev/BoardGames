import {
  type ActivityLogResponse,
  ActivityLogResponseSchema,
  type AdminDevicesResponse,
  AdminDevicesResponseSchema,
  type AdminResetLinkResponse,
  AdminResetLinkResponseSchema,
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

/**
 * Mint a one-time password-reset link for a user. The admin copies the returned
 * URL and sends it to the user out of band — no email is involved.
 */
export async function adminGenerateResetLink(userId: string): Promise<AdminResetLinkResponse> {
  return apiFetch(`/api/admin/users/${userId}/reset-link`, {
    method: "POST",
    response: AdminResetLinkResponseSchema,
  });
}

/** Every distinct device/viewport a member has reported, most recent first. */
export async function adminFetchDevices(
  userId: string,
  signal?: AbortSignal,
): Promise<AdminDevicesResponse> {
  return apiFetch(`/api/admin/users/${userId}/devices`, {
    response: AdminDevicesResponseSchema,
    signal,
  });
}

/** One page of a member's activity trail, newest first (keyset-paged on id). */
export async function adminFetchActivity(
  userId: string,
  before: number | undefined,
  signal?: AbortSignal,
): Promise<ActivityLogResponse> {
  const query = before !== undefined ? `?before=${before}` : "";
  return apiFetch(`/api/admin/users/${userId}/activity${query}`, {
    response: ActivityLogResponseSchema,
    signal,
  });
}
