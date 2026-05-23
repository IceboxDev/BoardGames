import { useState } from "react";
import type { FamilyInfo } from "../games/families";
import type { GameDefinition } from "../games/types";
import { compactSummary } from "../lib/bgg-format";
import {
  BggMeta,
  ComingSoonBadge,
  GameCardBody,
  GameCardChrome,
  GameCardDescription,
  GameCardMeta,
  GameCardThumb,
  VariantStrip,
  VariantsBadge,
} from "./game";

type Props = {
  family: FamilyInfo;
  visibleMembers: GameDefinition[];
  index?: number;
  showComingSoon?: boolean;
};

/**
 * Online-gallery counterpart of `FamilyCarouselCard`: one card per family,
 * with the same disc-thumbnail switcher straddling the left edge. The
 * active variant drives the title, thumbnail, summary, BGG meta, and the
 * play destination — clicking the card body navigates to
 * `/play/<activeSlug>` if the variant has a playable component, otherwise
 * the card is non-link and shows the "Coming soon" badge.
 */
export default function OnlineFamilyCard({
  family,
  visibleMembers,
  index = 0,
  showComingSoon = true,
}: Props) {
  const initialSlug =
    visibleMembers.find((m) => m === family.canonical)?.slug ?? visibleMembers[0]?.slug;
  const [activeSlug, setActiveSlug] = useState<string>(initialSlug);
  const active = visibleMembers.find((m) => m.slug === activeSlug) ?? visibleMembers[0];
  const href = active.kind === "playable" ? `/play/${active.slug}` : undefined;
  const summary = compactSummary(active.bgg);

  return (
    <GameCardChrome
      accentHex={active.accentHex}
      index={index}
      as={href ? { kind: "link", to: href } : { kind: "div" }}
      overlay={
        // Variant rim discs — straddling the LEFT BORDER of the thumbnail
        // area, mirroring the offline carousel's switcher. Sits OUTSIDE
        // the overflow-hidden card frame; the absolute overlay matches
        // the thumbnail's 16:9 box so flex-center aligns the strip on its
        // midline.
        <div className="pointer-events-none absolute left-0 top-0 z-20 aspect-[16/9] w-full">
          <div className="flex h-full items-center">
            <div className="-translate-x-3.5 pointer-events-auto">
              <VariantStrip
                members={visibleMembers}
                activeSlug={active.slug}
                onPick={setActiveSlug}
              />
            </div>
          </div>
        </div>
      }
    >
      <GameCardThumb
        src={active.thumbnail}
        badgeTopLeft={showComingSoon && active.kind === "catalog" ? <ComingSoonBadge /> : undefined}
        badgeTopRight={
          <VariantsBadge
            count={visibleMembers.length}
            accentHex={family.canonical.accentHex}
            tight
          />
        }
      />
      <GameCardBody title={active.title} affordance={href ? "arrow" : null}>
        <GameCardMeta>
          {family.displayName} · {active.family?.variant ?? "Variant"}
        </GameCardMeta>
        {summary && <GameCardMeta>{summary}</GameCardMeta>}
        <GameCardDescription descriptions={active.descriptions} />
        <BggMeta bgg={active.bgg} />
      </GameCardBody>
    </GameCardChrome>
  );
}
