import { ROLE_DEFS } from "@boardgames/core/games/pandemic/roles";
import type { Role } from "@boardgames/core/games/pandemic/types";
import type { RolePortraits } from "./sprites";

const CARD_W = 200;
const CARD_H = 260;
const BORDER = 2;
const CORNER_R = 8;
const NAME_BAR_H = 36;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  for (let size = maxSize; size >= minSize; size--) {
    ctx.font = `bold ${size}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

function renderCompactCard(
  portrait: HTMLImageElement,
  color: string,
  name: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const inner = BORDER;
  const iw = CARD_W - inner * 2;
  const ih = CARD_H - inner * 2;

  // Clip to rounded rect for entire card
  roundRect(ctx, 0, 0, CARD_W, CARD_H, CORNER_R);
  ctx.clip();

  // Fill card background (visible as border color)
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Clip inner area for portrait
  ctx.save();
  roundRect(ctx, inner, inner, iw, ih, CORNER_R - 1);
  ctx.clip();

  // Draw portrait — full bleed, cover the entire inner area
  const imgW = portrait.naturalWidth;
  const imgH = portrait.naturalHeight;
  const imgAspect = imgW / imgH;
  const cardAspect = iw / ih;

  let sx = 0;
  const sy = 0;
  let sw = imgW;
  let sh = imgH;

  if (imgAspect > cardAspect) {
    sw = imgH * cardAspect;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW / cardAspect;
  }

  ctx.drawImage(portrait, sx, sy, sw, sh, inner, inner, iw, ih);

  // Gradient overlay at bottom for name readability
  const gradH = Math.round(ih * 0.45);
  const grad = ctx.createLinearGradient(0, CARD_H - inner - gradH, 0, CARD_H - inner);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.6, "rgba(0, 0, 0, 0.5)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(inner, CARD_H - inner - gradH, iw, gradH);

  ctx.restore();

  // Name text at bottom
  const nameText = name.toUpperCase();
  const textPad = 10;
  const maxTextW = iw - textPad * 2;
  const nameY = CARD_H - inner - NAME_BAR_H / 2;

  const fontSize = fitText(ctx, nameText, maxTextW, 15, 9);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Check if we need to split into two lines
  if (ctx.measureText(nameText).width > maxTextW) {
    const words = nameText.split(" ");
    const mid = Math.ceil(words.length / 2);
    const line1 = words.slice(0, mid).join(" ");
    const line2 = words.slice(mid).join(" ");
    const lineH = fontSize * 1.25;

    const twoLineFontSize = fitText(
      ctx,
      line1.length > line2.length ? line1 : line2,
      maxTextW,
      13,
      8,
    );
    ctx.font = `bold ${twoLineFontSize}px sans-serif`;

    ctx.fillStyle = "#f0f0f4";
    ctx.fillText(line1, CARD_W / 2, nameY - lineH / 2);
    ctx.fillText(line2, CARD_W / 2, nameY + lineH / 2);
  } else {
    ctx.fillStyle = "#f0f0f4";
    ctx.fillText(nameText, CARD_W / 2, nameY);
  }

  // Subtle accent line above name area
  ctx.strokeStyle = `${color}50`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(inner + textPad, CARD_H - inner - NAME_BAR_H - 2);
  ctx.lineTo(CARD_W - inner - textPad, CARD_H - inner - NAME_BAR_H - 2);
  ctx.stroke();

  // Outer border — redraw on top so it's crisp
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, CORNER_R);
  ctx.strokeStyle = color;
  ctx.lineWidth = BORDER;
  ctx.stroke();

  return canvas;
}

export type RenderedRoleCards = Record<Role, HTMLCanvasElement>;

export function renderAllRoleCards(rolePortraits: RolePortraits): RenderedRoleCards {
  const cards = {} as RenderedRoleCards;

  for (const def of ROLE_DEFS) {
    cards[def.id] = renderCompactCard(rolePortraits[def.id], def.pawnColor, def.name);
  }

  return cards;
}
