import { useState } from "react";
import GameCarousel3D from "../components/offline/GameCarousel3D";
import { AddressLink, HostLine, RSVP_OPTIONS, TimeLine } from "../components/offline/RsvpModal";
import { Modal } from "../components/ui/Modal";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { games } from "../games/registry";

// Dev-only visual preview of the RSVP modal shell + game carousel — the
// exact surface behind /offline's day cards, but with static data and no
// auth/queries, so phone-size regressions (date wrap, address overflow,
// carousel clipping) can be reproduced headlessly at any viewport. Mirrors
// DndNightPreview / DeckPreview. Route: /dev/rsvp-preview.

// Worst-case-ish fixture strings: long weekday+month date, full
// Google-Places-style German address.
const HEADING_DATE = "Sunday, August 16";
const ADDRESS = "Musterstraße 118, 60316 Frankfurt am Main, Germany";

const PREVIEW_SLUGS = new Set([
  "captain-sonar",
  "parks",
  "codenames",
  "sushi-go",
  "7-wonders",
  "cascadia",
]);

export default function RsvpPreview() {
  const [rsvp, setRsvp] = useState<"yes" | "no">("yes");
  const [view, setView] = useState<"pick" | "results" | "attendees">("pick");
  const previewGames = games
    .filter((g) => PREVIEW_SLUGS.has(g.slug))
    // Captain Sonar first — the long-title regression case sits centered.
    .sort((a, b) => (a.slug === "captain-sonar" ? -1 : b.slug === "captain-sonar" ? 1 : 0));
  // ?frame=WxH — re-render this page inside an iframe of that CSS size so a
  // headless browser (whose window has a 500px minimum width) can still lay
  // out a true phone viewport. Media queries evaluate against the iframe.
  const frame = new URLSearchParams(window.location.search).get("frame");

  const eyebrow = (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span>Game night</span>
      <span className="inline-flex items-baseline gap-1 tracking-normal normal-case">
        <span aria-hidden="true" className="text-white/30">
          ·
        </span>
        <span className="font-bold text-emerald-300 tabular-nums">5</span>
        <span className="text-fg-secondary">going</span>
        <span aria-hidden="true" className="text-white/30">
          +
        </span>
        <span className="font-bold text-amber-300 tabular-nums">2</span>
        <span className="text-fg-secondary">maybe</span>
      </span>
    </span>
  );

  const subheader = (
    <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
      <HostLine name="Victor" />
      <TimeLine value="19:00" />
      <AddressLink address={ADDRESS} />
    </div>
  );

  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + window.location.search.replace(/[?&]frame=[^&]*/, "")}
        style={{ width: w || 360, height: h || 644, border: "1px solid #333" }}
      />
    );
  }

  return (
    <Modal
      onClose={() => {}}
      size="full"
      panelClassName="gap-2 sm:gap-4 sm:p-7"
      eyebrow={eyebrow}
      title={HEADING_DATE}
      titleClassName="text-xl font-bold tracking-tight text-white xs2:text-2xl sm:text-3xl"
      subheader={subheader}
    >
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          shape="pill"
          size="sm"
          aria-label="View mode"
          value={view}
          onChange={setView}
          options={[
            { value: "pick", label: "Pick", tone: "accent" },
            { value: "results", label: "Results", tone: "amber" },
            { value: "attendees", label: "Attendees", tone: "sky" },
          ]}
          className="min-w-0"
        />
        <SegmentedControl
          shape="pill"
          size="sm"
          selectionMode="toggle"
          emphasizeActive
          aria-label="RSVP"
          value={rsvp}
          onChange={setRsvp}
          options={RSVP_OPTIONS}
          className="shrink-0"
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <GameCarousel3D games={previewGames} minPlayers={5} maxPlayers={7} date="" reactions={{}} />
      </div>
    </Modal>
  );
}
