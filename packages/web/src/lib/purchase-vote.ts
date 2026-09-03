import {
  type AdminCreatePollBody,
  AdminCreatePollBodySchema,
  type AdminPurchaseVoteState,
  AdminPurchaseVoteStateSchema,
  AdminPurchaseVoteWriteResponseSchema,
  type PurchaseVoteState,
  PurchaseVoteStateSchema,
  PurchaseVoteWriteResponseSchema,
  SetPurchaseVotesBodySchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export async function fetchPurchaseVote(signal?: AbortSignal): Promise<PurchaseVoteState> {
  return apiFetch("/api/purchase-vote", { response: PurchaseVoteStateSchema, signal });
}

/** Replace the viewer's whole vote set in one submit. */
export async function setPurchaseVotes(slugs: string[]): Promise<void> {
  await apiFetch("/api/purchase-vote/votes", {
    method: "PUT",
    request: SetPurchaseVotesBodySchema,
    body: { slugs },
    response: PurchaseVoteWriteResponseSchema,
  });
}

// ── Admin ──────────────────────────────────────────────────────────────

export async function fetchAdminPurchaseVote(
  signal?: AbortSignal,
): Promise<AdminPurchaseVoteState> {
  return apiFetch("/api/admin/purchase-vote", { response: AdminPurchaseVoteStateSchema, signal });
}

export async function createPurchasePoll(body: AdminCreatePollBody): Promise<void> {
  await apiFetch("/api/admin/purchase-vote", {
    method: "POST",
    request: AdminCreatePollBodySchema,
    body,
    response: AdminPurchaseVoteWriteResponseSchema,
  });
}

export async function closePurchasePoll(): Promise<void> {
  await apiFetch("/api/admin/purchase-vote/close", {
    method: "POST",
    response: AdminPurchaseVoteWriteResponseSchema,
  });
}

export async function deletePurchasePoll(): Promise<void> {
  await apiFetch("/api/admin/purchase-vote", {
    method: "DELETE",
    response: AdminPurchaseVoteWriteResponseSchema,
  });
}
