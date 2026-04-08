import { CITY_DATA, getCityNeighbors } from "./city-graph";
import { cloneGameState } from "./state-utils";
import type { DiseaseColor, GameState } from "./types";
import { DISEASE_COLORS, MAX_CUBES_PER_CITY_COLOR, MAX_OUTBREAKS } from "./types";

function isQuarantined(state: GameState, cityId: string): boolean {
  for (const player of state.players) {
    if (player.role !== "quarantine_specialist") continue;
    if (player.location === cityId) return true;
    if (getCityNeighbors(player.location).includes(cityId)) return true;
  }
  return false;
}

function isMedicPresent(state: GameState, cityId: string): boolean {
  return state.players.some((p) => p.role === "medic" && p.location === cityId);
}

export function infectCity(
  state: GameState,
  cityId: string,
  color: DiseaseColor,
  count: number,
): GameState {
  let s = cloneGameState(state);

  if (s.diseaseStatus[color] === "eradicated") return s;
  if (isQuarantined(s, cityId)) return s;
  if (isMedicPresent(s, cityId) && s.diseaseStatus[color] === "cured") return s;

  const current = s.cityCubes[cityId][color];
  const space = MAX_CUBES_PER_CITY_COLOR - current;

  if (space >= count) {
    s.cityCubes[cityId][color] += count;
    s.diseaseCubeSupply[color] -= count;
    if (s.diseaseCubeSupply[color] < 0) {
      s.result = "loss_cubes";
      s.phase = "game_over";
      s.log.push({
        turn: s.turnNumber,
        player: s.currentPlayerIndex,
        message: `Game Over: Ran out of ${color} cubes`,
      });
    }
    return s;
  }

  // Fill to 3, then outbreak
  const toPlace = space;
  if (toPlace > 0) {
    s.cityCubes[cityId][color] += toPlace;
    s.diseaseCubeSupply[color] -= toPlace;
    if (s.diseaseCubeSupply[color] < 0) {
      s.result = "loss_cubes";
      s.phase = "game_over";
      s.log.push({
        turn: s.turnNumber,
        player: s.currentPlayerIndex,
        message: `Game Over: Ran out of ${color} cubes`,
      });
      return s;
    }
  }

  s = resolveOutbreakInPlace(s, cityId, color, new Set([cityId]));
  return s;
}

/**
 * @internal Mutates `state` in place. Caller must pass a pre-cloned state.
 *
 * Recursive outbreak resolution operates on a single cloned copy so that the
 * `chainSet` correctly tracks visited cities across the entire chain and
 * cube/outbreak counts stay consistent between branches.
 */
function resolveOutbreakInPlace(
  state: GameState,
  cityId: string,
  color: DiseaseColor,
  chainSet: Set<string>,
): GameState {
  let s = state;

  s.outbreakCount++;
  const cityName = CITY_DATA.get(cityId)?.name ?? cityId;
  s.log.push({
    turn: s.turnNumber,
    player: s.currentPlayerIndex,
    message: `Outbreak in ${cityName}! (${color}) — Outbreak count: ${s.outbreakCount}`,
  });
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: s.currentPlayerIndex,
    action: "outbreak",
    city: cityName,
    disease: color,
  });

  if (s.outbreakCount >= MAX_OUTBREAKS) {
    s.result = "loss_outbreaks";
    s.phase = "game_over";
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: `Game Over: ${MAX_OUTBREAKS} outbreaks reached`,
    });
    return s;
  }

  const neighbors = getCityNeighbors(cityId);

  for (const neighbor of neighbors) {
    if (s.result) return s;
    if (chainSet.has(neighbor)) continue;
    if (isQuarantined(s, neighbor)) continue;
    if (isMedicPresent(s, neighbor) && s.diseaseStatus[color] === "cured") continue;

    if (s.cityCubes[neighbor][color] >= MAX_CUBES_PER_CITY_COLOR) {
      chainSet.add(neighbor);
      s = resolveOutbreakInPlace(s, neighbor, color, chainSet);
    } else {
      s.cityCubes[neighbor][color]++;
      s.diseaseCubeSupply[color]--;
      if (s.diseaseCubeSupply[color] < 0) {
        s.result = "loss_cubes";
        s.phase = "game_over";
        s.log.push({
          turn: s.turnNumber,
          player: s.currentPlayerIndex,
          message: `Game Over: Ran out of ${color} cubes`,
        });
        return s;
      }
    }
  }

  return s;
}

export function checkEradication(state: GameState, color: DiseaseColor): GameState {
  if (state.diseaseStatus[color] !== "cured") return state;

  const totalCubes = Object.values(state.cityCubes).reduce((sum, cubes) => sum + cubes[color], 0);

  if (totalCubes === 0) {
    const s = cloneGameState(state);
    s.diseaseStatus[color] = "eradicated";
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: `${color.charAt(0).toUpperCase() + color.slice(1)} disease has been eradicated!`,
    });
    return s;
  }

  return state;
}

export function applyMedicAutoRemove(state: GameState): GameState {
  let s = state;
  let changed = false;

  for (const player of s.players) {
    if (player.role !== "medic") continue;
    const loc = player.location;
    for (const color of DISEASE_COLORS) {
      if (s.diseaseStatus[color] === "cured" && s.cityCubes[loc][color] > 0) {
        if (!changed) {
          s = cloneGameState(s);
          changed = true;
        }
        const removed = s.cityCubes[loc][color];
        s.diseaseCubeSupply[color] += removed;
        s.cityCubes[loc][color] = 0;
        s = checkEradication(s, color);
      }
    }
  }

  return s;
}
