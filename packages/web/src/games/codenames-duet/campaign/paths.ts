// The campaign's URLs, all under the Duet game's solo routes
// (`/play/codenames-duet/solo/*`, `Duet.tsx`), so the game shell — its
// background, socket and rooms — stays around them.
//
//   solo                         Singleplayer: your campaigns with the AI partner
//   solo/free                    a quick game outside any campaign
//   solo/campaign/:id            a campaign's Mission Desk
//   solo/campaign/:id/play/:city a mission against the AI partner
//   solo/companion               Companion: campaigns played with the real cards
//   solo/companion/:id           the Mission Desk, at the table
//   solo/companion/:id/table/:city  the live tracker for a mission at the table
//   solo/companion/free          the tracker for a game outside any campaign

const SOLO = "/play/codenames-duet/solo";

export const CAMPAIGN_BASE = SOLO;
export const FREE_GAME_PATH = `${SOLO}/free`;
export const COMPANION_BASE = `${SOLO}/companion`;
export const COMPANION_FREE_PATH = `${COMPANION_BASE}/free`;

export type DeskMode = "play" | "table";

export function campaignPath(id: string, mode: DeskMode = "play"): string {
  return `${mode === "table" ? COMPANION_BASE : `${SOLO}/campaign`}/${encodeURIComponent(id)}`;
}

/** A mission against the AI partner; `ai` is the partner's tier. */
export function missionPlayPath(id: string, city: string, ai: string): string {
  return `${campaignPath(id)}/play/${city}?ai=${encodeURIComponent(ai)}`;
}

/** The live tracker for a mission played with the physical game. */
export function tablePlayPath(id: string, city: string): string {
  return `${campaignPath(id, "table")}/table/${city}`;
}
