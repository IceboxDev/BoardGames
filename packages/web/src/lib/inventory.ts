import {
  InventoryWriteResponseSchema,
  SetInventoryBodySchema,
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

export async function adminFetchPendingInventory(signal?: AbortSignal) {
  return apiFetch("/api/admin/pending-inventory", {
    response: SlugListSchema,
    signal,
  });
}

export async function adminSavePendingInventory(slugs: string[]) {
  await apiFetch("/api/admin/pending-inventory", {
    method: "PUT",
    body: { slugs },
    request: SetInventoryBodySchema,
    response: InventoryWriteResponseSchema,
  });
}
