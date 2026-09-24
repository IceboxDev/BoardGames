import type { BuildingStatus } from "@boardgames/core/games/quiztopia/types";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/cn";
import { DISTRICTS } from "../../bands";
import BuildingCard from "./BuildingCard";

// The buildings still in the middle, standing on a ground line. The active
// seat picks one in `choose-building`: click, or ←/→ to move the roving
// focus and Enter/Space to pick. Phones get a 4-column grid, wide screens a
// centred flex row so a shrinking city keeps its shape.

type Props = {
  buildings: readonly BuildingStatus[];
  /** Highlighted building (this turn's question). */
  activeIndex: number | null;
  canChoose: boolean;
  onChoose: (buildingIndex: number) => void;
  /** Buildings the seat may currently pick (from the legal actions). */
  choosable: ReadonlySet<number>;
  lang: "en" | "de";
  className?: string;
};

export default function CityRow({
  buildings,
  activeIndex,
  canChoose,
  onChoose,
  choosable,
  lang,
  className,
}: Props) {
  const inMiddle = DISTRICTS.filter((d) => {
    const s = buildings[d.index];
    return s === "dark" || s === "bright";
  });
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the roving focus on a card that still exists.
  useEffect(() => {
    if (focusIndex >= inMiddle.length) setFocusIndex(Math.max(0, inMiddle.length - 1));
  }, [focusIndex, inMiddle.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    if (!canChoose || inMiddle.length === 0) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    let next = focusIndex;
    if (e.key === "ArrowLeft") next = (focusIndex - 1 + inMiddle.length) % inMiddle.length;
    if (e.key === "ArrowRight") next = (focusIndex + 1) % inMiddle.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = inMiddle.length - 1;
    setFocusIndex(next);
    refs.current[next]?.focus();
  };

  return (
    <fieldset
      data-city-row=""
      className={cn("relative flex min-w-0 flex-col border-0 p-0", className)}
      onKeyDown={onKeyDown}
      aria-label={canChoose ? "Pick a building" : "Buildings in the middle"}
    >
      {/* night sky behind the city — a faint glow rising from the ground line */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fill-soft to-transparent"
      />
      <div className="relative grid grid-cols-4 items-end gap-2 px-1 pb-2 sm:grid-cols-6 lg:grid-cols-12">
        {inMiddle.map((d, i) => {
          const status = buildings[d.index];
          const selectable = canChoose && choosable.has(d.index);
          return (
            <div key={d.slug} className="w-full">
              <BuildingCard
                ref={(el) => {
                  refs.current[i] = el;
                }}
                district={d}
                status={status}
                size="city"
                lang={lang}
                layoutId={`qz-building-${d.index}`}
                selectable={selectable}
                selected={activeIndex === d.index}
                tabIndex={selectable ? (i === focusIndex ? 0 : -1) : undefined}
                onSelect={() => {
                  setFocusIndex(i);
                  onChoose(d.index);
                }}
              />
            </div>
          );
        })}
        {inMiddle.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-fg-muted">
            No buildings left in the middle.
          </p>
        )}
      </div>
      <div aria-hidden="true" className="h-0.5 w-full rounded-full bg-line-strong" />
    </fieldset>
  );
}
