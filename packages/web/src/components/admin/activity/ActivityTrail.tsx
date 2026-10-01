import { formatDayKey } from "../../../lib/date-format";
import { TONE_DOT } from "./tones";
import type { TrailLine } from "./trail";

/** The trail's lines under sticky local-day headings, newest first. */
export function ActivityTrail({ lines }: { lines: readonly TrailLine[] }) {
  return (
    <div className="space-y-4">
      {groupByLocalDay(lines).map((group) => (
        <section key={group.key}>
          {/* z-raised: the row dots below are positioned too — without a stacking
              raise, document order paints them over the stuck header. The bg
              matches the DRAWER panel (surface-950), not the modal shade. */}
          <h3 className="sticky top-0 z-raised bg-surface-950/95 py-1 text-2xs font-semibold uppercase tracking-label text-fg-muted backdrop-blur-sm">
            {group.label}
          </h3>
          <ul className="mt-1 space-y-0.5">
            {group.lines.map((line) => (
              <li key={line.key} className="flex items-baseline gap-2.5 rounded-card-md px-1 py-1">
                <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-fg-muted">
                  {localTime(line.at)}
                </span>
                <span
                  aria-hidden
                  className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 self-center rounded-full ${TONE_DOT[line.tone]}`}
                />
                <span className="min-w-0 text-xs leading-5 text-fg-secondary">
                  {line.text}
                  {line.count > 1 && (
                    <span
                      className="ml-1.5 text-2xs tabular-nums text-fg-muted"
                      title={`At ${line.times.map(localTime).reverse().join(", ")}`}
                    >
                      ×{line.count}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function localTime(at: number): string {
  if (!at) return "";
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type DayGroup = { key: string; label: string; lines: TrailLine[] };

function groupByLocalDay(lines: readonly TrailLine[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const line of lines) {
    const d = line.at ? new Date(line.at) : null;
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      : "unknown";
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.lines.push(line);
    } else {
      groups.push({ key, label: d ? formatDayKey(key) : "Unknown date", lines: [line] });
    }
  }
  return groups;
}
