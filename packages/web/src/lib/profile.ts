import {
  type AvatarJobStatus,
  AvatarJobStatusSchema,
  type GenerateAvatarRequest,
  GenerateAvatarRequestSchema,
  type GenerateAvatarResponse,
  GenerateAvatarResponseSchema,
  type HistoryListResponse,
  HistoryListResponseSchema,
  type ProfileDirectoryResponse,
  ProfileDirectoryResponseSchema,
  type ProfileEditable,
  ProfileEditableSchema,
  type ProfileMatchSummaryResponse,
  ProfileMatchSummaryResponseSchema,
  type ProfileNightsResponse,
  ProfileNightsResponseSchema,
  type ProfileUpdateInput,
  ProfileUpdateInputSchema,
  type PublicProfile,
  PublicProfileSchema,
  SaveAvatarRequestSchema,
  type SaveAvatarResponse,
  SaveAvatarResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export async function fetchPlayers(signal?: AbortSignal): Promise<ProfileDirectoryResponse> {
  return apiFetch("/api/profiles", { response: ProfileDirectoryResponseSchema, signal });
}

export async function fetchProfile(userId: string, signal?: AbortSignal): Promise<PublicProfile> {
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}`, {
    response: PublicProfileSchema,
    signal,
  });
}

export async function fetchProfileMatches(
  userId: string,
  opts: { before?: string | null; signal?: AbortSignal } = {},
): Promise<HistoryListResponse> {
  const params = new URLSearchParams();
  if (opts.before) params.set("before", opts.before);
  const qs = params.toString();
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}/matches${qs ? `?${qs}` : ""}`, {
    response: HistoryListResponseSchema,
    signal: opts.signal,
  });
}

/** The user's whole pre-derived match history (unpaginated; see server route). */
export async function fetchProfileMatchSummary(
  userId: string,
  signal?: AbortSignal,
): Promise<ProfileMatchSummaryResponse> {
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}/match-summary`, {
    response: ProfileMatchSummaryResponseSchema,
    signal,
  });
}

/** Every past locked night with the user's attendance attribution. */
export async function fetchProfileNights(
  userId: string,
  signal?: AbortSignal,
): Promise<ProfileNightsResponse> {
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}/nights`, {
    response: ProfileNightsResponseSchema,
    signal,
  });
}

export async function updateMyProfile(
  userId: string,
  body: ProfileUpdateInput,
): Promise<ProfileEditable> {
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body,
    request: ProfileUpdateInputSchema,
    response: ProfileEditableSchema,
  });
}

/** Start a background avatar generation; returns a job id to poll. */
export async function generateAvatar(
  userId: string,
  body: GenerateAvatarRequest,
): Promise<GenerateAvatarResponse> {
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}/avatar/generate`, {
    method: "POST",
    body,
    request: GenerateAvatarRequestSchema,
    response: GenerateAvatarResponseSchema,
  });
}

/** Poll a generation job's status (pending → done/error). */
export async function fetchAvatarJob(
  userId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<AvatarJobStatus> {
  return apiFetch(
    `/api/profiles/${encodeURIComponent(userId)}/avatar/generate/${encodeURIComponent(jobId)}`,
    { response: AvatarJobStatusSchema, signal },
  );
}

/** Persist a confirmed avatar (webp data URI) as the user's profile picture. */
export async function saveAvatar(userId: string, image: string): Promise<SaveAvatarResponse> {
  return apiFetch(`/api/profiles/${encodeURIComponent(userId)}/avatar`, {
    method: "PUT",
    body: { image },
    request: SaveAvatarRequestSchema,
    response: SaveAvatarResponseSchema,
  });
}
