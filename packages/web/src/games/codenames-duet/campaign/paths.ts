// The campaign's URLs, all under the Duet game's solo routes
// (`/play/codenames-duet/solo/*`, `Duet.tsx`), so the game shell — its
// background, socket and rooms — stays around them.

export const CAMPAIGN_BASE = "/play/codenames-duet/solo/campaign";

export function campaignPath(id: string): string {
  return `${CAMPAIGN_BASE}/${encodeURIComponent(id)}`;
}

/** A mission against the AI partner; `ai` is the partner's tier. */
export function missionPlayPath(id: string, city: string, ai: string): string {
  return `${campaignPath(id)}/play/${city}?ai=${encodeURIComponent(ai)}`;
}
