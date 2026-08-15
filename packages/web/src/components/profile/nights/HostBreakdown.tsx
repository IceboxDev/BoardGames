import type { ProfileNightItem } from "@boardgames/core/protocol";
import { compactAddress } from "../../../lib/compact-address.ts";
import { HostIcon, PinIcon } from "../../icons";
import { hostGroups } from "./night-stats.ts";

// "Where we play": nights grouped by host. There is no locations table —
// location = host + free-text address, so the host IS the venue.

export function HostBreakdown({ items }: { items: readonly ProfileNightItem[] }) {
  const groups = hostGroups(items);
  if (groups.length === 0) return null;
  const max = Math.max(...groups.map((g) => g.total), 1);

  return (
    <ul className="space-y-2.5">
      {groups.map((group) => (
        <li key={group.key} className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-200">
            <HostIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-fg-primary">{group.name}</span>
              <span className="shrink-0 text-3xs tabular-nums text-fg-muted">
                attended {group.attended} of {group.total}
              </span>
            </p>
            {group.latestAddress && (
              <p className="flex items-center gap-1 truncate text-3xs text-fg-muted">
                <PinIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{compactAddress(group.latestAddress)}</span>
              </p>
            )}
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-800">
              <div className="flex h-full" style={{ width: `${(group.total / max) * 100}%` }}>
                <div
                  className="h-full bg-emerald-500/80"
                  style={{
                    width: `${group.total > 0 ? (group.attended / group.total) * 100 : 0}%`,
                  }}
                />
                <div className="h-full flex-1 bg-white/10" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
