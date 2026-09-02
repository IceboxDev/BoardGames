import { type PurchasesResponse, PurchasesResponseSchema } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { ApiError } from "../../lib/api-fetch.ts";
import { qk } from "../../lib/query-keys.ts";
import { jsonQuery } from "../../lib/typed-query.ts";
import { StackIcon } from "../icons";
import { Button } from "../ui/Button.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { MicroLabel } from "../ui/Label.tsx";
import { LoadingState } from "../ui/LoadingState.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { PageMain } from "../ui/PageShell.tsx";
import { QueryBoundary } from "../ui/QueryBoundary.tsx";
import { Stack } from "../ui/Stack.tsx";
import { PurchaseCard } from "./PurchaseCard.tsx";
import { PurchaseFilters } from "./PurchaseFilters.tsx";
import { PurchaseInsights } from "./PurchaseInsights.tsx";
import {
  applyPurchaseView,
  buildInsights,
  buildPurchaseRows,
  DEFAULT_PURCHASE_VIEW,
  formatEtaMonth,
  localTodayKey,
  type PurchaseViewState,
} from "./purchase-rows";

// The Purchases tab of the Games Manager page — a read-only pipeline over
// crowdfunding pledges and preorders. One GET, no mutations: the data is
// maintained code-side (see @boardgames/core/purchases/data) and money
// arrives already nulled for viewers other than the owner and admins.

export function PurchasesTab({
  userId,
  firstName,
  tabBar,
}: {
  userId: string;
  firstName: string;
  tabBar: ReactNode;
}) {
  const query = useQuery({
    queryKey: qk.purchases(userId),
    queryFn: jsonQuery(
      `/api/purchases/users/${encodeURIComponent(userId)}`,
      PurchasesResponseSchema,
    ),
    enabled: !!userId,
  });
  const todayKey = localTodayKey();

  return (
    <QueryBoundary
      query={query}
      loading={
        <PageMain width="7xl" padding="spacious" fillHeight>
          <Stack gap="lg">
            {tabBar}
            <LoadingState fillHeight label="Loading purchases…" />
          </Stack>
        </PageMain>
      }
      errorFallback={(error) => {
        const notFound = error instanceof ApiError && error.status === 404;
        return (
          <PageMain width="7xl" padding="spacious">
            <EmptyState
              tone="rose"
              title={notFound ? "Player not found" : "Couldn't load the purchases"}
              description={
                notFound
                  ? "This player doesn't exist or has been removed."
                  : "Something went wrong fetching the purchases. Try again."
              }
              action={
                <Button variant="secondary" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            />
          </PageMain>
        );
      }}
    >
      {(data) => {
        const rows = buildPurchaseRows(data.purchases, todayKey);
        const insights = buildInsights(rows, todayKey);
        const subtitleParts = [
          `${insights.activeCount} in flight`,
          insights.nextArrival
            ? `next arrival ${formatEtaMonth(insights.nextArrival.etaMonth)}`
            : null,
          insights.overdueCount > 0 ? `${insights.overdueCount} overdue` : null,
        ].filter(Boolean);
        return (
          <PageMain width="7xl" padding="spacious">
            <Stack gap="lg">
              <PageHeader
                size="lg"
                eyebrow="Collection"
                title={data.editable ? "Purchase manager" : `${firstName}'s purchases`}
                subtitle={subtitleParts.join(" · ")}
              />
              {tabBar}
              <PurchasesView data={data} firstName={firstName} todayKey={todayKey} />
            </Stack>
          </PageMain>
        );
      }}
    </QueryBoundary>
  );
}

/**
 * The tab's body, network-free (fixture-injectable for the dev preview):
 * insight strip, scope/sort filters, and the grouped card list.
 */
export function PurchasesView({
  data,
  firstName,
  todayKey,
}: {
  data: PurchasesResponse;
  firstName: string;
  todayKey: string;
}) {
  const [view, setView] = useState<PurchaseViewState>(DEFAULT_PURCHASE_VIEW);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rows = useMemo(() => buildPurchaseRows(data.purchases, todayKey), [data, todayKey]);
  const insights = useMemo(() => buildInsights(rows, todayKey), [rows, todayKey]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<StackIcon className="h-4 w-4" />}
        title={
          data.editable ? "No purchases tracked yet" : `${firstName} has no purchases in flight`
        }
        description={
          data.editable
            ? "Crowdfunding pledges and preorders are added by the site keeper — they'll show up here with a live timeline."
            : "Nothing pledged or preordered right now."
        }
      />
    );
  }

  const groups = applyPurchaseView(rows, view);
  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.active).length,
    arrived: rows.filter((r) => r.purchase.status === "delivered").length,
    ended: rows.filter((r) => r.purchase.status === "cancelled").length,
  };

  return (
    <>
      <PurchaseInsights insights={insights} />
      {rows.length > 1 && (
        <PurchaseFilters
          state={view}
          onChange={setView}
          counts={counts}
          hasMoney={insights.committed.length > 0}
        />
      )}
      {groups.length === 0 ? (
        <EmptyState title="Nothing in this view" description="Loosen the scope filter." />
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            {group.label && (
              <MicroLabel className="mb-1.5 block font-semibold">
                {group.label} ({group.rows.length})
              </MicroLabel>
            )}
            <ul className="space-y-2">
              {group.rows.map((row) => (
                <PurchaseCard
                  key={row.purchase.id}
                  row={row}
                  expanded={expandedId === row.purchase.id}
                  onToggle={() =>
                    setExpandedId(expandedId === row.purchase.id ? null : row.purchase.id)
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
