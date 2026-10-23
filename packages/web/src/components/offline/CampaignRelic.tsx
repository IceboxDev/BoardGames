import "./campaign-night.css";
import { relicUrl } from "../../lib/campaign-relics";

/**
 * A campaign night's relic with the headcount painted into it — the d20's
 * siblings. Sits inside a `[data-campaign]` scope for its glow; the caller
 * sizes it.
 */
export function CampaignRelic({
  slug,
  count,
  className = "",
}: {
  slug: string;
  count: number;
  className?: string;
}) {
  const src = relicUrl(slug, count);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={`campaign-relic block ${className}`}
    />
  );
}
