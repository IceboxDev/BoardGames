import { CITY_DATA, getConnections } from "@boardgames/core/games/pandemic/city-graph";
import { REFERENCE_HEIGHT, REFERENCE_WIDTH } from "./camera";
import type { RenderLayer, Viewport } from "./renderer";
import type { GameAssets } from "./sprites";

const CITYSPACE_SIZE = 50;
const CITYTEXT_WIDTH = 150;
const CITYTEXT_HEIGHT = 24;
const CITYTEXT_UPSHIFT = 10;
const LINE_WIDTH = 3;
const LINE_COLOR = "rgb(160, 255, 255)";

export function createBoardLayer(assets: GameAssets): RenderLayer {
  let cachedCanvas: OffscreenCanvas | null = null;

  function renderToCache(): void {
    cachedCanvas = new OffscreenCanvas(REFERENCE_WIDTH, REFERENCE_HEIGHT);
    const ctx = cachedCanvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.drawImage(assets.bgImage, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);

    // Connections
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = LINE_WIDTH;

    const connections = getConnections();

    for (const conn of connections) {
      const cityA = CITY_DATA.get(conn.cityA);
      const cityB = CITY_DATA.get(conn.cityB);
      if (!cityA || !cityB) continue;

      const ax = cityA.position[0] + CITYTEXT_WIDTH / 2;
      const ay = cityA.position[1] + CITYSPACE_SIZE / 2;
      const bx = cityB.position[0] + CITYTEXT_WIDTH / 2;
      const by = cityB.position[1] + CITYSPACE_SIZE / 2;

      if (conn.loop) {
        // Wrap-around connection: draw lines that exit/enter at map edges
        const mapW = REFERENCE_WIDTH;

        // Determine which city is on the left vs right
        const isALeft = ax <= bx;
        const lx = isALeft ? ax : bx;
        const ly = isALeft ? ay : by;
        const rx = isALeft ? bx : ax;
        const ry = isALeft ? by : ay;

        // The "short" path goes off the left edge and wraps to right (or vice versa)
        const wrapDist = mapW - rx + lx;
        const totalDist = wrapDist;
        const fracRight = (mapW - rx) / totalDist;

        // Edge-crossing Y-coordinate (linear interpolation)
        const edgeY = ry + (ly - ry) * fracRight;

        // Right city -> right edge
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(mapW, edgeY);
        ctx.stroke();

        // Left edge -> left city
        ctx.beginPath();
        ctx.moveTo(0, edgeY);
        ctx.lineTo(lx, ly);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // City icons and name labels
    for (const [, city] of CITY_DATA) {
      const [x, y] = city.position;

      const icon = assets.gameSprites[`cityspace_${city.color}`];
      if (icon) {
        const offsetX = (CITYTEXT_WIDTH - CITYSPACE_SIZE) / 2;
        ctx.drawImage(icon, x + offsetX, y, CITYSPACE_SIZE, CITYSPACE_SIZE);
      }

      const nameSprite = assets.nameSprites[city.id];
      if (nameSprite) {
        ctx.drawImage(
          nameSprite,
          x,
          y + CITYSPACE_SIZE - CITYTEXT_UPSHIFT,
          CITYTEXT_WIDTH,
          CITYTEXT_HEIGHT,
        );
      }
    }
  }

  return {
    id: "board",
    zIndex: 0,
    dirty: true,
    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      if (!cachedCanvas) {
        renderToCache();
      }

      ctx.save();
      ctx.translate(viewport.offsetX, viewport.offsetY);
      ctx.scale(viewport.scale, viewport.scale);
      if (cachedCanvas) ctx.drawImage(cachedCanvas, 0, 0);
      ctx.restore();
    },
  };
}
