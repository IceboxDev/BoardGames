import { fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { describe, expect, it, vi } from "vitest";
import { ArrivalTakeoverView } from "./ArrivalTakeoverView";
import type { ArrivalCard } from "./arrival-view-model";

const PLACEHOLDER = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4";
const FACE = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4ABAAAAAwAQCdASoBAAEAAQAcJaQAA3AA";

const card = (
  slug: string,
  title: string,
  purchaser: { id: string; name: string },
  votes: number,
  faces: number,
  withImages = true,
): ArrivalCard => ({
  slug,
  title,
  accentHex: "#d36830",
  purchaser: { ...purchaser, image: null, accentHex: "#22d3ee" },
  votes,
  voters: Array.from({ length: faces }, (_, i) => ({
    image: withImages && i % 2 === 0 ? FACE : null,
    accentHex: i % 3 === 0 ? "#6366f1" : null,
  })),
  photoSrc: `/api/arrivals/a1/photos/${slug}`,
  placeholder: PLACEHOLDER,
  width: 1280,
  height: 1600,
});

const mantas = { id: "u1", name: "Mantas Kandratavičius" };
const paul = { id: "u2", name: "Paul Otto" };
const totals = { voterCount: 7, votesCast: 15 };

function renderView(cards: ArrivalCard[], viewerId: string | null = "u9", reduced = true) {
  const onDismiss = vi.fn();
  const onCta = vi.fn();
  render(
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <ArrivalTakeoverView
        cards={cards}
        totals={totals}
        viewerId={viewerId}
        onDismiss={onDismiss}
        onCta={onCta}
      />
    </MotionConfig>,
  );
  return { onDismiss, onCta };
}

describe("ArrivalTakeoverView", () => {
  it("renders one card per game with its photo, title, purchaser and votes", () => {
    renderView([
      card("arcs", "Arcs", mantas, 6, 6),
      card("wingspan", "Wingspan", paul, 4, 4),
      card("cascadia", "Cascadia", mantas, 2, 2),
    ]);
    expect(
      screen.getByRole("dialog", { name: "Three new games just arrived" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /box$/ })).toHaveLength(3);
    expect(screen.getByText("Arcs")).toBeInTheDocument();
    expect(screen.getByText("Wingspan")).toBeInTheDocument();
    expect(screen.getAllByText("Bought by")).toHaveLength(3);
    expect(screen.getAllByText("Mantas")).toHaveLength(2);
    expect(screen.getByText("Paul")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "6 votes from 6 players" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 votes from 2 players" })).toBeInTheDocument();
  });

  it("names the single game in the title and shows no dots", () => {
    renderView([card("arcs", "Arcs", mantas, 6, 6)]);
    expect(screen.getByRole("dialog", { name: "Arcs just arrived" })).toBeInTheDocument();
    expect(screen.queryByTestId("arrival-dots")).toBeNull();
  });

  it("shows a dot per game on the phone rail and announces the active one", () => {
    renderView([card("arcs", "Arcs", mantas, 6, 6), card("wingspan", "Wingspan", paul, 4, 4)]);
    expect(screen.getByTestId("arrival-dots").children).toHaveLength(2);
    expect(screen.getByText("Game 1 of 2")).toBeInTheDocument();
    const rail = screen.getByTestId("arrival-rail");
    Object.defineProperty(rail, "scrollLeft", { value: 500, configurable: true });
    for (const [i, child] of Array.from(rail.children).entries()) {
      Object.defineProperty(child, "offsetLeft", { value: i * 300, configurable: true });
      Object.defineProperty(child, "offsetWidth", { value: 280, configurable: true });
    }
    fireEvent.scroll(rail);
    expect(screen.getByText("Game 2 of 2")).toBeInTheDocument();
  });

  it("caps the ring at eight faces and shows the overflow count", () => {
    renderView([card("arcs", "Arcs", mantas, 14, 14)]);
    expect(document.body.querySelectorAll("[data-face]")).toHaveLength(9);
    expect(screen.getByText("+6")).toBeInTheDocument();
  });

  it("renders faceless voters as silhouettes, never initials, and hides faces from AT", () => {
    renderView([card("arcs", "Arcs", mantas, 3, 3, false)]);
    const orbit = screen.getByRole("img", { name: "3 votes from 3 players" });
    expect(orbit.querySelectorAll('[data-fallback="silhouette"]')).toHaveLength(3);
    expect(orbit.textContent).toBe("");
    expect(orbit.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("freezes the orbit under reduced motion", () => {
    renderView([card("arcs", "Arcs", mantas, 3, 3)], "u9", true);
    expect(screen.getByRole("img", { name: "3 votes from 3 players" })).toHaveAttribute(
      "data-motion",
      "static",
    );
  });

  it("thanks the purchasers by first name and the voters by count", () => {
    renderView([card("arcs", "Arcs", mantas, 6, 6), card("wingspan", "Wingspan", paul, 4, 4)]);
    expect(screen.getByText("Mantas and Paul")).toBeInTheDocument();
    expect(
      screen.getByText(/for buying them, and to the 7 players whose votes chose them\./),
    ).toBeInTheDocument();
    expect(screen.getByText("votes cast")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("voters")).toBeInTheDocument();
  });

  it("points the CTA at the purchaser's collection and acks both buttons", () => {
    const { onDismiss, onCta } = renderView([card("arcs", "Arcs", mantas, 6, 6)], "u9");
    expect(screen.getByText(/Now in Mantas's collection\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See Mantas's collection/ }));
    expect(onCta).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("speaks to the viewer when they bought the game", () => {
    renderView([card("arcs", "Arcs", mantas, 6, 6)], "u1");
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.getByText(/Now in your collection\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /See your collection/ })).toBeInTheDocument();
  });
});
