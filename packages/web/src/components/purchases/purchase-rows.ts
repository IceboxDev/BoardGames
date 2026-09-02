import type {
  Purchase,
  PurchaseEventType,
  PurchaseKind,
  PurchaseStatus,
} from "@boardgames/core/protocol";
import type { Tone } from "../ui/tones";

// Pure derivation layer for the Purchases tab (the `collection-rows.ts` of
// this feature): status/tone vocabulary, pipeline rails, ETA slip + overdue
// math, staleness, money formatting, row enrichment, and the scope/sort
// applier. Component-free and clock-injected so every rule is unit-testable.

export const STATUS_TONE: Record<PurchaseStatus, Tone> = {
  fundraising: "purple",
  preorder: "accent",
  production: "amber",
  shipping: "sky",
  delivered: "emerald",
  cancelled: "rose",
};

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  fundraising: "Fundraising",
  preorder: "Preorder",
  production: "In production",
  shipping: "Shipping",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const EVENT_META: Record<PurchaseEventType, { label: string; tone: Tone }> = {
  "status-change": { label: "Status change", tone: "accent" },
  "campaign-update": { label: "Campaign update", tone: "purple" },
  "shipping-notice": { label: "Shipping notice", tone: "sky" },
  delay: { label: "Delay", tone: "amber" },
  note: { label: "Note", tone: "neutral" },
};

/** Everything still moving — what the tab exists to watch. */
export const ACTIVE_STATUSES: ReadonlySet<PurchaseStatus> = new Set([
  "fundraising",
  "preorder",
  "production",
  "shipping",
]);

const CROWDFUNDING_PATH: readonly PurchaseStatus[] = [
  "fundraising",
  "production",
  "shipping",
  "delivered",
];
const RETAIL_PATH: readonly PurchaseStatus[] = ["preorder", "shipping", "delivered"];

/**
 * The progress rail for a purchase: which stages its pipeline has and which
 * one it's on. `null` for cancelled (there is no progress to show) or for a
 * status that isn't on the kind's path (incoherent data — the core coherence
 * test prevents it, the null keeps the UI from lying about it).
 */
export function railFor(
  kind: PurchaseKind,
  status: PurchaseStatus,
): { stops: readonly PurchaseStatus[]; activeIndex: number } | null {
  if (status === "cancelled") return null;
  const stops = kind === "retail" ? RETAIL_PATH : CROWDFUNDING_PATH;
  const activeIndex = stops.indexOf(status);
  return activeIndex === -1 ? null : { stops, activeIndex };
}

/**
 * Months between the first promised ETA and the current one — positive means
 * slipped, negative means early. Null while either end is unknown.
 */
export function slipMonths(original: string | null, current: string | null): number | null {
  if (original === null || current === null) return null;
  const [oy, om] = original.split("-").map(Number);
  const [cy, cm] = current.split("-").map(Number);
  return (cy - oy) * 12 + (cm - om);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11" → "Nov 2026". Locale-free so tests and UI can't disagree. */
export function formatEtaMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTHS[m - 1];
  return name ? `${name} ${y}` : month;
}

/** An active purchase whose promised month has fully passed. */
export function isOverdue(
  currentEtaMonth: string | null,
  status: PurchaseStatus,
  todayKey: string,
): boolean {
  if (currentEtaMonth === null || !ACTIVE_STATUSES.has(status)) return false;
  return currentEtaMonth < todayKey.slice(0, 7);
}

export const STALE_WARN_DAYS = 30;
export const STALE_ALARM_DAYS = 90;

/**
 * Days since the timeline last moved, or null when there are no events yet
 * (a fresh entry isn't "stale" — it's empty). Date keys compare in UTC so
 * the count can't drift across timezones.
 */
export function stalenessDays(events: Purchase["events"], todayKey: string): number | null {
  if (events.length === 0) return null;
  const latest = events.reduce((max, e) => (e.occurredOn > max ? e.occurredOn : max), "");
  const diff = Date.parse(todayKey) - Date.parse(latest);
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/** "€89" / "€89.99" / "€1,790" — EUR cents, deterministic (no Intl). */
export function formatEuroCents(cents: number): string {
  const value = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  const [int, frac] = value.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `€${grouped}${frac ? `.${frac}` : ""}`;
}

export interface PurchaseRow {
  purchase: Purchase;
  slip: number | null;
  overdue: boolean;
  staleDays: number | null;
  latestEventOn: string | null;
  /** Pledge + shipping when either is visible; null on viewer payloads. */
  totalCents: number | null;
  active: boolean;
}

export function buildPurchaseRows(purchases: readonly Purchase[], todayKey: string): PurchaseRow[] {
  return purchases.map((purchase) => {
    const money = [purchase.pledgeCents, purchase.shippingCents].filter((c) => c !== null);
    return {
      purchase,
      slip: slipMonths(purchase.originalEtaMonth, purchase.currentEtaMonth),
      overdue: isOverdue(purchase.currentEtaMonth, purchase.status, todayKey),
      staleDays: stalenessDays(purchase.events, todayKey),
      latestEventOn:
        purchase.events.length === 0
          ? null
          : purchase.events.reduce((max, e) => (e.occurredOn > max ? e.occurredOn : max), ""),
      totalCents: money.length === 0 ? null : money.reduce((a, b) => a + b, 0),
      active: ACTIVE_STATUSES.has(purchase.status),
    };
  });
}

export type PurchaseScope = "all" | "active" | "arrived" | "ended";
export type PurchaseSort = "eta" | "updated" | "pledged" | "title" | "spend";

export interface PurchaseViewState {
  scope: PurchaseScope;
  sort: PurchaseSort;
}

export const DEFAULT_PURCHASE_VIEW: PurchaseViewState = { scope: "all", sort: "eta" };

export interface PurchaseGroup {
  key: string;
  label: string | null;
  rows: PurchaseRow[];
}

/** Comparator per sort key; ties (and missing values) fall back to title. */
function compareBy(sort: PurchaseSort): (a: PurchaseRow, b: PurchaseRow) => number {
  const byTitle = (a: PurchaseRow, b: PurchaseRow) =>
    a.purchase.title.localeCompare(b.purchase.title);
  const nullsLast = (
    pick: (r: PurchaseRow) => string | number | null,
    dir: 1 | -1,
  ): ((a: PurchaseRow, b: PurchaseRow) => number) => {
    return (a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av === null && bv === null) return byTitle(a, b);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return byTitle(a, b);
    };
  };
  switch (sort) {
    case "eta":
      return nullsLast((r) => r.purchase.currentEtaMonth, 1);
    case "updated":
      return nullsLast((r) => r.latestEventOn, -1);
    case "pledged":
      return nullsLast((r) => r.purchase.pledgedOn, -1);
    case "spend":
      return nullsLast((r) => r.totalCents, -1);
    case "title":
      return byTitle;
  }
}

