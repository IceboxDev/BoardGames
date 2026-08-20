import {
  type ActivityLogResponse,
  ActivityLogResponseSchema,
  type AdminDevicesResponse,
  AdminDevicesResponseSchema,
  AdminNightGuestBodySchema,
  type AdminResetLinkResponse,
  AdminResetLinkResponseSchema,
  type AdminSkillStateResponse,
  AdminSkillStateResponseSchema,
  MergeGuestBodySchema,
  type MergeGuestResponse,
  MergeGuestResponseSchema,
  OkResponseSchema,
  type OnlineMode,
  PublishGreetingBodySchema,
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

/**
 * Add (`on: true`) or remove (`on: false`) a guest player on a locked game
 * night. The server RSVPs "yes" on the guest's behalf — they then appear in
 * the night's attendee list like any member.
 */
export async function adminSetNightGuest(date: string, guestUserId: string, on: boolean) {
  await apiFetch("/api/admin/calendar/night-guest", {
    method: "POST",
    body: { date, guestUserId, on },
    request: AdminNightGuestBodySchema,
    response: OkResponseSchema,
  });
}

/**
 * Merge a guest stub into a real account: match outcomes are rewritten to the
 * target's id + name and the guest is deleted. Returns the rewrite count.
 */
export async function adminMergeGuest(
  guestUserId: string,
  targetUserId: string,
): Promise<MergeGuestResponse> {
  return apiFetch("/api/admin/users/merge-guest", {
    method: "POST",
    body: { guestUserId, targetUserId },
    request: MergeGuestBodySchema,
    response: MergeGuestResponseSchema,
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

// ── Skill ratings ─────────────────────────────────────────────────────
//
// Ratings only move when an admin asks them to, so all four calls return the
// SAME state shape — the card re-renders from one payload after every action
// instead of stitching together partial responses.

export async function fetchAdminSkillState(signal?: AbortSignal): Promise<AdminSkillStateResponse> {
  return apiFetch("/api/admin/skills", { response: AdminSkillStateResponseSchema, signal });
}

export async function adminRecomputeSkills(): Promise<AdminSkillStateResponse> {
  return apiFetch("/api/admin/skills/recompute", {
    method: "POST",
    response: AdminSkillStateResponseSchema,
  });
}

/** Publish one candidate as the group-wide spotlight. */
export async function adminPublishGreeting(candidateKey: string): Promise<AdminSkillStateResponse> {
  return apiFetch("/api/admin/skills/greeting", {
    method: "POST",
    request: PublishGreetingBodySchema,
    body: { candidateKey },
    response: AdminSkillStateResponseSchema,
  });
}

/** Pull a published spotlight. Members who already dismissed it are unaffected. */
export async function adminRetractGreeting(id: number): Promise<void> {
  await apiFetch(`/api/admin/skills/greeting/${id}/retract`, {
    method: "POST",
    response: OkResponseSchema,
  });
}
