import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { keywordInfo } from "../../logic/keywords";
import HungerIcon from "../HungerIcon";
import { CARD_H, cq, TEXT_ZONE } from "./layout";
import { CardArt, SpeedChip, VpDrop } from "./parts";
import { cardHex, showsSpeed } from "./style";

const INK = "#f7efe6";

/**
 * The in-place card: full art, and in the fixed band it leaves at the bottom
 * the name (on the same line on every card), the keyword icons and — when the
 * card is wide enough to read it — two lines of rules. No type label: the
 * colour says it.
 */
export default function CompactFace({
  card,
  mini = false,
  dim = false,
}: {
  card: string;
  /** Pile thumbnails: art and VP only. */
  mini?: boolean;
  dim?: boolean;
}) {
  const def = cardDef(card);
  const hex = cardHex(def);
  const zoneTop = 1 - TEXT_ZONE.compact;
  const name = def.name.length > 14 ? 8.4 : 9.6;
  return (
    <div className="pointer-events-none absolute inset-0 @container isolate select-none overflow-hidden">
      <CardArt card={card} face="compact" scrimFrom={zoneTop - 0.16} dim={dim} />
      {showsSpeed(def) && !mini && <SpeedChip def={def} scale={1} />}
      <VpDrop def={def} scale={mini ? 1.5 : 1.25} />
      {!mini && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center"
          style={{
            top: `${zoneTop * 100}%`,
            padding: `0 ${cq(6)} ${cq(4)}`,
            gap: cq(1.8),
            color: INK,
          }}
        >
          <span
            className="w-full truncate font-card font-semibold leading-none"
            style={{
              fontSize: cq(name),
              letterSpacing: "-0.01em",
              textShadow: "0 1px 3px rgb(0 0 0 / 0.8)",
              height: cq(CARD_H * 0.075),
              lineHeight: cq(CARD_H * 0.075),
            }}
          >
            {def.name}
          </span>
          {/* A thin rule in the card's colour under the name. */}
          <span
            aria-hidden
            className="shrink-0 rounded-full"
            style={{ width: cq(16), height: cq(0.5), background: `${hex}cc` }}
          />
          {def.keywords.length > 0 && (
            <span className="flex items-center justify-center" style={{ gap: cq(2.4) }}>
              {def.keywords.map((k) => (
                <HungerIcon
                  key={k}
                  name={keywordInfo(k).icon}
                  title={keywordInfo(k).name}
                  fallback={keywordInfo(k).glyph}
                  style={{ width: cq(7), height: cq(7), color: INK }}
                />
              ))}
            </span>
          )}
          {def.text && (
            <p
              className="hidden @min-[8rem]:block"
              style={{ fontSize: cq(5.4), lineHeight: 1.25, color: "rgb(247 239 230 / 0.78)" }}
            >
              <span className="line-clamp-2">{def.text}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
