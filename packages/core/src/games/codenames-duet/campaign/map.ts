/**
 * The Duet mission map (rulebook p. 9 and the printed campaign sheet): 26
 * cities, each a mission written "timer tokens – mistakes", joined by routes.
 * You start in Prague, the standard game; a won mission lets you take any
 * mission connected to one you have completed. Geometry (where a city is
 * drawn) belongs to the web map, not here.
 */

import { z } from "zod";

export const CITY_IDS = [
  "prague",
  "berlin",
  "london",
  "paris",
  "madrid",
  "monte-carlo",
  "vatican-city",
  "montreal",
  "washington",
  "los-alamos",
  "moscow",
  "yakutsk",
  "tokyo",
  "shanghai",
  "hong-kong",
  "bangkok",
  "singapore",
  "sydney",
  "cape-town",
  "cairo",
  "baghdad",
  "dubai",
  "mumbai",
  "casablanca",
  "bogota",
  "rio-de-janeiro",
] as const;

export type CityId = (typeof CITY_IDS)[number];
export const CityIdSchema = z.enum(CITY_IDS);

export interface City {
  readonly id: CityId;
  readonly name: string;
  /** Timer tokens: the turns the pair has. */
  readonly tokens: number;
  /** How many of those tokens start bystander side up: the free mistakes. */
  readonly mistakes: number;
}

const city = (id: CityId, name: string, tokens: number, mistakes: number): City => ({
  id,
  name,
  tokens,
  mistakes,
});

export const CITIES: Readonly<Record<CityId, City>> = {
  prague: city("prague", "Prague", 9, 9),
  berlin: city("berlin", "Berlin", 11, 2),
  london: city("london", "London", 10, 2),
  paris: city("paris", "Paris", 11, 0),
  madrid: city("madrid", "Madrid", 10, 0),
  "monte-carlo": city("monte-carlo", "Monte Carlo", 9, 0),
  "vatican-city": city("vatican-city", "Vatican City", 8, 0),
  montreal: city("montreal", "Montreal", 9, 2),
  washington: city("washington", "Washington, D.C.", 7, 2),
  "los-alamos": city("los-alamos", "Los Alamos", 8, 2),
  moscow: city("moscow", "Moscow", 8, 8),
  yakutsk: city("yakutsk", "Yakutsk", 8, 4),
  tokyo: city("tokyo", "Tokyo", 8, 1),
  shanghai: city("shanghai", "Shanghai", 7, 4),
  "hong-kong": city("hong-kong", "Hong Kong", 6, 4),
  bangkok: city("bangkok", "Bangkok", 7, 7),
  singapore: city("singapore", "Singapore", 6, 6),
  sydney: city("sydney", "Sydney", 9, 1),
  "cape-town": city("cape-town", "Cape Town", 10, 1),
  cairo: city("cairo", "Cairo", 9, 5),
  baghdad: city("baghdad", "Baghdad", 8, 5),
  dubai: city("dubai", "Dubai", 7, 5),
  mumbai: city("mumbai", "Mumbai", 6, 5),
  casablanca: city("casablanca", "Casablanca", 9, 3),
  bogota: city("bogota", "Bogota", 8, 3),
  "rio-de-janeiro": city("rio-de-janeiro", "Rio de Janeiro", 7, 3),
};

/** The printed routes. From Prague: Berlin, Cairo or Moscow (rulebook). */
export const ROUTES: readonly (readonly [CityId, CityId])[] = [
  ["prague", "berlin"],
  ["prague", "moscow"],
  ["prague", "cairo"],
  ["berlin", "london"],
  ["berlin", "paris"],
  ["london", "montreal"],
  ["montreal", "los-alamos"],
  ["los-alamos", "washington"],
  ["paris", "madrid"],
  ["madrid", "monte-carlo"],
  ["monte-carlo", "vatican-city"],
  ["cairo", "casablanca"],
  ["casablanca", "bogota"],
  ["bogota", "rio-de-janeiro"],
  ["cairo", "cape-town"],
  ["cape-town", "sydney"],
  ["sydney", "tokyo"],
  ["cairo", "baghdad"],
  ["baghdad", "dubai"],
  ["dubai", "mumbai"],
  ["moscow", "yakutsk"],
  ["yakutsk", "shanghai"],
  ["shanghai", "hong-kong"],
  ["moscow", "bangkok"],
  ["bangkok", "singapore"],
];

export const CAMPAIGN_START: CityId = "prague";

function neighbourTable(): Record<CityId, CityId[]> {
  const table = Object.fromEntries(CITY_IDS.map((id) => [id, [] as CityId[]])) as Record<
    CityId,
    CityId[]
  >;
  for (const [a, b] of ROUTES) {
    table[a].push(b);
    table[b].push(a);
  }
  return table;
}

const NEIGHBOURS: Readonly<Record<CityId, readonly CityId[]>> = neighbourTable();

export function neighboursOf(id: CityId): readonly CityId[] {
  return NEIGHBOURS[id];
}

/** A mission's game options: the turns and the free mistakes. */
export function missionConfig(id: CityId): { timerTokens: number; mistakes: number } {
  const c = CITIES[id];
  return { timerTokens: c.tokens, mistakes: c.mistakes };
}

/** A campaign mission named in a game's options. */
export const CampaignMissionSchema = z.object({
  /** The saved campaign's id (server-issued). */
  id: z.string().min(8).max(64),
  city: CityIdSchema,
});
export type CampaignMission = z.infer<typeof CampaignMissionSchema>;
