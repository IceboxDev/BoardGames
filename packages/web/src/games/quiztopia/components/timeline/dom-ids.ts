// Shared geometry + DOM ids of the timeline river (scroll targets for
// `?q=`, prev / next and the era rail).

/** The dot sits this far below its card's top edge, px. */
export const DOT_OFFSET = 14;

/** DOM id of a pin's card. */
export function pinDomId(questionId: string): string {
  return `tl-${questionId}`;
}

/** DOM id of an era's band. */
export function eraDomId(eraId: string): string {
  return `tl-era-${eraId}`;
}
