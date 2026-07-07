import {
  ActiveCombatResponseSchema,
  ActiveSessionResponseSchema,
  type AppendHistoryRequest,
  AppendHistoryRequestSchema,
  type BeamerTrigger,
  CAMPAIGN_PDF_MAX_BYTES,
  type CharacterActionsResponse,
  CharacterActionsResponseSchema,
  type CharacterSheet,
  type CombatResponse,
  CombatResponseSchema,
  type CreateCampaignRequest,
  CreateCampaignRequestSchema,
  CreateCampaignResponseSchema,
  type CreateCharacterRequest,
  CreateCharacterRequestSchema,
  type CreateCharacterResponse,
  CreateCharacterResponseSchema,
  CreatePartyRequestSchema,
  type CreatePartyResponse,
  CreatePartyResponseSchema,
  CreateSessionRequestSchema,
  type CreateSessionResponse,
  CreateSessionResponseSchema,
  type DeleteCampaignResponse,
  DeleteCampaignResponseSchema,
  type DeleteCharacterResponse,
  DeleteCharacterResponseSchema,
  type DeletePartyResponse,
  DeletePartyResponseSchema,
  type GenerateNodeRequest,
  GenerateNodeRequestSchema,
  type GenerateNodeResponse,
  GenerateNodeResponseSchema,
  ListCampaignsResponseSchema,
  ListCharactersResponseSchema,
  ListFilesResponseSchema,
  ListHistoryResponseSchema,
  ListNodesResponseSchema,
  ListNpcsResponseSchema,
  ListPartiesResponseSchema,
  type ResolveEventRequest,
  ResolveEventRequestSchema,
  type ResolveEventResponse,
  ResolveEventResponseSchema,
  ResolveTurnRequestSchema,
  type ResolveTurnResponse,
  ResolveTurnResponseSchema,
  type RetriggerNpcsResponse,
  RetriggerNpcsResponseSchema,
  type StartCombatRequest,
  StartCombatRequestSchema,
  type SuggestNodesRequest,
  SuggestNodesRequestSchema,
  type SuggestNodesResponse,
  SuggestNodesResponseSchema,
  TriggerBeamerRequestSchema,
  type TriggerBeamerResponse,
  TriggerBeamerResponseSchema,
  type UndoHistoryResponse,
  UndoHistoryResponseSchema,
  UpdateCharacterRequestSchema,
  type UpdateCharacterResponse,
  UpdateCharacterResponseSchema,
  type UpdateCharacterStateRequest,
  UpdateCharacterStateRequestSchema,
} from "@boardgames/core/protocol";
import { apiUrl } from "./api-base.ts";
import { apiFetch } from "./api-fetch.ts";
import { jsonMutation, jsonQuery } from "./typed-query.ts";

// Data layer for the D&D DM tool (campaign hall). The list query doubles as
// the job poll: while any campaign is `processing`, the caller sets a
// refetchInterval and the row's status flips server-side when extraction
// finishes — no separate job endpoint.

export const fetchCampaigns = jsonQuery("/api/dnd/campaigns", ListCampaignsResponseSchema);

export const createCampaign = jsonMutation<CreateCampaignRequest, unknown>("/api/dnd/campaigns", {
  request: CreateCampaignRequestSchema,
  response: CreateCampaignResponseSchema,
});

export function deleteCampaign(id: string): Promise<DeleteCampaignResponse> {
  return apiFetch(`/api/dnd/campaigns/${id}`, {
    method: "DELETE",
    response: DeleteCampaignResponseSchema,
  });
}

export function charactersQueryFn(partyId: string) {
  return jsonQuery(`/api/dnd/parties/${partyId}/characters`, ListCharactersResponseSchema);
}

export function createCharacter(
  campaignId: string,
  body: CreateCharacterRequest,
): Promise<CreateCharacterResponse> {
  return apiFetch(`/api/dnd/campaigns/${campaignId}/characters`, {
    method: "POST",
    body,
    request: CreateCharacterRequestSchema,
    response: CreateCharacterResponseSchema,
  });
}

