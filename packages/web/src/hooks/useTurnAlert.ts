import { useEffect } from "react";

/** How often a hidden tab's title blinks while it waits on this player. */
export const TURN_ALERT_BLINK_MS = 1000;

/** The badge drawn on the tab icon while the game waits on this player. */
const BADGE_COLOR = "#f59e0b";
const ICON_PX = 64;

/** The site's own icon, if it has one that loads; null otherwise. */
async function loadIcon(href: string | null): Promise<HTMLImageElement | null> {
  if (!href) return null;
  try {
    const image = new Image();
    image.src = href;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/**
 * The tab icon with a badge in its corner, as a data URL — or, with no icon
 * to draw on (the site has none yet), the badge alone as the whole icon.
 * Null where a canvas can't draw (tests).
 */
async function badgedIcon(href: string | null): Promise<string | null> {
  const image = await loadIcon(href);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (image) ctx.drawImage(image, 0, 0, ICON_PX, ICON_PX);
    const [x, y, r] = image ? [0.74, 0.26, 0.24] : [0.5, 0.5, 0.44];
    ctx.beginPath();
    ctx.arc(ICON_PX * x, ICON_PX * y, ICON_PX * r, 0, Math.PI * 2);
    ctx.fillStyle = BADGE_COLOR;
    ctx.fill();
    ctx.lineWidth = ICON_PX * 0.06;
    ctx.strokeStyle = "#111";
    ctx.stroke();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Marks the browser tab while the game is waiting on this player:
 * `● Your guess: ALARM 3 — <title>`, and a badge on the tab icon. The badge
 * is the signal that survives everything — a narrow or pinned tab that hides
 * the title, and the browser slowing a background tab's timers (Chrome runs
 * them once a minute after five minutes away). While the tab is hidden the
 * title also blinks (title and mark alternate); once looked at, it holds
 * steady. `null` — nothing is waiting on them — puts both back.
 *
 * Games with one active player can feed it `isMyTurn`; games where several
 * seats act at once (Codenames) pass what this seat must do right now.
 */
export function useTurnAlert(label: string | null): void {
  useEffect(() => {
    if (label === null) return;
    const original = document.title;
    const lit = `● ${label} — ${original}`;
    let shown = true;
    document.title = lit;

    const blink = setInterval(() => {
      if (document.hidden) {
        shown = !shown;
        document.title = shown ? lit : original;
      } else if (document.title !== lit) {
        shown = true;
        document.title = lit;
      }
    }, TURN_ALERT_BLINK_MS);
    const onVisible = () => {
      if (!document.hidden) {
        shown = true;
        document.title = lit;
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(blink);
      document.removeEventListener("visibilitychange", onVisible);
      document.title = original;
    };
  }, [label]);

  // The badge depends only on whether something waits, not on its words, so
  // a clue arriving while the spymaster's own badge shows doesn't redraw it.
  const waiting = label !== null;
  useEffect(() => {
    if (!waiting) return;
    const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const link = existing ?? document.head.appendChild(document.createElement("link"));
    if (!existing) link.rel = "icon";
    const original = { href: link.getAttribute("href"), type: link.getAttribute("type") };
    let cancelled = false;
    void badgedIcon(existing ? existing.href : null).then((url) => {
      if (cancelled || url === null) return;
      link.type = "image/png";
      link.href = url;
    });
    return () => {
      cancelled = true;
      if (!existing) link.remove();
      if (original.href !== null) link.setAttribute("href", original.href);
      if (original.type !== null) link.setAttribute("type", original.type);
    };
  }, [waiting]);
}
