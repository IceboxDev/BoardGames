import type { Clan, NinjaId } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_SHORT } from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  ACE_HALO_FALLBACK,
  CARD_HAIRLINE,
  CARD_INK,
  CARD_PAPER,
  CLAN_FILL,
  CLAN_INDEX_INK,
  CLAN_INK,
  GOLD_LEAF,
  NINJA_FILL,
  SEAL_RED,
} from "../../../colors";
import { cq } from "../card-layout";

// What each block draws until its art exists. Every glyph here is in the
// 12-code-point "Senso Kanji" subset (武田上杉織田毛利 忍 木玉 戦); never add
// one without regenerating `assets/kanji-subset.woff2`.

/** The clan's short mark in a clan-fill roundel. */
export function CrestFallback({ clan, units }: { clan: Clan; units: number }) {
  const mori = clan === "mori";
  return (
    <span
      className="flex h-full w-full items-center justify-center rounded-full font-bold leading-none"
      style={{
        background: CLAN_FILL[clan],
        color: CLAN_INK[clan],
        fontSize: cq(units * 0.5),
        boxShadow: mori ? `inset 0 0 0 ${cq(Math.max(2, units * 0.05))} ${CARD_INK}` : undefined,
      }}
    >
      {CLAN_SHORT[clan]}
    </span>
  );
}

/** The clan name written down the ribbon. */
export function KanjiFallback({ text, units }: { text: string; units: number }) {
  return (
    <span
      className="font-bold leading-none"
      style={{ writingMode: "vertical-rl", fontSize: cq(units), color: CARD_INK }}
    >
      {text}
    </span>
  );
}

/** A court card without its figure: the rank letter, large, in the clan's ink. */
export function CourtFallback({ clan, glyph }: { clan: Clan; glyph: string }) {
  return (
    <span
      className="flex h-full w-full items-end justify-center font-black leading-none"
      style={{ color: CLAN_INDEX_INK[clan], fontSize: cq(170), paddingBottom: cq(8) }}
    >
      {glyph}
    </span>
  );
}

export function HaloFallback() {
  return <span className="block h-full w-full" style={{ background: ACE_HALO_FALLBACK }} />;
}

export function NinjaFallback({ card }: { card: NinjaId }) {
  return (
    <span
      className="flex h-full w-full items-center justify-center font-bold leading-none"
      style={{ color: NINJA_FILL[card], fontSize: cq(230) }}
    >
      忍
    </span>
  );
}

/** A plain vermilion stamp (勢 is outside the kanji subset). */
export function SealFallback() {
  return (
    <span
      className="block h-full w-full rounded-ui-md"
      style={{
        background: SEAL_RED,
        boxShadow: `inset 0 0 0 ${cq(5)} ${SEAL_RED}, inset 0 0 0 ${cq(8)} ${CARD_PAPER}`,
        opacity: 0.92,
      }}
    />
  );
}

/** The back's ringed 戦, as the deck always drew it. */
export function EmblemFallback() {
  return (
    <span
      className="flex h-full w-full items-center justify-center rounded-full font-bold leading-none"
      style={{
        color: GOLD_LEAF,
        fontSize: cq(110),
        boxShadow: `inset 0 0 0 ${cq(5)} ${GOLD_LEAF}, inset 0 0 0 ${cq(9)} transparent, inset 0 0 0 ${cq(11)} ${CARD_HAIRLINE}`,
      }}
    >
      戦
    </span>
  );
}