// ── Parties ────────────────────────────────────────────────────────────

export function partiesQueryFn(campaignId: string) {
  return jsonQuery(`/api/dnd/campaigns/${campaignId}/parties`, ListPartiesResponseSchema);
}

export function createParty(campaignId: string, name: string): Promise<CreatePartyResponse> {
  return apiFetch(`/api/dnd/campaigns/${campaignId}/parties`, {
    method: "POST",
    body: { name },
    request: CreatePartyRequestSchema,
    response: CreatePartyResponseSchema,
  });
}

export function deleteParty(id: string): Promise<DeletePartyResponse> {
  return apiFetch(`/api/dnd/parties/${id}`, {
    method: "DELETE",
    response: DeletePartyResponseSchema,
  });
}

// ── Story nodes ────────────────────────────────────────────────────────

export function nodesQueryFn(partyId: string) {
  return jsonQuery(`/api/dnd/parties/${partyId}/nodes`, ListNodesResponseSchema);
}

export function generateNode(
  partyId: string,
  body: GenerateNodeRequest,
): Promise<GenerateNodeResponse> {
  return apiFetch(`/api/dnd/parties/${partyId}/nodes`, {
    method: "POST",
    body,
    request: GenerateNodeRequestSchema,
    response: GenerateNodeResponseSchema,
  });
}

// ── Table history ──────────────────────────────────────────────────────

export function historyQueryFn(partyId: string) {
  return jsonQuery(`/api/dnd/parties/${partyId}/history`, ListHistoryResponseSchema);
}

export function appendHistoryEntries(
  partyId: string,
  entries: AppendHistoryRequest["entries"],
): Promise<import("@boardgames/core/protocol").ListHistoryResponse> {
  return apiFetch(`/api/dnd/parties/${partyId}/history`, {
    method: "POST",
    body: { entries },
    request: AppendHistoryRequestSchema,
    response: ListHistoryResponseSchema,
  });
}

export function undoLastHistory(partyId: string): Promise<UndoHistoryResponse> {
  return apiFetch(`/api/dnd/parties/${partyId}/history/last`, {
    method: "DELETE",
    response: UndoHistoryResponseSchema,
  });
}

export function resolveEvent(
  partyId: string,
  body: ResolveEventRequest,
): Promise<ResolveEventResponse> {
  return apiFetch(`/api/dnd/parties/${partyId}/resolve`, {
    method: "POST",
    body,
    request: ResolveEventRequestSchema,
    response: ResolveEventResponseSchema,
  });
}

export function updateCharacterState(
  characterId: string,
  body: UpdateCharacterStateRequest,
): Promise<UpdateCharacterResponse> {
  return apiFetch(`/api/dnd/characters/${characterId}/state`, {
    method: "PUT",
    body,
    request: UpdateCharacterStateRequestSchema,
    response: UpdateCharacterResponseSchema,
  });
}

export function suggestNodes(
  partyId: string,
  body: SuggestNodesRequest,
): Promise<SuggestNodesResponse> {
  return apiFetch(`/api/dnd/parties/${partyId}/nodes/suggest`, {
    method: "POST",
    body,
    request: SuggestNodesRequestSchema,
    response: SuggestNodesResponseSchema,
  });
}

// ── Combat ─────────────────────────────────────────────────────────────

export function activeCombatQueryFn(partyId: string) {
  return jsonQuery(`/api/dnd/parties/${partyId}/combat`, ActiveCombatResponseSchema);
}

export function startCombat(partyId: string, body: StartCombatRequest): Promise<CombatResponse> {
  return apiFetch(`/api/dnd/parties/${partyId}/combat`, {
    method: "POST",
    body,
    request: StartCombatRequestSchema,
    response: CombatResponseSchema,
  });
}

export function resolveTurn(combatId: string, message: string): Promise<ResolveTurnResponse> {
  return apiFetch(`/api/dnd/combats/${combatId}/turn`, {
    method: "POST",
    body: { message },
    request: ResolveTurnRequestSchema,
    response: ResolveTurnResponseSchema,
  });
}

