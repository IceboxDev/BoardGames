import { useState } from "react";
import {
  PurchaseVoteAnnounceModal,
  PurchaseVoteReminderModal,
} from "../components/purchase-vote/PurchaseVoteGreetingCards";
import { PurchaseVoteModalView } from "../components/purchase-vote/PurchaseVoteModal";
import { PurchaseVoteResultModal } from "../components/purchase-vote/PurchaseVoteResultModal";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { games } from "../games/registry";

// Dev-only visual preview of every purchase-vote surface — the announce and
// reminder greeting cards, the voting screen (with live local pick state),
// the saved confirmation, and the winner reveal — with static data and no
// auth/queries, so phone-size regressions can be reproduced headlessly at
// any viewport. Mirrors RsvpPreview (incl. the ?frame=WxH iframe trick).
// Route: /dev/vote-preview.

const CANDIDATE_SLUGS = [
  "dune-imperium-uprising",
  "heat-pedal-to-the-metal",
  "arcs",
  "hegemony-lead-your-class-to-victory",
  "container",
  "bomb-busters",
  "vantage",
  "wingspan",
  "concordia-special-edition",
  "spirit-island",
];

const RESULT_TALLY = [
  { slug: "wingspan", votes: 6 },
  { slug: "arcs", votes: 5 },
  { slug: "spirit-island", votes: 4 },
  { slug: "dune-imperium-uprising", votes: 3 },
  { slug: "bomb-busters", votes: 2 },
  { slug: "heat-pedal-to-the-metal", votes: 1 },
  { slug: "hegemony-lead-your-class-to-victory", votes: 0 },
  { slug: "container", votes: 0 },
  { slug: "vantage", votes: 0 },
  { slug: "concordia-special-edition", votes: 0 },
];

const VIEWS = ["announce", "reminder", "voting", "saved", "reveal"] as const;
type View = (typeof VIEWS)[number];

export default function VotePreview() {
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    return VIEWS.includes(v as View) ? (v as View) : "announce";
  });
  const [selected, setSelected] = useState<string[]>(["arcs"]);

  const frame = new URLSearchParams(window.location.search).get("frame");
  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    const inner = new URLSearchParams(window.location.search);
    inner.delete("frame");
    const qs = inner.toString();
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + (qs ? `?${qs}` : "")}
        style={{ width: w || 360, height: h || 644, border: "1px solid #333" }}
      />
    );
  }

  const candidates = CANDIDATE_SLUGS.map((slug) => games.find((g) => g.slug === slug)).filter(
    (g) => g !== undefined,
  );
  const noop = () => {};

  return (
    <>
      <div className="fixed left-1/2 top-2 z-takeover -translate-x-1/2">
        <SegmentedControl
          shape="pill"
          size="sm"
          aria-label="Preview variant"
          value={view}
          onChange={setView}
          options={[
            { value: "announce", label: "Announce" },
            { value: "reminder", label: "Reminder" },
            { value: "voting", label: "Voting" },
            { value: "saved", label: "Saved" },
            { value: "reveal", label: "Reveal" },
          ]}
        />
      </div>
      {view === "announce" && (
        <PurchaseVoteAnnounceModal
          greeting={{
            kind: "purchase-vote-announce",
            pollId: 1,
            candidates: CANDIDATE_SLUGS,
            voterCount: 0,
            requiredVoters: 8,
          }}
          onDismiss={noop}
          onCta={noop}
        />
      )}
      {view === "reminder" && (
        <PurchaseVoteReminderModal
          greeting={{
            kind: "purchase-vote-reminder",
            pollId: 1,
            votesLeft: 2,
            voterCount: 4,
            requiredVoters: 8,
          }}
          onDismiss={noop}
          onCta={noop}
        />
      )}
      {(view === "voting" || view === "saved") && (
        <PurchaseVoteModalView
          candidates={candidates}
          selected={view === "saved" ? ["arcs", "wingspan", "spirit-island"] : selected}
          savedVotes={view === "saved" ? ["arcs", "wingspan", "spirit-island"] : []}
          voterCount={4}
          requiredVoters={8}
          view={view === "saved" ? "saved" : "picking"}
          pollClosed={false}
          saving={false}
          error={null}
          onToggle={(slug) =>
            setSelected((prev) =>
              prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
            )
          }
          onSubmit={noop}
          onClose={noop}
        />
      )}
      {view === "reveal" && (
        <PurchaseVoteResultModal
          winnerSlug="wingspan"
          tally={RESULT_TALLY}
          onDismiss={noop}
          onCta={noop}
        />
      )}
    </>
  );
}
