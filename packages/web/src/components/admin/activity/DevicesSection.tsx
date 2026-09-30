import type { AdminDevice } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminFetchDevices } from "../../../lib/admin";
import { formatRelativeTime } from "../../../lib/date-format";
import { qk } from "../../../lib/query-keys";
import { ChevronDownIcon } from "../../icons";

// ── Devices ───────────────────────────────────────────────────────────
//
// Every distinct setup this member has browsed on — the reproduction recipe
// for their layout issues: screen, DPR, zoom, and the CSS viewport to set the
// dev-tools emulator to. Silently absent until the member's client reports.

/**
 * Cluster key: the reported physical-device fingerprint when present; a
 * rotation-invariant heuristic (type + sorted screen + browser/OS) for rows
 * recorded before fingerprinting existed. One device's pile of viewport /
 * zoom / rotation rows collapses to a single expandable entry.
 */
function clusterKeyOf(info: AdminDevice["info"]): string {
  if (info.fingerprint) return `fp:${info.fingerprint}`;
  const long = Math.max(info.screenWidth, info.screenHeight);
  const short = Math.min(info.screenWidth, info.screenHeight);
  return `legacy:${info.deviceType}|${long}x${short}|${info.browser ?? "?"}|${info.os ?? "?"}`;
}

type DeviceCluster = {
  key: string;
  devices: AdminDevice[];
  totalHits: number;
  lastSeen: string;
};

function clusterDevices(devices: AdminDevice[]): DeviceCluster[] {
  const byKey = new Map<string, AdminDevice[]>();
  for (const d of devices) {
    const key = clusterKeyOf(d.info);
    const list = byKey.get(key) ?? [];
    list.push(d);
    byKey.set(key, list);
  }
  return [...byKey.entries()]
    .map(([key, list]) => ({
      key,
      // Most recent setup first within the cluster.
      devices: [...list].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
      totalHits: list.reduce((s, d) => s + d.hits, 0),
      lastSeen: list.reduce((m, d) => (d.lastSeen > m ? d.lastSeen : m), ""),
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function DevicesSection({ userId }: { userId: string }) {
  const devicesQuery = useQuery({
    queryKey: qk.adminUserDevices(userId),
    queryFn: ({ signal }) => adminFetchDevices(userId, signal),
  });
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The whole section starts collapsed — many-device members were pushing the
  // activity trail below the fold. The heading itself is the expander.
  const [expanded, setExpanded] = useState(false);
  const devices = devicesQuery.data?.devices ?? [];
  if (devices.length === 0) return null;
  const clusters = clusterDevices(devices);
  return (
    <section className="shrink-0">
      <h3>
        {/* biome-ignore lint/correctness/noRestrictedElements: bespoke text expander — same footnote weight as the users-table InactiveToggleRow */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="-mx-1 flex cursor-pointer items-center gap-1 rounded-ui-md px-1 py-1 text-2xs font-semibold uppercase tracking-label text-fg-muted transition-colors hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          Devices ({clusters.length})
        </button>
      </h3>
      {!expanded ? null : (
        <DevicesList clusters={clusters} openKey={openKey} setOpenKey={setOpenKey} />
      )}
    </section>
  );
}

function DevicesList({
  clusters,
  openKey,
  setOpenKey,
}: {
  clusters: DeviceCluster[];
  openKey: string | null;
  setOpenKey: (next: string | null) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {clusters.map((cluster) => (
        <li key={cluster.key} className="rounded-card-lg bg-surface-800/60 px-2.5 py-1.5">
          {cluster.devices.length === 1 ? (
            <DeviceLine device={cluster.devices[0]} />
          ) : (
            <>
              {/* biome-ignore lint/correctness/noRestrictedElements: full-row cluster toggle — Button chrome doesn't fit the telemetry list */}
              <button
                type="button"
                aria-expanded={openKey === cluster.key}
                onClick={() => setOpenKey(openKey === cluster.key ? null : cluster.key)}
                className="w-full text-left"
              >
                <ClusterHeader cluster={cluster} open={openKey === cluster.key} />
              </button>
              {openKey === cluster.key && (
                <ul className="mt-1.5 space-y-1.5 border-l border-line pl-2.5">
                  {cluster.devices.map((d) => (
                    <li key={d.id}>
                      <DeviceLine device={d} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Collapsed cluster row: the physical device, its setup count, and recency. */
function ClusterHeader({ cluster, open }: { cluster: DeviceCluster; open: boolean }) {
  const info = cluster.devices[0].info;
  const label = `${info.deviceType[0]?.toUpperCase()}${info.deviceType.slice(1)}`;
  const long = Math.max(info.screenWidth, info.screenHeight);
  const short = Math.min(info.screenWidth, info.screenHeight);
  return (
    <>
      <p className="flex items-center gap-1 text-xs text-fg-primary">
        <span aria-hidden>{DEVICE_GLYPH[info.deviceType]}</span>
        <span className="min-w-0 flex-1 truncate">
          {label} · {short}×{long}
          {info.browser ? ` · ${info.browser}` : ""}
          {info.os ? ` / ${info.os}` : ""}
        </span>
        <span aria-hidden className="text-fg-muted">
          {open ? "▾" : "▸"}
        </span>
      </p>
      <p className="text-2xs text-fg-muted">
        {cluster.devices.length} setups · seen {cluster.totalHits}× · last{" "}
        {formatRelativeTime(cluster.lastSeen)}
      </p>
    </>
  );
}

const DEVICE_GLYPH: Record<AdminDevice["info"]["deviceType"], string> = {
  phone: "📱",
  tablet: "📲",
  desktop: "🖥",
};

function DeviceLine({ device }: { device: AdminDevice }) {
  const { info } = device;
  const ratio = (info.viewportWidth / info.viewportHeight).toFixed(2);
  const label = `${info.deviceType[0]?.toUpperCase()}${info.deviceType.slice(1)}`;
  return (
    <>
      <p className="text-xs text-fg-primary">
        <span aria-hidden className="mr-1">
          {DEVICE_GLYPH[info.deviceType]}
        </span>
        {label} · {info.screenWidth}×{info.screenHeight} @{info.devicePixelRatio}×
        {info.zoomPercent !== undefined && info.zoomPercent !== 100
          ? ` · zoom ~${info.zoomPercent}%`
          : ""}
        {info.pinchScale !== undefined && info.pinchScale !== 1
          ? ` · pinch ${info.pinchScale.toFixed(2)}×`
          : ""}
      </p>
      <p className="text-2xs text-fg-muted">
        viewport {info.viewportWidth}×{info.viewportHeight} ({ratio}:1 {info.orientation})
        {info.browser ? ` · ${info.browser}` : ""}
        {info.os ? ` / ${info.os}` : ""} · seen {device.hits}×, last{" "}
        {formatRelativeTime(device.lastSeen)}
      </p>
    </>
  );
}
