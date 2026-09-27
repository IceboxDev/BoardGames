import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import type { ReactNode } from "react";
import { Eyebrow } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { artUrl } from "../logic/art";

/**
 * A Mission tile on its parchment: beige for a standard Mission, gilded for
 * an Instant. The frame is drawn as a border image so its corners stay crisp
 * at any tile size; the text is dark ink on the paper.
 */
export default function MissionTile({
  id,
  badge,
  size = "md",
  className,
}: {
  id: string;
  badge?: string;
  /** `lg`: the tile as the one thing on screen (a Mission pick). */
  size?: "md" | "lg";
  className?: string;
}) {
  const lg = size === "lg";
  const def = missionDef(id);
  const instant = Boolean(def.instant);
  const frame = artUrl(instant ? "mission-frame-instant" : "mission-frame-standard");
  if (!frame) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 rounded-card-lg border px-3 py-2",
          instant
            ? "border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-amber-900/10"
            : "border-line bg-gradient-to-br from-fill-strong to-fill",
          className,
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className={cn("font-semibold", instant ? "text-amber-200" : "text-fg-strong")}>
            {def.name}
          </span>
          {instant && <span className="text-3xs uppercase text-amber-300/80">Instant</span>}
          {badge && <span className="ml-auto text-3xs text-fg-muted">{badge}</span>}
        </div>
        <p className="text-2xs leading-snug text-fg-secondary">{def.text}</p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col shadow-lg",
        lg
          ? "min-h-40 items-center justify-center gap-2 px-4 py-3 text-center"
          : "gap-1 px-2 pb-1.5 pt-1",
        className,
      )}
      style={{
        borderStyle: "solid",
        borderWidth: lg ? "22px" : "14px",
        borderImage: `url(${frame}) 72 fill / ${lg ? 22 : 14}px stretch`,
        color: "#2a1f1a",
      }}
    >
      <div className={cn("flex items-baseline gap-2", lg && "flex-col items-center gap-0.5")}>
        {instant && (
          <span
            className={cn(
              "font-card font-semibold uppercase",
              lg ? "text-2xs tracking-eyebrow" : "text-3xs",
            )}
            style={{ color: "#8a5a0b" }}
          >
            Instant
          </span>
        )}
        <span className={cn("font-card font-semibold", lg ? "text-2xl leading-tight" : "text-sm")}>
          {def.name}
        </span>
        {badge && (
          <span className={cn("text-3xs", !lg && "ml-auto")} style={{ color: "#6b5a48" }}>
            {badge}
          </span>
        )}
      </div>
      <p className={cn("leading-snug", lg ? "text-sm" : "text-2xs")} style={{ color: "#3d3128" }}>
        {def.text}
      </p>
    </div>
  );
}

/** A Missions panel heading, led by the sealed Mission-back scroll once it exists. */
export function MissionsHeading({ children }: { children: ReactNode }) {
  const scroll = artUrl("mission-back");
  return (
    <div className="flex items-center gap-2">
      {scroll && <img src={scroll} alt="" aria-hidden draggable={false} className="h-7 w-7" />}
      <Eyebrow size="sm">{children}</Eyebrow>
    </div>
  );
}
