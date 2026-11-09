import {
  type CampaignDetail,
  CampaignDetailResponseSchema,
  CampaignListResponseSchema,
  CampaignPartnerListResponseSchema,
  type CreateCampaignBody,
  type RecordTableGameBody,
} from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api-fetch";
import { qk } from "../../../lib/query-keys";

// The campaign API (`server/src/auth-routes/duet-campaigns.ts`). A campaign's
// progress is derived from its games on the server; every write answers with
// the whole campaign, which replaces the cached one.

const BASE = "/api/games/codenames-duet/campaigns";

export function useCampaigns() {
  return useQuery({
    queryKey: qk.duetCampaignList(),
    queryFn: ({ signal }) => apiFetch(BASE, { response: CampaignListResponseSchema, signal }),
    select: (r) => r.campaigns,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: qk.duetCampaign(id),
    queryFn: ({ signal }) =>
      apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
        response: CampaignDetailResponseSchema,
        signal,
      }),
    select: (r) => r.campaign,
    // A mission ends on the game screen; coming back must show its result.
    refetchOnMount: "always",
    enabled: id !== "",
  });
}

export function usePartnerCandidates(enabled: boolean) {
  return useQuery({
    queryKey: qk.duetCampaignPartners(),
    queryFn: ({ signal }) =>
      apiFetch(`${BASE}/partners`, { response: CampaignPartnerListResponseSchema, signal }),
    select: (r) => r.members,
    enabled,
  });
}

function useStoreCampaign() {
  const client = useQueryClient();
  return (campaign: CampaignDetail) => {
    client.setQueryData(qk.duetCampaign(campaign.id), { campaign });
    void client.invalidateQueries({ queryKey: qk.duetCampaignList() });
  };
}

export function useCreateCampaign() {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: (body: CreateCampaignBody) =>
      apiFetch(BASE, { method: "POST", body, response: CampaignDetailResponseSchema }),
    onSuccess: ({ campaign }) => store(campaign),
  });
}

export function useUpdateCampaign(id: string) {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: (body: { name?: string; archived?: boolean }) =>
      apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body,
        response: CampaignDetailResponseSchema,
      }),
    onSuccess: ({ campaign }) => store(campaign),
  });
}

export function useRecordTableGame(id: string) {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: (body: RecordTableGameBody) =>
      apiFetch(`${BASE}/${encodeURIComponent(id)}/games`, {
        method: "POST",
        body,
        response: CampaignDetailResponseSchema,
      }),
    // A table result is typed once at the table: retry through a flaky
    // connection (the client id makes a repeat harmless).
    retry: 3,
    onSuccess: ({ campaign }) => store(campaign),
  });
}

export function useDeleteTableGame(id: string) {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: (gameId: string) =>
      apiFetch(`${BASE}/${encodeURIComponent(id)}/games/${encodeURIComponent(gameId)}`, {
        method: "DELETE",
        response: CampaignDetailResponseSchema,
      }),
    onSuccess: ({ campaign }) => store(campaign),
  });
}

/** A fresh id for one table record: a retried save records the game once. */
export function newTableGameId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
