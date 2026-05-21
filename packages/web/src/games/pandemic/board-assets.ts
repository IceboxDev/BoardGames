// Asset registry for the Pandemic board. Promoted out of `rendering/` so
// the canvas-era folder can be deleted entirely. Only ships URLs — the
// images themselves are decoded on demand by the browser's image cache as
// individual <img> / <image href> elements reference them.

import type { Role } from "@boardgames/core/games/pandemic/types";
import bgMapUrl from "./assets/img/bg.jpg";
import contingencyPlannerUrl from "./assets/roles/contingency_planner.png";
import dispatcherUrl from "./assets/roles/dispatcher.png";
import medicUrl from "./assets/roles/medic.png";
import operationsExpertUrl from "./assets/roles/operations_expert.png";
import quarantineSpecialistUrl from "./assets/roles/quarantine_specialist.png";
import researcherUrl from "./assets/roles/researcher.png";
import scientistUrl from "./assets/roles/scientist.png";

/**
 * Per-role portrait URL (the actual rendered card uses `<img>` directly,
 * not a canvas atlas). Vite hashes the filename at build time, so this
 * record is the single mapping from `Role` to the cache-busted URL.
 */
export const PORTRAIT_URLS: Record<Role, string> = {
  contingency_planner: contingencyPlannerUrl,
  dispatcher: dispatcherUrl,
  medic: medicUrl,
  operations_expert: operationsExpertUrl,
  quarantine_specialist: quarantineSpecialistUrl,
  researcher: researcherUrl,
  scientist: scientistUrl,
};

/**
 * The map artwork — projected geography, ocean shading, connecting routes
 * the cube/pawn layer draws on top of. 1920×1080. SVG `<image>` references
 * this directly so we never decode it into a canvas pixmap.
 */
export { bgMapUrl };
