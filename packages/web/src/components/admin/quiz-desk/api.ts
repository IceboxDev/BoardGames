import {
  type QuizDeskBacklogQuery,
  type QuizDeskBacklogResponse,
  QuizDeskBacklogResponseSchema,
  type QuizDeskLinkReportBody,
  QuizDeskLinkReportBodySchema,
  type QuizDeskLinkReportResponse,
  QuizDeskLinkReportResponseSchema,
  type QuizDeskProvenance,
  QuizDeskProvenanceSchema,
  type QuizDeskRetiredQuery,
  type QuizDeskRetiredResponse,
  QuizDeskRetiredResponseSchema,
  type QuizDeskSummary,
  QuizDeskSummarySchema,
} from "@boardgames/core/protocol/http/quiz-desk";
import { createContext, useContext } from "react";
import { apiFetch } from "../../../lib/api-fetch";
import { queryString } from "./logic";

// The Quiz desk's data access, behind one interface so the dev preview can
// hand the same screens fixtures instead of the server. `id` namespaces the
// React Query keys (a preview never fills the real desk's cache).

export interface QuizDeskApi {
  id: string;
  summary: (signal?: AbortSignal) => Promise<QuizDeskSummary>;
  backlog: (q: QuizDeskBacklogQuery, signal?: AbortSignal) => Promise<QuizDeskBacklogResponse>;
  retired: (q: QuizDeskRetiredQuery, signal?: AbortSignal) => Promise<QuizDeskRetiredResponse>;
  provenance: (articleId: string, signal?: AbortSignal) => Promise<QuizDeskProvenance>;
  linkReport: (id: number, body: QuizDeskLinkReportBody) => Promise<QuizDeskLinkReportResponse>;
}

const BASE = "/api/admin/quiz-desk";

export const httpQuizDeskApi: QuizDeskApi = {
  id: "http",
  summary: (signal) => apiFetch(`${BASE}/summary`, { response: QuizDeskSummarySchema, signal }),
  backlog: (q, signal) =>
    apiFetch(`${BASE}/backlog${queryString(q)}`, {
      response: QuizDeskBacklogResponseSchema,
      signal,
    }),
  retired: (q, signal) =>
    apiFetch(`${BASE}/retired${queryString(q)}`, {
      response: QuizDeskRetiredResponseSchema,
      signal,
    }),
  provenance: (articleId, signal) =>
    apiFetch(`${BASE}/articles/${encodeURIComponent(articleId)}/provenance`, {
      response: QuizDeskProvenanceSchema,
      signal,
    }),
  linkReport: (id, body) =>
    apiFetch(`${BASE}/reports/${id}/link`, {
      method: "POST",
      body,
      request: QuizDeskLinkReportBodySchema,
      response: QuizDeskLinkReportResponseSchema,
    }),
};

const QuizDeskApiContext = createContext<QuizDeskApi>(httpQuizDeskApi);
export const QuizDeskApiProvider = QuizDeskApiContext.Provider;

export function useQuizDeskApi(): QuizDeskApi {
  return useContext(QuizDeskApiContext);
}

/** Query keys under the persister-excluded "quiz" root (admin data is never stored on disk). */
export const deskKeys = {
  all: (api: string) => ["quiz", "desk", api] as const,
  summary: (api: string) => ["quiz", "desk", api, "summary"] as const,
  backlog: (api: string, q: object) => ["quiz", "desk", api, "backlog", q] as const,
  retired: (api: string, q: object) => ["quiz", "desk", api, "retired", q] as const,
  provenance: (api: string, id: string) => ["quiz", "desk", api, "provenance", id] as const,
};
