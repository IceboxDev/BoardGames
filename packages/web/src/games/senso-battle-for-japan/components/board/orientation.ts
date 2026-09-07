import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import type { MapOrientation } from "./geometry";

/** Below `sm` the map turns portrait: the west→east chain runs top→bottom. */
export const LANDSCAPE_QUERY = "(min-width: 40rem)";

export function useMapOrientation(forced?: MapOrientation): MapOrientation {
  const wide = useMediaQuery(LANDSCAPE_QUERY);
  return forced ?? (wide ? "landscape" : "portrait");
}
