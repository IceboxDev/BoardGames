import {
  InventoryNewSlugsSchema,
  InventoryWriteResponseSchema,
  type PendingInventory,
  PendingInventorySchema,
  PendingInventoryWriteResponseSchema,
  SetInventoryBodySchema,
  SetInventoryNewBodySchema,
  SetPendingInventoryBodySchema,
  SlugListSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export async function fetchMyInventory(signal?: AbortSignal) {
  return apiFetch("/api/user/inventory", {
    response: SlugListSchema,
    signal,
  });
}

export async function adminFetchInventory(userId: string, signal?: AbortSignal) {
  return apiFetch(`/api/admin/users/${userId}/inventory`, {
    response: SlugListSchema,
    signal,
  });
}

export async function adminSaveInventory(userId: string, slugs: string[]) {
  await apiFetch(`/api/admin/users/${userId}/inventory`, {
    method: "PUT",
    body: { slugs },
    request: SetInventoryBodySchema,
    response: InventoryWriteResponseSchema,
  });
}

/** The member's currently-new games (dated, unplayed copies still owned). */
export async function adminFetchNewSlugs(userId: string, signal?: AbortSignal) {
  const { newSlugs } = await apiFetch(`/api/admin/users/${userId}/inventory/new`, {
    response: InventoryNewSlugsSchema,
    signal,
  });
  return newSlugs;
}

/** Mark (`true`, dates the copy today) or unmark (`false`, clears the date) one owned game. */
export async function adminSetInventoryNew(userId: string, slug: string, value: boolean) {
  const { newSlugs } = await apiFetch(
    `/api/admin/users/${userId}/inventory/${encodeURIComponent(slug)}/new`,
    {
      method: "PUT",
      body: { new: value },
      request: SetInventoryNewBodySchema,
      response: InventoryNewSlugsSchema,
    },
  );
  return newSlugs;
}

export async function adminFetchPendingInventory(signal?: AbortSignal) {
  return apiFetch("/api/admin/pending-inventory", {
    response: PendingInventorySchema,
    signal,
  });
}

export async function adminSavePendingInventory(payload: PendingInventory) {
  await apiFetch("/api/admin/pending-inventory", {
    method: "PUT",
    body: payload,
    request: SetPendingInventoryBodySchema,
    response: PendingInventoryWriteResponseSchema,
  });
}
