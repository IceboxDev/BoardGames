import type { ProfileNightItem } from "@boardgames/core/protocol";
import { rsvpBehavior } from "./night-stats.ts";

// RSVP behavior panel. The last row surfaces the deliberate attribution gap
// in the nights-attended rule: on nights that HAVE recorded matches, playing
// outranks the RSVP as evidence of presence, so a yes with no match earns no
// attendance credit — worth showing, carefully labelled.

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs" title={title}>
      <span className="text-fg-muted">{label}</span>
      <span className="font-semibold tabular-nums text-fg-primary">{value}</span>
    </div>
  );
}

export function RsvpBehaviorPanel({ items }: { items: readonly ProfileNightItem[] }) {
  const b = rsvpBehavior(items);
  return (
    <div className="space-y-1.5">
      <Row label="RSVP'd yes" value={String(b.yes)} />
      <Row label="RSVP'd no" value={String(b.no)} />
      <Row label="No response" value={String(b.noResponse)} />
      {b.yes > 0 && (
        <Row
          label="Auto vs clicked yes"
          value={`${b.autoYes} · ${b.manualYes}`}
          title="Auto = stamped from availability when the night was locked in"
        />
      )}
      {b.yesWithMatches > 0 && (
        <>
          <Row
            label="Yes → played that night"
            value={`${b.yesAndPlayed} of ${b.yesWithMatches}`}
            title="Nights they RSVP'd yes to that ended with recorded games"
          />
          {b.yesButNoMatch > 0 && (
            <Row
              label="Yes, but no recorded match"
              value={String(b.yesButNoMatch)}
              title="On nights with recorded games, playing outranks the RSVP — these nights earn no attendance credit"
            />
          )}
        </>
      )}
    </div>
  );
}
