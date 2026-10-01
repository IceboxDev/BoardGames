import type { PurchaseVoteAnnounceGreeting } from "@boardgames/core/protocol";
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { describe, expect, it, vi } from "vitest";
import type { ArrivalCard } from "../arrivals/arrival-view-model";
import { PurchaseTakeover } from "./PurchaseTakeover";
import type { PurchaseVotePaneProps } from "./vote-session";

const PLACEHOLDER = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4";

const card = (slug: string, title: string): ArrivalCard => ({
  slug,
  title,
  accentHex: "#d36830",
  purchaser: { id: "u1", name: "Mantas Kandratavičius", image: null, accentHex: null },
  votes: 4,
  voters: [],
  photoSrc: `/api/arrivals/a1/photos/${slug}`,
  placeholder: PLACEHOLDER,
  width: 1280,
  height: 1600,
});

const vote: PurchaseVoteAnnounceGreeting = {
  kind: "purchase-vote-announce",
  pollId: 2,
  title: "The October vote: games for the whole table",
  blurb: "Every contender seats eight or more.",
  candidates: ["telestrations", "two-rooms-and-a-boom"],
  voterCount: 1,
  requiredVoters: 10,
};

const ballot = (onSubmit = vi.fn()): PurchaseVotePaneProps => ({
  candidates: [],
  selected: [],
  savedVotes: [],
  voterCount: 1,
  requiredVoters: 10,
  view: "picking",
  pollClosed: false,
  saving: false,
  error: null,
  onToggle: vi.fn(),
  onSubmit,
  onClose: vi.fn(),
});

function renderTakeover(withArrival = true) {
  const onClose = vi.fn();
  const onArrivalCta = vi.fn();
  render(
    <MotionConfig reducedMotion="always">
      <PurchaseTakeover
        arrival={
          withArrival
            ? {
                cards: [card("bomb-busters", "Bomb Busters")],
                totals: { voterCount: 10, votesCast: 30 },
              }
            : undefined
        }
        vote={vote}
        viewerId="u9"
        onClose={onClose}
        onArrivalCta={onArrivalCta}
        ballot={ballot()}
      />
    </MotionConfig>,
  );
  return { onClose, onArrivalCta };
}

describe("PurchaseTakeover", () => {
  it("opens on the shelf and closing there acks both as later", () => {
    const { onClose } = renderTakeover();
    expect(screen.getByRole("heading", { name: "Bomb Busters just arrived" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onClose).toHaveBeenCalledWith({ arrival: "later", vote: "later" });
  });

  it("pages from the shelf to the themed vote, then to the ballot", () => {
    const { onClose } = renderTakeover();
    fireEvent.click(screen.getByRole("button", { name: /Next: The October vote/ }));
    expect(screen.getByRole("heading", { name: "The October vote" })).toBeTruthy();
    expect(screen.getByText("Games for the whole table")).toBeTruthy();
    expect(screen.getByText("Every contender seats eight or more.")).toBeTruthy();
    expect(screen.getByText("Telestrations")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cast my 3 votes/ }));
    expect(screen.getByRole("button", { name: "Submit votes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "The October vote" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement);
    expect(onClose).toHaveBeenCalledWith({ arrival: "cta", vote: "cta" });
  });

  it("announces the vote alone when there is no arrival", () => {
    const { onClose } = renderTakeover(false);
    expect(screen.getByRole("heading", { name: "The October vote" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement);
    expect(onClose).toHaveBeenCalledWith({ arrival: "later", vote: "later" });
  });
});
