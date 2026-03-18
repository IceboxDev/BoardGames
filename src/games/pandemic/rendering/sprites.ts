import {
  loadSpritesheet,
  type SpriteManifestEntry,
  type SpriteMap,
} from "../../../engine/spritesheet";
import namesManifest from "../assets/city_names.json";
import bgUrl from "../assets/img/bg.jpg";
import spritesheetUrl from "../assets/img/game_spritesheet.png";
import namesheetUrl from "../assets/img/names_spritesheet.png";
import spritesManifest from "../assets/sprites.json";

export interface GameAssets {
  gameSprites: SpriteMap;
  nameSprites: SpriteMap;
  bgImage: HTMLImageElement;
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

export async function loadGameAssets(): Promise<GameAssets> {
  const [gameSprites, nameSprites, bgImage] = await Promise.all([
    loadSpritesheet(spritesheetUrl, spritesManifest as SpriteManifestEntry[]),
    loadSpritesheet(namesheetUrl, namesManifest as SpriteManifestEntry[]),
    loadImage(bgUrl),
  ]);

  return { gameSprites, nameSprites, bgImage };
}
