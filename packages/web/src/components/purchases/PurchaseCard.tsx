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
  formatEurTotal,
  formatMoneyCents,
  type PurchaseOrderCard,
  type PurchaseRow,
  STALE_ALARM_DAYS,
  STALE_WARN_DAYS,
} from "./purchase-rows";

// One real-world order: a clean collapsed header (thumb, order name, overdue
// badge, a one-line meta the phone can actually fit, owner money), the
// representative wave's pipeline rail with ONE primary link beside it, and an
// expanded region carrying everything that was trimmed from the overview —
// the full pledge wording, platform + pledge date, ETA slip, per-wave detail
// for multi-wave orders, the note, the money breakdown, the secondary link,
// and the update timeline. Status has no badge (the rail says it) and slip
// lives only in the detail. The header is the expansion toggle; links live
// OUTSIDE it (nested interactive elements are invalid HTML).

/** "ETA Nov 2026" / "Delivered Jun 15, 2026" / "Cancelled" — the one ETA-ish
 *  fact a wave can state about itself. */
function etaFragment(row: PurchaseRow): string | null {
  const p = row.purchase;
  if (p.status === "delivered" && p.deliveredOn) {
    return `Delivered ${formatDayKey(p.deliveredOn, "compact")}`;
  }
  if (p.status === "cancelled") return "Cancelled";
  if (p.currentEtaMonth) return `ETA ${formatEtaMonth(p.currentEtaMonth)}`;
  return null;
}

/** "slipped 3 mo (was May 2026)" / "1 mo early (was Sep 2026)" — detail-only. */
function slipText(row: PurchaseRow): string | null {
  if (row.slip === null || row.slip === 0) return null;
  const was = row.purchase.originalEtaMonth
    ? ` (was ${formatEtaMonth(row.purchase.originalEtaMonth)})`
    : "";
  const n = Math.abs(row.slip);
  return row.slip > 0 ? `slipped ${n} mo${was}` : `${n} mo early${was}`;
}

