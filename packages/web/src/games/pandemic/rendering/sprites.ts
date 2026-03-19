import type { Role } from "@boardgames/core/games/pandemic/types";
import {
  loadSpritesheet,
  type SpriteManifestEntry,
  type SpriteMap,
} from "../../../engine/spritesheet";
import namesManifest from "../assets/city_names.json";
import bgUrl from "../assets/img/bg.jpg";
import spritesheetUrl from "../assets/img/game_spritesheet.png";
import namesheetUrl from "../assets/img/names_spritesheet.png";
import contingencyPlannerUrl from "../assets/roles/contingency_planner.png";
import dispatcherUrl from "../assets/roles/dispatcher.png";
import medicUrl from "../assets/roles/medic.png";
import operationsExpertUrl from "../assets/roles/operations_expert.png";
import quarantineSpecialistUrl from "../assets/roles/quarantine_specialist.png";
import researcherUrl from "../assets/roles/researcher.png";
import scientistUrl from "../assets/roles/scientist.png";
import spritesManifest from "../assets/sprites.json";
import { type RenderedRoleCards, renderAllRoleCards } from "./card-renderer";

export type RolePortraits = Record<Role, HTMLImageElement>;

export interface GameAssets {
  gameSprites: SpriteMap;
  nameSprites: SpriteMap;
  bgImage: HTMLImageElement;
  rolePortraits: RolePortraits;
  roleCards: RenderedRoleCards;
}

function loadImage(url: string, timeoutMs = 15000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      reject(new Error(`Image load timed out: ${url}`));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}

const ROLE_PORTRAIT_URLS: Record<Role, string> = {
  medic: medicUrl,
  dispatcher: dispatcherUrl,
  researcher: researcherUrl,
  scientist: scientistUrl,
  contingency_planner: contingencyPlannerUrl,
  operations_expert: operationsExpertUrl,
  quarantine_specialist: quarantineSpecialistUrl,
};

async function loadRolePortraits(): Promise<RolePortraits> {
  const entries = Object.entries(ROLE_PORTRAIT_URLS) as [Role, string][];
  const images = await Promise.all(entries.map(([, url]) => loadImage(url)));
  return Object.fromEntries(entries.map(([role], i) => [role, images[i]])) as RolePortraits;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const [gameSprites, nameSprites, bgImage, rolePortraits] = await Promise.all([
    loadSpritesheet(spritesheetUrl, spritesManifest as SpriteManifestEntry[]),
    loadSpritesheet(namesheetUrl, namesManifest as SpriteManifestEntry[]),
    loadImage(bgUrl),
    loadRolePortraits(),
  ]);

  const roleCards = renderAllRoleCards(rolePortraits);

  return { gameSprites, nameSprites, bgImage, rolePortraits, roleCards };
}
