import type { CreateReportBody, MyReport, MyReports } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { qk } from "../../../lib/query-keys";
import { createReport, markReportsSeen, myReportsQuery, withdrawReport } from "../api";

// The member's own content reports: the list for "Your reports", the open
// ones per target for the report buttons (so a flagged question shows
// "Reported"), and the unread count of resolutions for the archive's dot.
// Every write answers with the new state, which goes straight into the
// cache — no refetch round trip before the button changes.

export function useMyReports(enabled = true) {
  const query = useQuery({
    queryKey: qk.quizReports(),
    queryFn: myReportsQuery(),
    staleTime: 60_000,
    enabled,
  });
  const reports = query.data?.reports;
  const openByTarget = useMemo(() => {
    const map = new Map<string, MyReport[]>();
    for (const r of reports ?? []) {
      if (r.status !== "open") continue;
      const list = map.get(r.target.id);
      if (list) list.push(r);
      else map.set(r.target.id, [r]);
    }
    return map;
  }, [reports]);
  return {
    query,
    reports: reports ?? [],
    unread: query.data?.unread ?? 0,
    openFor: (targetId: string): readonly MyReport[] => openByTarget.get(targetId) ?? [],
  };
}

export function useReportMutations() {
  const qc = useQueryClient();
  const key = qk.quizReports();
  const put = (next: MyReports) => qc.setQueryData<MyReports>(key, next);

  const create = useMutation({
    mutationFn: (body: CreateReportBody) => createReport(body),
    onSuccess: ({ report }) => {
      const cur = qc.getQueryData<MyReports>(key);
      if (!cur) {
        void qc.invalidateQueries({ queryKey: key });
        return;
      }
      const rest = cur.reports.filter((r) => r.id !== report.id);
      put({ ...cur, reports: [report, ...rest] });
    },
  });
  const withdraw = useMutation({ mutationFn: withdrawReport, onSuccess: put });
  const seen = useMutation({
    mutationFn: (ids: number[]) => markReportsSeen({ ids }),
    onSuccess: put,
  });
  return { create, withdraw, seen };
}
