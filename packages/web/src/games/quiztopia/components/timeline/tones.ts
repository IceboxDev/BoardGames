import type { BandTone } from "../../bands";

// The timeline's district inks. A pin is band-coloured (the card's pink /
// blue / sand → rose / sky / amber), solid when the answer is known and a
// hollow ring while it is still being learned; an interval is a translucent
// bar in the gutter. Palette classes (not raw colours), so the theme engine
// reaches them like every other band surface.

export const DOT_FILL: Record<BandTone, string> = {
  rose: "border-rose-400 bg-rose-400",
  sky: "border-sky-400 bg-sky-400",
  amber: "border-amber-400 bg-amber-400",
};

export const DOT_RING: Record<BandTone, string> = {
  rose: "border-rose-400 bg-surface-950",
  sky: "border-sky-400 bg-surface-950",
  amber: "border-amber-400 bg-surface-950",
};

export const BAR: Record<BandTone, string> = {
  rose: "bg-rose-400/45",
  sky: "bg-sky-400/45",
  amber: "bg-amber-400/45",
};

export const BAR_ACTIVE: Record<BandTone, string> = {
  rose: "bg-rose-300",
  sky: "bg-sky-300",
  amber: "bg-amber-300",
};

export const CARD_EDGE: Record<BandTone, string> = {
  rose: "border-l-rose-400",
  sky: "border-l-sky-400",
  amber: "border-l-amber-400",
};

export const DATE_INK: Record<BandTone, string> = {
  rose: "text-rose-300",
  sky: "text-sky-300",
  amber: "text-amber-300",
};
