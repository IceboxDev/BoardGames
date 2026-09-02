import type { PurchaseStatus } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/Badge.tsx";
import { ColumnChart, DonutChart } from "../ui/charts";
import { MicroLabel } from "../ui/Label.tsx";
import { Surface } from "../ui/Surface.tsx";
import { TONE_TEXT } from "../ui/tones";
import {
  formatEtaMonth,
  formatEuroCents,
  type PurchaseInsightsData,
  STALE_WARN_DAYS,
  STATUS_LABEL,
  STATUS_TONE,
} from "./purchase-rows";

// The glanceable strip above the purchase list: metric tiles (in flight /
// next arrival / overdue / stale / committed money), a by-stage donut, and —
// when money is visible, i.e. the viewer is the owner or an admin — spend
// grouped by pledge month. Money panels key off data presence, not the
// `editable` flag: the server already nulls what this viewer can't see.

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

export function PurchaseInsights({ insights }: { insights: PurchaseInsightsData }) {
  const statusesPresent = (Object.keys(STATUS_LABEL) as PurchaseStatus[]).filter(
    (s) => insights.byStatus[s] > 0,
  );
  const showMoney = insights.committedCents !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-3",
            showMoney ? "xl:grid-cols-5" : "xl:grid-cols-4",
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
            sub={insights.nextArrival?.title ?? "nothing scheduled"}
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
              value={formatEuroCents(insights.committedCents as number)}
              sub="pledges + shipping"
            />
          )}
        </div>

        <Surface variant="panel" padding="md" className="flex items-center gap-4">
          <DonutChart
            size={104}
            thickness={11}
            segments={statusesPresent.map((s) => ({
              value: insights.byStatus[s],
              tone: STATUS_TONE[s],
              label: STATUS_LABEL[s],
            }))}
          >
            <span className="text-lg font-bold tabular-nums text-white">
              {insights.activeCount}
            </span>
            <span className="text-3xs text-fg-muted">active</span>
          </DonutChart>
          <div className="flex flex-col gap-1">
            <MicroLabel className="font-semibold">By stage</MicroLabel>
            {statusesPresent.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <Badge tone={STATUS_TONE[s]} size="xs">
                  {STATUS_LABEL[s]}
                </Badge>
                <span className="text-2xs tabular-nums text-fg-muted">{insights.byStatus[s]}</span>
              </span>
            ))}
          </div>
        </Surface>
      </div>

      {showMoney && insights.spendByMonth.length > 0 && (
        <Surface variant="panel" padding="md" className="flex flex-col gap-2">
          <MicroLabel className="font-semibold">Spend by pledge month</MicroLabel>
          <ColumnChart
            height={96}
            columns={insights.spendByMonth.map((m) => ({
              label: formatEtaMonth(m.month),
              segments: [{ value: m.cents, tone: "accent" }],
            }))}
            formatValue={formatEuroCents}
          />
        </Surface>
      )}
    </div>
  );
}
