import { DND_SLUG } from "@boardgames/core/ical/dnd";

// Dungeons & Dragons is one of the campaign nights (core `ical/campaign.ts`
// owns the trigger and the list); its slug stays canonical in core
// (`ical/dnd.ts`), shared so the calendar feed and the web never disagree.

/** Catalog slug for the Dungeons & Dragons entry (homebrew, BGG id 0). */
export { DND_SLUG };