export function advanceCombat(combatId: string): Promise<CombatResponse> {
  return apiFetch(`/api/dnd/combats/${combatId}/advance`, {
    method: "POST",
    body: {},
    response: CombatResponseSchema,
  });
}

export function endCombat(combatId: string): Promise<CombatResponse> {
  return apiFetch(`/api/dnd/combats/${combatId}/end`, {
    method: "POST",
    body: {},
    response: CombatResponseSchema,
  });
}

export function characterActions(characterId: string): Promise<CharacterActionsResponse> {
  return apiFetch(`/api/dnd/characters/${characterId}/actions`, {
    method: "POST",
    body: {},
    response: CharacterActionsResponseSchema,
  });
}

// ── Files (Sources) ────────────────────────────────────────────────────

export const filesQueryFn = jsonQuery("/api/dnd/files", ListFilesResponseSchema);

export function fileContentUrl(id: string): string {
  return apiUrl(`/api/dnd/files/${id}/content`);
}

export function retriggerNpcs(campaignId: string): Promise<RetriggerNpcsResponse> {
  return apiFetch(`/api/dnd/campaigns/${campaignId}/npcs/retrigger`, {
    method: "POST",
    body: {},
    response: RetriggerNpcsResponseSchema,
  });
}

export function deleteCharacter(id: string): Promise<DeleteCharacterResponse> {
  return apiFetch(`/api/dnd/characters/${id}`, {
    method: "DELETE",
    response: DeleteCharacterResponseSchema,
  });
}

export function updateCharacter(
  id: string,
  sheet: CharacterSheet,
): Promise<UpdateCharacterResponse> {
  return apiFetch(`/api/dnd/characters/${id}`, {
    method: "PUT",
    body: { sheet },
    request: UpdateCharacterRequestSchema,
    response: UpdateCharacterResponseSchema,
  });
}

export function npcsQueryFn(campaignId: string) {
  return jsonQuery(`/api/dnd/campaigns/${campaignId}/npcs`, ListNpcsResponseSchema);
}

// ── Sessions (beamer / TTS companion) ──────────────────────────────────

export function createDndSession(campaignId: string): Promise<CreateSessionResponse> {
  return apiFetch("/api/dnd/sessions", {
    method: "POST",
    body: { campaignId },
    request: CreateSessionRequestSchema,
    response: CreateSessionResponseSchema,
  });
}

export const fetchActiveDndSession = jsonQuery(
  "/api/dnd/sessions/active",
  ActiveSessionResponseSchema,
);

/** SSE stream of `BeamerEvent`s; the caller parses each message. */
export function streamDndSession(sessionId: string): EventSource {
  return new EventSource(apiUrl(`/api/dnd/sessions/${sessionId}/stream`), {
    withCredentials: true,
  });
}

export function triggerBeamer(
  sessionId: string,
  event: BeamerTrigger,
): Promise<TriggerBeamerResponse> {
  return apiFetch(`/api/dnd/sessions/${sessionId}/trigger`, {
    method: "POST",
    body: { event },
    request: TriggerBeamerRequestSchema,
    response: TriggerBeamerResponseSchema,
  });
}

/**
 * File → `data:application/pdf;base64,…`. The prefix is rebuilt from scratch
 * (rather than trusting `readAsDataURL`'s sniffed MIME) so a PDF with a blank
 * `file.type` still matches the wire schema. Callers should pre-check
 * `isAcceptablePdf` first for instant, friendly errors.
 */
export function fileToPdfDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("Could not read the file."));
        return;
      }
      resolve(`data:application/pdf;base64,${result.slice(comma + 1)}`);
    };
    reader.readAsDataURL(file);
  });
}

export function pdfValidationError(file: File): string | null {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return "Only PDF tomes are accepted.";
  if (file.size > CAMPAIGN_PDF_MAX_BYTES) {
    return `This tome is too heavy — ${(file.size / 1024 / 1024).toFixed(1)} MB (20 MB max).`;
  }
  return null;
}
