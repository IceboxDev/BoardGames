import {
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
