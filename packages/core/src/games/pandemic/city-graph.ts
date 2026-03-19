import citiesJson from "./assets/cities.json";
import connectionsJson from "./assets/connections.json";
import type { CityData, DiseaseColor } from "./types";

interface RawCity {
  sprite_icon: string;
  sprite_id: string;
  position: [number, number];
}

interface RawConnection {
  connection: [string, string];
  loop: boolean;
}

const SPRITE_COLOR_MAP: Record<string, DiseaseColor> = {
  cityspace_blue: "blue",
  cityspace_yellow: "yellow",
  cityspace_black: "black",
  cityspace_red: "red",
};

const DISPLAY_NAMES: Record<string, string> = {
  SanFrancisco: "San Francisco",
  Chicago: "Chicago",
  Montreal: "Montréal",
  NewYork: "New York",
  Atlanta: "Atlanta",
  Washington: "Washington",
  London: "London",
  Madrid: "Madrid",
  Paris: "Paris",
  Essen: "Essen",
  Milan: "Milan",
  StPetersburg: "St. Petersburg",
  LosAngeles: "Los Angeles",
  MexicoCity: "Mexico City",
  Miami: "Miami",
  Bogota: "Bogotá",
  Lima: "Lima",
  Santiago: "Santiago",
  BuenosAires: "Buenos Aires",
  SaoPaulo: "São Paulo",
  Lagos: "Lagos",
  Khartoum: "Khartoum",
  Kinshasa: "Kinshasa",
  Johannesburg: "Johannesburg",
  Algiers: "Algiers",
  Cairo: "Cairo",
  Istanbul: "Istanbul",
  Moscow: "Moscow",
  Tehran: "Tehran",
  Baghdad: "Baghdad",
  Riyadh: "Riyadh",
  Mumbai: "Mumbai",
  Karachi: "Karachi",
  Delhi: "Delhi",
  Chennai: "Chennai",
  Kolkata: "Kolkata",
  Bangkok: "Bangkok",
  Jakarta: "Jakarta",
  HoChiMinhCity: "Ho Chi Minh City",
  HongKong: "Hong Kong",
  Shanghai: "Shanghai",
  Beijing: "Beijing",
  Seoul: "Seoul",
  Tokyo: "Tokyo",
  Osaka: "Osaka",
  Taipei: "Taipei",
  Manila: "Manila",
  Sydney: "Sydney",
};

const POPULATIONS: Record<string, number> = {
  SanFrancisco: 864816,
  Chicago: 2746388,
  Montreal: 4887000,
  NewYork: 20464000,
  Atlanta: 4715000,
  Washington: 4586770,
  London: 10310000,
  Madrid: 6642000,
  Paris: 12405000,
  Essen: 575000,
  Milan: 5264000,
  StPetersburg: 5351935,
  LosAngeles: 18550000,
  MexicoCity: 21580000,
  Miami: 6166488,
  Bogota: 8702000,
  Lima: 9121000,
  Santiago: 6680000,
  BuenosAires: 15180000,
  SaoPaulo: 21847000,
  Lagos: 21324000,
  Khartoum: 5274321,
  Kinshasa: 14342000,
  Johannesburg: 4434827,
  Algiers: 3415811,
  Cairo: 20076000,
  Istanbul: 15520000,
  Moscow: 12506468,
  Tehran: 7419000,
  Baghdad: 6643000,
  Riyadh: 5037000,
  Mumbai: 16910000,
  Karachi: 14910000,
  Delhi: 16314838,
  Chennai: 8865000,
  Kolkata: 14667000,
  Bangkok: 10539000,
  Jakarta: 10770000,
  HoChiMinhCity: 4900000,
  HongKong: 7347000,
  Shanghai: 15512000,
  Beijing: 11516000,
  Seoul: 25600000,
  Tokyo: 38001000,
  Osaka: 20238000,
  Taipei: 8338000,
  Manila: 20767000,
  Sydney: 4921000,
};

function buildCityData(): Map<string, CityData> {
  const cities = citiesJson as RawCity[];
  const connections = connectionsJson as RawConnection[];

  const neighbors = new Map<string, Set<string>>();

  for (const city of cities) {
    neighbors.set(city.sprite_id, new Set());
  }

  for (const conn of connections) {
    const [a, b] = conn.connection;
    neighbors.get(a)?.add(b);
    neighbors.get(b)?.add(a);
  }

  const result = new Map<string, CityData>();

  for (const city of cities) {
    const color = SPRITE_COLOR_MAP[city.sprite_icon];
    if (!color) continue;

    result.set(city.sprite_id, {
      id: city.sprite_id,
      name: DISPLAY_NAMES[city.sprite_id] ?? city.sprite_id,
      color,
      position: city.position,
      neighbors: Array.from(neighbors.get(city.sprite_id) ?? []),
      population: POPULATIONS[city.sprite_id] ?? 0,
    });
  }

  return result;
}

export const CITY_DATA: Map<string, CityData> = buildCityData();

export const ALL_CITY_IDS: string[] = Array.from(CITY_DATA.keys());

export function getCityNeighbors(id: string): string[] {
  return CITY_DATA.get(id)?.neighbors ?? [];
}

export function areCitiesConnected(a: string, b: string): boolean {
  const city = CITY_DATA.get(a);
  return city ? city.neighbors.includes(b) : false;
}

export function getCityColor(id: string): DiseaseColor {
  const city = CITY_DATA.get(id);
  if (!city) throw new Error(`Unknown city: ${id}`);
  return city.color;
}

export interface ConnectionData {
  cityA: string;
  cityB: string;
  loop: boolean;
}

export function getConnections(): ConnectionData[] {
  return (connectionsJson as RawConnection[]).map((c) => ({
    cityA: c.connection[0],
    cityB: c.connection[1],
    loop: c.loop,
  }));
}
