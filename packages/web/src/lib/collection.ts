import {
  type AdminAnnouncementsResponse,
  AdminAnnouncementsResponseSchema,
  type CollectionOkResponse,
  CollectionOkResponseSchema,
  type CollectionResponse,
  CollectionResponseSchema,
  type CreateAnnouncementBody,
  CreateAnnouncementBodySchema,
  type CreateAnnouncementResponse,
  CreateAnnouncementResponseSchema,
  type CreateSleeveTypeBody,
  CreateSleeveTypeBodySchema,
  type CreateStatusBody,
  CreateStatusBodySchema,
  RemoveOwnedGameBodySchema,
  type RemoveOwnedGameResponse,
  RemoveOwnedGameResponseSchema,
  type ResolveAnnouncementBody,
  ResolveAnnouncementBodySchema,
  type ResolveAnnouncementResponse,
  ResolveAnnouncementResponseSchema,
  type SetPlayedThroughBody,
  SetPlayedThroughBodySchema,
  type SetPlayedThroughResponse,
  SetPlayedThroughResponseSchema,
  type SleeveTypeWriteResponse,
  SleeveTypeWriteResponseSchema,
  type StatusWriteResponse,
  StatusWriteResponseSchema,
  type UpdateSleeveTypeBody,
  UpdateSleeveTypeBodySchema,
  type UpdateStatusBody,
  UpdateStatusBodySchema,
  type UpsertItemBody,
  UpsertItemBodySchema,
  type UpsertItemResponse,
  UpsertItemResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

const base = (userId: string) => `/api/collection/users/${encodeURIComponent(userId)}`;

export async function fetchCollection(
  userId: string,
  signal?: AbortSignal,
): Promise<CollectionResponse> {
  return apiFetch(base(userId), { response: CollectionResponseSchema, signal });
}

export async function upsertCollectionItem(
  userId: string,
  body: UpsertItemBody,
): Promise<UpsertItemResponse> {
  return apiFetch(`${base(userId)}/item`, {
    method: "PUT",
    body,
    request: UpsertItemBodySchema,
    response: UpsertItemResponseSchema,
  });
}

export async function setPlayedThrough(
  userId: string,
  body: SetPlayedThroughBody,
): Promise<SetPlayedThroughResponse> {
  return apiFetch(`${base(userId)}/played-through`, {
    method: "POST",
    body,
    request: SetPlayedThroughBodySchema,
    response: SetPlayedThroughResponseSchema,
  });
}

export async function removeOwnedGame(
  userId: string,
  slug: string,
): Promise<RemoveOwnedGameResponse> {
  return apiFetch(`${base(userId)}/remove`, {
    method: "POST",
    body: { slug },
    request: RemoveOwnedGameBodySchema,
    response: RemoveOwnedGameResponseSchema,
  });
}

// ── Vocabularies (per-user) ────────────────────────────────────────────

export async function createSleeveType(
  userId: string,
  body: CreateSleeveTypeBody,
): Promise<SleeveTypeWriteResponse> {
  return apiFetch(`${base(userId)}/sleeve-types`, {
    method: "POST",
    body,
    request: CreateSleeveTypeBodySchema,
    response: SleeveTypeWriteResponseSchema,
  });
}

export async function updateSleeveType(
  userId: string,
  id: string,
  body: UpdateSleeveTypeBody,
): Promise<SleeveTypeWriteResponse> {
  return apiFetch(`${base(userId)}/sleeve-types/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
    request: UpdateSleeveTypeBodySchema,
    response: SleeveTypeWriteResponseSchema,
  });
}

export async function deleteSleeveType(userId: string, id: string): Promise<CollectionOkResponse> {
  return apiFetch(`${base(userId)}/sleeve-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
    response: CollectionOkResponseSchema,
  });
}

export async function createStatus(
  userId: string,
  body: CreateStatusBody,
): Promise<StatusWriteResponse> {
  return apiFetch(`${base(userId)}/statuses`, {
    method: "POST",
    body,
    request: CreateStatusBodySchema,
    response: StatusWriteResponseSchema,
  });
}

export async function updateStatus(
  userId: string,
  id: string,
  body: UpdateStatusBody,
): Promise<StatusWriteResponse> {
  return apiFetch(`${base(userId)}/statuses/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
    request: UpdateStatusBodySchema,
    response: StatusWriteResponseSchema,
  });
}

export async function deleteStatus(userId: string, id: string): Promise<CollectionOkResponse> {
  return apiFetch(`${base(userId)}/statuses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    response: CollectionOkResponseSchema,
  });
}

// ── Announcements ──────────────────────────────────────────────────────

export async function createAnnouncement(
  body: CreateAnnouncementBody,
): Promise<CreateAnnouncementResponse> {
  return apiFetch("/api/announcements", {
    method: "POST",
    body,
    request: CreateAnnouncementBodySchema,
    response: CreateAnnouncementResponseSchema,
  });
}

export async function retractAnnouncement(id: string): Promise<CollectionOkResponse> {
  return apiFetch(`/api/announcements/${encodeURIComponent(id)}`, {
    method: "DELETE",
    response: CollectionOkResponseSchema,
  });
}

export async function adminFetchAnnouncements(
  signal?: AbortSignal,
): Promise<AdminAnnouncementsResponse> {
  return apiFetch("/api/admin/announcements", {
    response: AdminAnnouncementsResponseSchema,
    signal,
  });
}

export async function adminResolveAnnouncement(
  id: string,
  body: ResolveAnnouncementBody,
): Promise<ResolveAnnouncementResponse> {
  return apiFetch(`/api/admin/announcements/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body,
    request: ResolveAnnouncementBodySchema,
    response: ResolveAnnouncementResponseSchema,
  });
}
