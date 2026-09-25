import { geoCatalog } from "@boardgames/core/trainers/geography/deck";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { todayKey } from "../../games/quiztopia/api";
import { qk } from "../../lib/query-keys";
import { overviewQuery } from "./api";
import { loadWorld } from "./globe/world";

// What every geography screen needs: the deck (bundled with this route),
// the globe geometry (a lazy chunk, fetched once) and the member's overview.

export const GEO_BASE = "/trainer/geography";
export const geoPaths = {
  hub: GEO_BASE,
  study: `${GEO_BASE}/study`,
  /** A sitting with one chosen new group (null: continue and review only). */
  studyGroup: (group: string | null) =>
    `${GEO_BASE}/study?group=${encodeURIComponent(group ?? "none")}`,
  drill: (continent: string) => `${GEO_BASE}/study?drill=${continent}`,
  explore: `${GEO_BASE}/explore`,
};

export function useCatalog() {
  return useMemo(() => geoCatalog(), []);
}

export function useWorld() {
  return useQuery({
    queryKey: ["geography", "world"],
    queryFn: loadWorld,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useToday(): string {
  return useMemo(() => todayKey(), []);
}

export function useGeoOverview(today: string) {
  return useQuery({
    queryKey: qk.geographyOverview(today),
    queryFn: overviewQuery(today),
    staleTime: 30_000,
  });
}