function ownerMoneyLine(row: PurchaseRow): string | null {
  const p = row.purchase;
  const money = (cents: number) => formatMoneyCents(cents, p.currency);
  return [
    p.pledgeCents !== null
      ? `${p.kind === "retail" ? "Price" : "Pledge"} ${money(p.pledgeCents)}`
      : null,
    p.shippingCents !== null ? `Shipping ${money(p.shippingCents)}` : null,
    row.totalCents !== null && p.shippingCents !== null ? `Total ${money(row.totalCents)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One wave's slice of a multi-wave order's expanded region. */
function WaveDetail({ row }: { row: PurchaseRow }) {
  const p = row.purchase;
  const facts = [etaFragment(row), slipText(row)].filter(Boolean).join(" · ");
  const money = ownerMoneyLine(row);
  return (
    <div className="space-y-2 border-t border-white/[0.06] pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-xs font-semibold text-fg-primary">{displayPurchaseTitle(p)}</span>
        {facts && <span className="text-2xs text-fg-muted">{facts}</span>}
      </div>
      <PurchasePipelineRail kind={p.kind} status={p.status} />
      {money && <p className="text-2xs tabular-nums text-fg-secondary">{money}</p>}
      {p.note && <p className="text-2xs leading-snug text-fg-secondary">{p.note}</p>}
      <PurchaseTimeline events={p.events} />
    </div>
  );
}

export function PurchaseCard({
  card,
  expanded,
  onToggle,
}: {
  card: PurchaseOrderCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rep = card.rep;
  const p = rep.purchase;
  const multiWave = card.waves.length > 1;
  const thumb = resolveGame(card.slug)?.thumbnail;

  // Meta line: the phone gets only the ETA (with an inline slip delta) and
  // staleness; platform + pledge date are desktop-only. Wave names stay
  // inside the expanded view — the collapsed subtext reads the same for
  // every card.
  const eta = etaFragment(rep);
  // Slip at a glance, as a tinted "+26 mo" beside the ETA — no badge chrome;
  // the "(was …)" context rides the tooltip and the expanded detail line.
  const slip = rep.active && eta !== null && rep.slip !== null && rep.slip !== 0 ? rep.slip : null;
  const desktopMeta: string[] = [];
  if (p.platform) desktopMeta.push(p.platform);
  if (card.earliestPledgedOn) {
    const verb = p.kind === "retail" ? "Ordered" : "Pledged";
    desktopMeta.push(`${verb} ${formatDayKey(card.earliestPledgedOn, "compact")}`);
  }
  const showStale = card.active && card.staleDays !== null;

  // List money speaks one currency: exact euros, or "≈ €514" converted.
  const moneyLine = card.totalCents !== null ? formatEurTotal(card.totalCents, p.currency) : null;

  // The primary link sits beside the rail on EVERY card, so its label must
  // fit the shared fixed-width slot ("Pledge ↗", not "Pledge manager ↗") —
  // otherwise the rail's length varies card to card.
  const primaryLink = p.campaignUrl
    ? { href: p.campaignUrl, label: p.kind === "retail" ? "Shop ↗" : "Campaign ↗" }
    : p.pledgeManagerUrl
      ? { href: p.pledgeManagerUrl, label: p.kind === "retail" ? "Order ↗" : "Pledge ↗" }
      : null;
  const secondaryLink =
    p.campaignUrl && p.pledgeManagerUrl
      ? { href: p.pledgeManagerUrl, label: p.kind === "retail" ? "Order ↗" : "Pledge manager ↗" }
      : null;

  const singleDetail = multiWave
    ? null
    : [...desktopMeta, etaFragment(rep), slipText(rep)].filter(Boolean).join(" · ");

  return (
    <Surface
      as="li"
      variant="tile"
      padding="none"
      className={cn(card.allCancelled && "opacity-60")}
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: full-width expansion toggle — Button chrome doesn't fit a card header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} details for ${card.title}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-t-xl px-3 pb-2 pt-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-9 w-16 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-surface-800 text-sm font-bold text-fg-muted">
            {card.title.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg-primary">
            <span className="truncate">{card.title}</span>
            {card.overdue && (
              <Badge tone="rose" size="xs" ring>
                overdue
              </Badge>
            )}
          </p>
          <p className="truncate text-3xs text-fg-muted">
            {desktopMeta.length > 0 && (
              <span className="hidden sm:inline">
                {desktopMeta.join(" · ")}
                {(eta || showStale) && " · "}
              </span>
            )}
            {eta}
            {slip !== null && (
              <span
                title={slipText(rep) ?? undefined}
                className={cn("font-medium", slip > 0 ? "text-amber-300" : "text-emerald-300")}
              >
                {" "}
                {slip > 0 ? `+${slip} mo` : `−${-slip} mo`}
              </span>
            )}
            {showStale && (
              <>
                {eta && " · "}
                <span
                  className={cn(
                    (card.staleDays as number) >= STALE_ALARM_DAYS && "text-rose-300",
                    (card.staleDays as number) >= STALE_WARN_DAYS &&
                      (card.staleDays as number) < STALE_ALARM_DAYS &&
                      "text-amber-300",
                  )}
                >
                  updated {card.staleDays} d ago
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
        {primaryLink ? (
          <ButtonLink
            href={primaryLink.href}
            external
            variant="ghost"
            size="sm"
            className="w-28 shrink-0"
          >
            {primaryLink.label}
          </ButtonLink>
        ) : (
          // Linkless cards keep the same rail length as everyone else.
          <span aria-hidden className="w-28 shrink-0" />
        )}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/[0.06] px-3 py-3">
          {!multiWave && p.title !== card.title && (
            <p className="text-2xs leading-snug text-fg-muted">{p.title}</p>
          )}
          {singleDetail && <p className="text-2xs text-fg-muted">{singleDetail}</p>}
          {secondaryLink && (
            <ButtonLink href={secondaryLink.href} external variant="ghost" size="sm">
              {secondaryLink.label}
            </ButtonLink>
          )}
          {multiWave ? (
            <div className="space-y-2.5">
              {card.waves.map((wave) => (
                <WaveDetail key={wave.purchase.id} row={wave} />
              ))}
            </div>
          ) : (
            <>
              {p.note && <p className="text-xs leading-snug text-fg-secondary">{p.note}</p>}
              {ownerMoneyLine(rep) && (
                <p className="text-xs tabular-nums text-fg-secondary">{ownerMoneyLine(rep)}</p>
              )}
              <PurchaseTimeline events={p.events} />
            </>
          )}
        </div>
      )}
    </Surface>
  );
}
