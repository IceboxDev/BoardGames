/**
 * Every server-run game's manifest, keyed by slug. Browser-safe: manifests
 * never import an engine or an AI. The server pairs each with its machine spec
 * (`server/src/sessions/game-registry.ts`); a test there keeps the two sets
 * identical.
 */

import type { GameManifest } from "../machines/manifest";
import { sevenWondersManifest } from "./7-wonders/manifest";
import { decryptoManifest } from "./decrypto/manifest";
import { durakManifest } from "./durak/manifest";
import { explodingKittensManifest } from "./exploding-kittens/manifest";
import { lostCitiesManifest } from "./lost-cities/manifest";
import { pandemicManifest } from "./pandemic/manifest";
import { parksManifest } from "./parks/manifest";
import { quiztopiaManifest } from "./quiztopia/manifest";
import { sensoManifest } from "./senso-battle-for-japan/manifest";
import { setManifest } from "./set/manifest";
import { skyTeamManifest } from "./sky-team/manifest";
import { sushiGoManifest } from "./sushi-go/manifest";
import { theHungerManifest } from "./the-hunger/manifest";

export const GAME_MANIFESTS: readonly GameManifest[] = [
  sevenWondersManifest,
  decryptoManifest,
  durakManifest,
  explodingKittensManifest,
  lostCitiesManifest,
  pandemicManifest,
  parksManifest,
  quiztopiaManifest,
  sensoManifest,
  setManifest,
  skyTeamManifest,
  sushiGoManifest,
  theHungerManifest,
];

const bySlug = new Map(GAME_MANIFESTS.map((m) => [m.slug, m]));

export function getManifest(slug: string): GameManifest | undefined {
  return bySlug.get(slug);
}
