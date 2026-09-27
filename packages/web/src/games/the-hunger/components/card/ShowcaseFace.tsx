import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import type { CardDef } from "@boardgames/core/games/the-hunger/types";
import { kindIcon } from "../../logic/art";
import { keywordInfo } from "../../logic/keywords";
import HungerIcon from "../HungerIcon";
import { cq, TEXT_ZONE } from "./layout";
import { CardArt, SpeedChip, VpDrop } from "./parts";
import { cardHex, GLASS, showsSpeed } from "./style";

const INK = "#f7efe6";

function eyebrow(def: CardDef): string {
  if (def.type === "human" && def.category) return `${def.category} Human`;
  if (def.type === "starting") return "Starting card";
  if (def.type === "item") return "Rose · Item";
  return def.type;
}

/**
 * The card you're inspecting, large: the art over the whole card, and on a
 * scrim at its foot the kind, the name, every keyword spelled out as a chip,
 * the rules, and a line on what each keyword does — nothing left to decode.
 */
export default function ShowcaseFace({ card }: { card: string }) {
  const def = cardDef(card);
  const hex = cardHex(def);
  const keywords = def.keywords.map(keywordInfo);
  return (
    <div className="pointer-events-none absolute inset-0 @container isolate select-none overflow-hidden">
      <CardArt card={card} face="showcase" scrimFrom={1 - TEXT_ZONE.showcase - 0.08} />
      {showsSpeed(def) && <SpeedChip def={def} scale={0.85} caption />}
      <VpDrop def={def} scale={0.85} caption />

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center"
        style={{ padding: `0 ${cq(7)} ${cq(6)}`, gap: cq(2.4), color: INK }}
      >
        <span
          className="flex items-center font-card font-semibold uppercase"
          style={{ fontSize: cq(3), letterSpacing: "0.22em", color: hex, gap: cq(1.5) }}
        >
          <HungerIcon name={kindIcon(card)} style={{ width: cq(3.6), height: cq(3.6) }} />
          {eyebrow(def)}
        </span>
        <span
          className="font-card font-semibold leading-none"
          style={{
            fontSize: cq(def.name.length > 16 ? 8.5 : 10),
            letterSpacing: "-0.02em",
            textShadow: "0 2px 10px rgb(0 0 0 / 0.7)",
          }}
        >
          {def.name}
        </span>

        {keywords.length > 0 && (
          <span className="flex flex-wrap justify-center" style={{ gap: cq(1.6) }}>
            {keywords.map((k) => (
              <span
                key={k.id}
                className="flex items-center rounded-full font-card font-medium"
                style={{
                  ...GLASS,
                  gap: cq(1.4),
                  padding: `${cq(1)} ${cq(2.6)} ${cq(1)} ${cq(1.8)}`,
                  fontSize: cq(3.6),
                }}
              >
                <HungerIcon
                  name={k.icon}
                  fallback={k.glyph}
                  style={{ width: cq(4.4), height: cq(4.4), color: INK }}
                />
                {k.name}
              </span>
            ))}
          </span>
        )}

        {def.text && (
          <p
            style={{
              fontSize: cq(4.3),
              lineHeight: 1.4,
              color: "rgb(247 239 230 / 0.92)",
              maxWidth: "92%",
            }}
          >
            {def.text}
          </p>
        )}

        {keywords.length > 0 && (
          <dl
            className="flex w-full flex-col text-left"
            style={{
              gap: cq(1),
              marginTop: cq(0.6),
              paddingTop: cq(2.2),
              borderTop: `1px solid ${hex}40`,
              fontSize: cq(3.1),
              lineHeight: 1.35,
              color: "rgb(247 239 230 / 0.66)",
            }}
          >
            {keywords.map((k) => (
              <div key={k.id}>
                <dt className="inline font-semibold" style={{ color: INK }}>
                  {k.name}
                </dt>
                <dd className="inline"> — {k.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
