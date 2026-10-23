import { CENTURIES } from "./centuries.ts";
import { DECADES_BC } from "./decades-bc.ts";
import { DECADES_MEDIEVAL } from "./decades-medieval.ts";
import { DECADES_MODERN } from "./decades-modern.ts";
import { MILLENNIA } from "./millennia.ts";
import type { BlockName } from "./types.ts";

// The timeline blocks' hand-written names, keyed by block id (see
// `../timeline-blocks.ts` for the id scheme). Every millennium, century and
// decade that holds a content event has one — `timeline-names.test.ts`
// fails when new content lands in a block without. Years and months are
// named by their date alone; ages and periods carry their names in
// `timeline-blocks.ts`.

export type { BlockName } from "./types.ts";

const ALL: ReadonlyMap<string, BlockName> = new Map(
  Object.entries({
    ...MILLENNIA,
    ...CENTURIES,
    ...DECADES_BC,
    ...DECADES_MEDIEVAL,
    ...DECADES_MODERN,
  }),
);

export function blockName(id: string): BlockName | null {
  return ALL.get(id) ?? null;
}

/** Every named block id with its name, for the coverage test. */
export function namedBlocks(): ReadonlyMap<string, BlockName> {
  return ALL;
}
