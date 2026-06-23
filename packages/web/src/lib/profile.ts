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
