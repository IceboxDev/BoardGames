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
  displayPurchaseTitle,
  formatEtaMonth,
  formatMoneyCents,
  type PurchaseRow,
  STALE_ALARM_DAYS,
  STALE_WARN_DAYS,
} from "./purchase-rows";

// One tracked purchase: clean collapsed header (thumb, short name, slip/
// overdue badges, ETA + staleness meta, owner money), the pipeline rail with
// ONE primary link beside it, and an expanded region holding the full pledge
// wording, the note, the money breakdown, the secondary link, and the update
// timeline. The status itself has no badge — the rail's position and color
// already say it. The header is the expansion toggle; links live OUTSIDE it
// (nested interactive elements are invalid HTML) so they stay one click away.

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
  const money = (cents: number) => formatMoneyCents(cents, p.currency);
  const moneyLine =
    p.pledgeCents !== null
      ? `${money(p.pledgeCents)}${p.shippingCents !== null ? ` + ${money(p.shippingCents)} ship` : ""}`
      : p.shippingCents !== null
        ? `${money(p.shippingCents)} ship`
        : null;

  // One link while collapsed — the campaign page (which links onward to the
  // pledge manager anyway); the pledge manager gets its own link only in the
  // expanded detail, or promotes to primary when it's all there is.
  const pmLabel = p.kind === "retail" ? "Order ↗" : "Pledge manager ↗";
  const primaryLink = p.campaignUrl
    ? { href: p.campaignUrl, label: p.kind === "retail" ? "Shop ↗" : "Campaign ↗" }
    : p.pledgeManagerUrl
      ? { href: p.pledgeManagerUrl, label: pmLabel }
      : null;
  const secondaryLink =
    p.campaignUrl && p.pledgeManagerUrl ? { href: p.pledgeManagerUrl, label: pmLabel } : null;
  const displayTitle = displayPurchaseTitle(p);

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
            <span className="truncate">{displayTitle}</span>
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
        {primaryLink && (
          <ButtonLink
            href={primaryLink.href}
            external
            variant="ghost"
            size="sm"
            className="shrink-0"
          >
            {primaryLink.label}
          </ButtonLink>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/[0.06] px-3 py-3">
          {p.title !== displayTitle && (
            <p className="text-2xs leading-snug text-fg-muted">{p.title}</p>
          )}
          {p.note && <p className="text-xs leading-snug text-fg-secondary">{p.note}</p>}
          {moneyLine && (
            <p className="text-xs tabular-nums text-fg-secondary">
              {[
                p.pledgeCents !== null ? `Pledge ${money(p.pledgeCents)}` : null,
                p.shippingCents !== null ? `Shipping ${money(p.shippingCents)}` : null,
                row.totalCents !== null ? `Total ${money(row.totalCents)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {secondaryLink && (
            <ButtonLink href={secondaryLink.href} external variant="ghost" size="sm">
              {secondaryLink.label}
            </ButtonLink>
          )}
          <PurchaseTimeline events={p.events} />
        </div>
      )}
    </Surface>
  );
}
