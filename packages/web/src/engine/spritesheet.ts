export interface SpriteManifestEntry {
  sprite_id: string;
  position: [number, number, number, number]; // x, y, width, height
  rotate?: boolean;
}

export interface SpriteMap {
  [spriteId: string]: ImageBitmap;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function loadSpritesheet(
  imageUrl: string,
  manifest: SpriteManifestEntry[],
): Promise<SpriteMap> {
  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");
  ctx.drawImage(img, 0, 0);

  const result: SpriteMap = {};

  for (const entry of manifest) {
    const [x, y, w, h] = entry.position;
    const spriteCanvas = document.createElement("canvas");

    if (entry.rotate) {
      spriteCanvas.width = h;
      spriteCanvas.height = w;
      const sctx = spriteCanvas.getContext("2d");
      if (!sctx) throw new Error("Failed to get 2d context");
      sctx.translate(h / 2, w / 2);
      sctx.rotate(Math.PI / 2);
      sctx.drawImage(canvas, x, y, w, h, -w / 2, -h / 2, w, h);
    } else {
      spriteCanvas.width = w;
      spriteCanvas.height = h;
      const sctx = spriteCanvas.getContext("2d");
      if (!sctx) throw new Error("Failed to get 2d context");
      sctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
    }

    result[entry.sprite_id] = await createImageBitmap(spriteCanvas);
  }

  return result;
}
