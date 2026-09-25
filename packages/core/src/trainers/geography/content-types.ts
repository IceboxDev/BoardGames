import { z } from "zod";

// The World Geography deck as data: continents → subregions → countries →
// cities, generated from Natural Earth by `pnpm geography-import` into
// `content/places.json` (+ the globe's TopoJSON next to it). Pure schemas,
// shared by the importer, the server (card validation) and the web.

export const CONTINENT_IDS = ["eu", "as", "af", "na", "sa", "oc", "an"] as const;
export const ContinentIdSchema = z.enum(CONTINENT_IDS);
export type ContinentId = z.infer<typeof ContinentIdSchema>;

const LonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LonLat = z.infer<typeof LonLatSchema>;

const Named = {
  nameEn: z.string().min(1),
  nameDe: z.string().min(1),
  /** Other accepted spellings, either language ("Czechia", "Tschechische Republik"). */
  aliases: z.array(z.string().min(1)),
};

export const ContinentSchema = z.object({
  id: z.string().regex(/^ct:[a-z]{2}$/),
  kind: z.literal("continent"),
  code: ContinentIdSchema,
  ...Named,
  /** Where the globe looks when it shows the continent. */
  focus: LonLatSchema,
});
export type Continent = z.infer<typeof ContinentSchema>;

export const SubregionSchema = z.object({
  id: z.string().regex(/^sr:[a-z0-9-]+$/),
  continent: ContinentIdSchema,
  nameEn: z.string().min(1),
  nameDe: z.string().min(1),
  /** Introduction order inside the continent. */
  order: z.number().int().min(0),
});
export type Subregion = z.infer<typeof SubregionSchema>;

export const CountrySchema = z.object({
  id: z.string().regex(/^co:[A-Z]{3}$/),
  kind: z.literal("country"),
  /** Feature id in the TopoJSON `countries` object. */
  feature: z.string().min(1),
  ...Named,
  continent: ContinentIdSchema,
  /** Transcontinental: a click here also counts for these continents. */
  alsoContinents: z.array(ContinentIdSchema),
  /** Split by a meridian between two continents (Russia at the Urals, …). */
  split: z.object({ lon: z.number(), west: ContinentIdSchema, east: ContinentIdSchema }).nullable(),
  subregion: z.string(),
  /** Introduction order inside the subregion (most salient first). */
  order: z.number().int().min(0),
  focus: LonLatSchema,
  areaKm2: z.number().nonnegative(),
  pop: z.number().int().nonnegative(),
  /** Too small to click reliably: graded by distance to `focus` instead. */
  tiny: z.boolean(),
  landlocked: z.boolean(),
  neighbours: z.array(z.string()),
  /** The capital's city id. */
  capital: z.string().nullable(),
});
export type Country = z.infer<typeof CountrySchema>;

export const CitySchema = z.object({
  id: z.string().regex(/^ci:\d+$/),
  kind: z.literal("city"),
  ...Named,
  country: z.string().regex(/^co:[A-Z]{3}$/),
  at: LonLatSchema,
  pop: z.number().int().nonnegative(),
  capital: z.boolean(),
  /** Introduction order inside the country (capital first). */
  order: z.number().int().min(0),
});
export type City = z.infer<typeof CitySchema>;

/** A territory drawn as land but not quizzed (Greenland, Western Sahara, …). */
export const TerritorySchema = z.object({
  feature: z.string().min(1),
  nameEn: z.string().min(1),
  nameDe: z.string().min(1),
  /** Continent its land counts for (null: open-ocean islands). */
  continent: ContinentIdSchema.nullable(),
});
export type Territory = z.infer<typeof TerritorySchema>;

export const PlacesSchema = z.object({
  version: z.string().min(1),
  continents: z.array(ContinentSchema),
  subregions: z.array(SubregionSchema),
  countries: z.array(CountrySchema),
  cities: z.array(CitySchema),
  territories: z.array(TerritorySchema),
});
export type Places = z.infer<typeof PlacesSchema>;

export type Place = Continent | Country | City;
export type PlaceKind = Place["kind"];