/**
 * Scope + sort + grouping. The "all" scope keeps attention-first order:
 * in-flight purchases (chosen sort) → delivered (latest first) → cancelled
 * last. Narrow scopes render one flat, sorted list (label omitted).
 */
export function applyPurchaseView(
  rows: readonly PurchaseRow[],
  view: PurchaseViewState,
): PurchaseGroup[] {
  const sorted = (subset: PurchaseRow[], sort: PurchaseSort) => [...subset].sort(compareBy(sort));
  if (view.scope !== "all") {
    const subset = rows.filter((r) =>
      view.scope === "active"
        ? r.active
        : view.scope === "arrived"
          ? r.purchase.status === "delivered"
          : r.purchase.status === "cancelled",
    );
    return subset.length === 0
      ? []
      : [{ key: view.scope, label: null, rows: sorted(subset, view.sort) }];
  }
  const groups: PurchaseGroup[] = [
    {
      key: "active",
      label: "In flight",
      rows: sorted(
        rows.filter((r) => r.active),
        view.sort,
      ),
    },
    {
      key: "delivered",
      label: "Delivered",
      rows: sorted(
        rows.filter((r) => r.purchase.status === "delivered"),
        "updated",
      ),
    },
    {
      key: "cancelled",
      label: "Cancelled",
      rows: sorted(
        rows.filter((r) => r.purchase.status === "cancelled"),
        "title",
      ),
    },
  ];
  return groups.filter((g) => g.rows.length > 0);
}

export interface PurchaseInsightsData {
  total: number;
  activeCount: number;
  byStatus: Record<PurchaseStatus, number>;
  nextArrival: { etaMonth: string; title: string } | null;
  overdueCount: number;
  staleCount: number;
  /** Sum of every visible pledge+shipping; null when no money is visible. */
  committedCents: number | null;
  /** Visible money grouped by pledge month, ascending. */
  spendByMonth: { month: string; cents: number }[];
}

export function buildInsights(
  rows: readonly PurchaseRow[],
  todayKey: string,
): PurchaseInsightsData {
  const byStatus = Object.fromEntries(Object.keys(STATUS_LABEL).map((s) => [s, 0])) as Record<
    PurchaseStatus,
    number
  >;
  for (const r of rows) byStatus[r.purchase.status] += 1;

  const thisMonth = todayKey.slice(0, 7);
  const upcoming = rows
    .filter((r) => r.active && r.purchase.currentEtaMonth !== null)
    .filter((r) => (r.purchase.currentEtaMonth as string) >= thisMonth)
    .sort(compareBy("eta"))[0];

  const withMoney = rows.filter((r) => r.totalCents !== null);
  const spend = new Map<string, number>();
  for (const r of withMoney) {
    if (r.purchase.pledgedOn === null) continue;
    const month = r.purchase.pledgedOn.slice(0, 7);
    spend.set(month, (spend.get(month) ?? 0) + (r.totalCents as number));
  }

  return {
    total: rows.length,
    activeCount: rows.filter((r) => r.active).length,
    byStatus,
    nextArrival: upcoming
      ? {
          etaMonth: upcoming.purchase.currentEtaMonth as string,
          title: upcoming.purchase.title,
        }
      : null,
    overdueCount: rows.filter((r) => r.overdue).length,
    staleCount: rows.filter((r) => r.active && (r.staleDays ?? 0) >= STALE_WARN_DAYS).length,
    committedCents:
      withMoney.length === 0 ? null : withMoney.reduce((a, r) => a + (r.totalCents as number), 0),
    spendByMonth: [...spend.entries()]
      .map(([month, cents]) => ({ month, cents }))
      .sort((a, b) => (a.month < b.month ? -1 : 1)),
  };
}

/** Today as a local "YYYY-MM-DD" key (the clock every derivation runs on). */
export function localTodayKey(now: Date = new Date()): string {
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}
