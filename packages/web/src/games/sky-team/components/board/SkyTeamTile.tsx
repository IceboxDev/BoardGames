import type { DieValue, PlayerIndex } from "@boardgames/core/games/sky-team/types";
import type { ReactNode } from "react";
import DieFace from "./DieFace";

export type TileVariant = "pilot" | "copilot" | "mixed";

export { tileValueLabel } from "./tile-label";

interface Props {
  variant: TileVariant;
  /** Static label rendered when no die is placed (e.g. "1/2", "Engine"). */
  label?: ReactNode;
  /** When provided, replaces the label with a placed-die chip. */
  placedDie?: {
    color: "blue" | "orange";
    value: DieValue;
    owner?: PlayerIndex;
    /** +/- delta from a coffee adjustment, surfaced as a small badge. */
    coffeeAdjust?: number;
  } | null;
  /** Pulse with the legal-target ring when truthy. */
  selectable?: boolean;
  /** Make the tile act as a button when an onSelect is provided. */
  onSelect?: () => void;
  /** Optional SVG/icon to render inside the tile (used by mixed-coffee tiles). */
  children?: ReactNode;
  /** Extra class(es) appended to the tile (e.g. a thick-border modifier). */
  className?: string;
  "aria-label"?: string;
}

/**
 * One Sky Team control-panel tile — pilot navy, copilot orange, or mixed
 * 50/50 — with optional switch indicator and placed-die chip. Matches
 * `sky-team-lab/board.css` `.tile` 1:1 (same gradients, shadows, ink colors).
 *
 * Sizing comes from the surrounding `.cockpit-tile-shell` container; the tile
 * always fills it 100% × 100% and uses `cqi` units internally so chrome
 * scales with the board.
 */
export default function SkyTeamTile({
  variant,
  label,
  placedDie,
  selectable,
  onSelect,
  children,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const classes = [
    "cockpit-tile",
    `cockpit-tile--${variant}`,
    onSelect ? "cockpit-tile--interactive" : "",
    selectable ? "cockpit-tile--selectable" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {placedDie ? (
        <span className={`cockpit-placed-die cockpit-placed-die--${placedDie.color}`}>
          <DieFace color={placedDie.color} value={placedDie.value} />
          {placedDie.coffeeAdjust != null && placedDie.coffeeAdjust !== 0 ? (
            // Small mug-tinted badge in the upper-right corner so the
            // round-review viewer can see at a glance that a coffee token
            // bumped this die up or down. `paintOrder: "stroke"` keeps the
            // dark outline behind the digit even at small sizes.
            <span
              className="cockpit-placed-die__coffee"
              role="img"
              aria-label={`coffee adjust ${placedDie.coffeeAdjust > 0 ? "+" : ""}${placedDie.coffeeAdjust}`}
            >
              {placedDie.coffeeAdjust > 0 ? "+" : ""}
              {placedDie.coffeeAdjust}
            </span>
          ) : null}
        </span>
      ) : (
        label
      )}
      {placedDie ? null : children}
    </>
  );

  if (onSelect) {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: game-piece tile carries its own gradient/shadow/ink chrome; <Button> would override them.
      <button
        type="button"
        className={classes}
        onClick={onSelect}
        aria-label={ariaLabel}
        aria-pressed={placedDie != null}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes} role="img" aria-label={ariaLabel}>
      {content}
    </span>
  );
}
