// Shared geometry + DOM ids of the timeline river (scroll targets for
// `?q=`, prev / next and the block rail).

/** The dot sits this far below its card's top edge, px. */
export const DOT_OFFSET = 14;

/** DOM id of a pin's card. */
export function pinDomId(questionId: string): string {
  return `tl-${questionId}`;
}

/** DOM id of a block's band (`mil:1000` → `tl-block-mil-1000`). */
export function blockDomId(blockId: string): string {
  return `tl-block-${blockId.replace(/:/g, "-")}`;
}
