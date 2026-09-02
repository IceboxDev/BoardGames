import { cn } from "../../lib/cn";
import { formatDayKey } from "../../lib/date-format";
import { resolveGame } from "../../lib/games-by-slug";
import { ChevronDownIcon } from "../icons";
import { Badge } from "../ui/Badge.tsx";
import { ButtonLink } from "../ui/Button.tsx";
import { Surface } from "../ui/Surface.tsx";
import { PurchasePipelineRail } from "./PurchasePipelineRail.tsx";
import { PurchaseTimeline } from "./PurchaseTimeline.tsx";
import {
  formatEtaMonth,
  formatEuroCents,
  type PurchaseRow,
  STALE_ALARM_DAYS,
  STALE_WARN_DAYS,
  STATUS_LABEL,
  STATUS_TONE,
} from "./purchase-rows";

// One tracked purchase: dense collapsed header (thumb, status, slip/overdue
// badges, ETA + staleness meta, owner money), the pipeline rail with the
// campaign/shop links beside it, and an expanded region holding the note,
// the money breakdown, and the update timeline. The header is the expansion
// toggle; the links live OUTSIDE it (nested interactive elements are invalid
// HTML), on the rail row, so they stay one click away while collapsed.

function slipLabel(slip: number): string {
  const n = Math.abs(slip);
  return slip > 0 ? `slipped ${n} mo` : `${n} mo early`;
}

export function PurchaseCard({
  row,
  expanded,
  onToggle,
}: {
  row: PurchaseRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const p = row.purchase;
  const thumb = resolveGame(p.slug)?.thumbnail;
  const cancelled = p.status === "cancelled";

  const meta: string[] = [];
  if (p.platform) meta.push(p.platform);
  if (p.pledgedOn) meta.push(`Pledged ${formatDayKey(p.pledgedOn, "compact")}`);
  if (p.status === "delivered" && p.deliveredOn) {
    meta.push(`Delivered ${formatDayKey(p.deliveredOn, "compact")}`);
  } else if (p.currentEtaMonth) {
    const was =
      row.slip !== null && row.slip !== 0 && p.originalEtaMonth
        ? ` (was ${formatEtaMonth(p.originalEtaMonth)})`
        : "";
    meta.push(`ETA ${formatEtaMonth(p.currentEtaMonth)}${was}`);
  }

  const showStale = row.active && row.staleDays !== null;
  const moneyLine =
    p.pledgeCents !== null
      ? `${formatEuroCents(p.pledgeCents)}${
          p.shippingCents !== null ? ` + ${formatEuroCents(p.shippingCents)} ship` : ""
        }`
      : p.shippingCents !== null
        ? `${formatEuroCents(p.shippingCents)} ship`
        : null;

  const links = [
    p.campaignUrl ? { href: p.campaignUrl, label: "Campaign ↗" } : null,
    p.pledgeManagerUrl ? { href: p.pledgeManagerUrl, label: "Shop ↗" } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);

  return (
    <Surface as="li" variant="tile" padding="none" className={cn(cancelled && "opacity-60")}>
      {/* biome-ignore lint/correctness/noRestrictedElements: full-width expansion toggle — Button chrome doesn't fit a card header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} details for ${p.title}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-t-xl px-3 pb-2 pt-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-9 w-16 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-surface-800 text-sm font-bold text-fg-muted">
            {p.title.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg-primary">
            <span className="truncate">{p.title}</span>
            <Badge tone={STATUS_TONE[p.status]} size="xs">
              {STATUS_LABEL[p.status]}
            </Badge>
            {row.slip !== null && row.slip !== 0 && (
              <Badge tone={row.slip > 0 ? "amber" : "emerald"} size="xs">
                {slipLabel(row.slip)}
              </Badge>
            )}
            {row.overdue && (
              <Badge tone="rose" size="xs" ring>
                overdue
              </Badge>
            )}
          </p>
          <p className="truncate text-3xs text-fg-muted">
            {meta.join(" · ")}
            {showStale && (
              <>
                {meta.length > 0 && " · "}
                <span
                  className={cn(
                    (row.staleDays as number) >= STALE_ALARM_DAYS && "text-rose-300",
                    (row.staleDays as number) >= STALE_WARN_DAYS &&
                      (row.staleDays as number) < STALE_ALARM_DAYS &&
                      "text-amber-300",
                  )}
                >
                  updated {row.staleDays} d ago
                </span>
              </>
            )}
          </p>
        </div>
        {moneyLine && (
          <span className="hidden shrink-0 text-xs tabular-nums text-fg-secondary sm:block">
            {moneyLine}
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-fg-muted transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <div className="flex items-center gap-3 px-3 pb-2.5">
        <div className="min-w-0 flex-1">
          <PurchasePipelineRail kind={p.kind} status={p.status} />
        </div>
        {links.map((link) => (
          <ButtonLink
            key={link.href}
            href={link.href}
            external
            variant="ghost"
            size="sm"
            className="shrink-0"
          >
            {link.label}
          </ButtonLink>
        ))}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/[0.06] px-3 py-3">
          {p.note && <p className="text-xs leading-snug text-fg-secondary">{p.note}</p>}
          {moneyLine && (
            <p className="text-xs tabular-nums text-fg-secondary">
              {[
                p.pledgeCents !== null ? `Pledge ${formatEuroCents(p.pledgeCents)}` : null,
                p.shippingCents !== null ? `Shipping ${formatEuroCents(p.shippingCents)}` : null,
                row.totalCents !== null ? `Total ${formatEuroCents(row.totalCents)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <PurchaseTimeline events={p.events} />
        </div>
      )}
    </Surface>
  );
}
