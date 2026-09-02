import type { PurchaseStatus } from "@boardgames/core/protocol";
import { type ReactNode, useState } from "react";
import { cn } from "../../lib/cn";
import { ColumnChart, DonutChart } from "../ui/charts";
import { MicroLabel } from "../ui/Label.tsx";
import { Surface } from "../ui/Surface.tsx";
import { TONE_TEXT } from "../ui/tones";
import {
  CURRENCY_TONE,
  committedEurCents,
  compactTitle,
  formatApproxEur,
  formatEtaMonth,
  type PurchaseInsightsData,
  STALE_WARN_DAYS,
  STATUS_LABEL,
  STATUS_TEXT_CLASS,
  STATUS_TONE,
} from "./purchase-rows";

// The glanceable strip above the purchase list: one uniform grid of metric
// tiles (in flight / next arrival / overdue / stale / committed money / a
// by-stage mini donut) and — when money is visible, i.e. the viewer is the
// owner or an admin — spend grouped by pledge month. Money panels key off
// data presence, not the `editable` flag: the server already nulls what this
// viewer can't see.

function InsightTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "rose" | "amber";
}) {
  return (
    <Surface variant="raised" padding="none" className="flex flex-col gap-0.5 px-3 py-2.5">
      <MicroLabel className="font-semibold">{label}</MicroLabel>
      <span
        className={cn(
          "text-xl font-bold tabular-nums",
          tone === "neutral" ? "text-white" : TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      {sub && <span className="truncate text-3xs text-fg-muted">{sub}</span>}
    </Surface>
  );
}

/**
 * The by-stage donut at tile size. Tapping a slice swaps the tile's figure
 * for that stage's count + label (tap again to clear) — the always-on badge
 * legend it replaces read as a second, fatter card. Slice `<title>` tooltips
 * keep the per-stage numbers reachable without pointer precision.
 */
function ByStageTile({ insights }: { insights: PurchaseInsightsData }) {
  const [selected, setSelected] = useState<PurchaseStatus | null>(null);
  const statusesPresent = (Object.keys(STATUS_LABEL) as PurchaseStatus[]).filter(
    (s) => insights.byStatus[s] > 0,
  );
  const active = selected !== null && insights.byStatus[selected] > 0 ? selected : null;

  return (
    <Surface variant="raised" padding="none" className="flex flex-col gap-0.5 px-3 py-2.5">
      <MicroLabel className="font-semibold">By stage</MicroLabel>
      <div className="flex min-w-0 items-center gap-2.5">
        <DonutChart
          size={44}
          thickness={7}
          className="shrink-0"
          segments={statusesPresent.map((s) => ({
            value: insights.byStatus[s],
            tone: STATUS_TONE[s],
            label: STATUS_LABEL[s],
          }))}
          onSegmentClick={(i) => {
            const status = statusesPresent[i];
            setSelected(status === active ? null : status);
          }}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xl font-bold leading-none tabular-nums text-white">
            {active ? insights.byStatus[active] : insights.activeCount}
          </span>
          <span
            className={cn(
              "truncate text-3xs",
              active ? STATUS_TEXT_CLASS[active] : "text-fg-muted",
            )}
          >
            {active ? STATUS_LABEL[active] : "active"}
          </span>
        </div>
      </div>
    </Surface>
  );
}

export function PurchaseInsights({ insights }: { insights: PurchaseInsightsData }) {
  const showMoney = insights.committed.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "grid grid-cols-2 gap-2 sm:grid-cols-3",
          showMoney ? "xl:grid-cols-6" : "xl:grid-cols-5",
        )}
      >
        <InsightTile
          label="In flight"
          value={insights.activeCount}
          sub={`of ${insights.total} tracked`}
        />
        <InsightTile
          label="Next arrival"
          value={insights.nextArrival ? formatEtaMonth(insights.nextArrival.etaMonth) : "—"}
          sub={
            insights.nextArrival ? compactTitle(insights.nextArrival.title) : "nothing scheduled"
          }
        />
        <InsightTile
          label="Overdue"
          value={insights.overdueCount}
          sub="past their ETA"
          tone={insights.overdueCount > 0 ? "rose" : "neutral"}
        />
        <InsightTile
          label="Stale"
          value={insights.staleCount}
          sub={`no update ${STALE_WARN_DAYS}d+`}
          tone={insights.staleCount > 0 ? "amber" : "neutral"}
        />
        {showMoney && (
          <InsightTile
            label="Committed"
            value={formatApproxEur(committedEurCents(insights.committed))}
            sub="pledges + shipping"
          />
        )}
        <ByStageTile insights={insights} />
      </div>

      {showMoney && insights.spendByMonth.length > 0 && (
        <Surface variant="panel" padding="md" className="flex flex-col gap-2">
          <MicroLabel className="font-semibold">Spend by pledge month</MicroLabel>
          <ColumnChart
            height={96}
            columns={insights.spendByMonth.map((m) => ({
              label: formatEtaMonth(m.month),
              segments: m.amounts.map((a) => ({
                value: a.cents,
                tone: CURRENCY_TONE[a.currency],
                label: a.currency,
              })),
            }))}
            formatValue={(cents) => (cents / 100).toFixed(2)}
          />
        </Surface>
      )}
    </div>
  );
}
