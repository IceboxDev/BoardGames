// Device/viewport telemetry — the data needed to reproduce a member's
// rendering environment locally (viewport, screen, DPR, zoom, pinch).
// Reported fire-and-forget to /api/activity/device; the server upserts by
// signature so re-reports of the same setup only bump last-seen/hits.

import { type DeviceInfo, DeviceInfoSchema, OkResponseSchema } from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch";

function browserOf(ua: string): string | undefined {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\/|crios\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return undefined;
}

function osOf(ua: string): string | undefined {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return undefined;
}

export function collectDeviceInfo(): DeviceInfo {
  const touch = navigator.maxTouchPoints > 0;
  const screenMin = Math.min(screen.width, screen.height);
  const deviceType: DeviceInfo["deviceType"] = touch
    ? screenMin < 768
      ? "phone"
      : "tablet"
    : "desktop";

  const viewportWidth = Math.round(window.innerWidth);
  const viewportHeight = Math.round(window.innerHeight);

  // outerWidth/innerWidth tracks desktop browser zoom closely (both are in
  // zoom-scaled CSS px vs real window px). Meaningless on mobile → omitted.
  let zoomPercent: number | undefined;
  if (!touch && window.outerWidth > 0 && viewportWidth > 0) {
    const est = Math.round((window.outerWidth / viewportWidth) * 100);
    if (est >= 10 && est <= 1000) zoomPercent = est;
  }

  const pinch = window.visualViewport?.scale;

  return {
    deviceType,
    viewportWidth: Math.max(1, viewportWidth),
    viewportHeight: Math.max(1, viewportHeight),
    screenWidth: Math.max(1, Math.round(screen.width)),
    screenHeight: Math.max(1, Math.round(screen.height)),
    devicePixelRatio: Math.min(10, Math.max(0.1, window.devicePixelRatio || 1)),
    ...(zoomPercent !== undefined ? { zoomPercent } : {}),
    ...(pinch !== undefined && pinch >= 0.1 && pinch <= 10 ? { pinchScale: pinch } : {}),
    orientation: viewportWidth >= viewportHeight ? "landscape" : "portrait",
    ...(browserOf(navigator.userAgent) ? { browser: browserOf(navigator.userAgent) } : {}),
    ...(osOf(navigator.userAgent) ? { os: osOf(navigator.userAgent) } : {}),
  };
}

/** Mirror of the server's upsert signature — used only for client throttling. */
function signatureOf(info: DeviceInfo): string {
  const vwBucket = Math.round(info.viewportWidth / 32) * 32;
  return [
    info.deviceType,
    `${info.screenWidth}x${info.screenHeight}`,
    `dpr${info.devicePixelRatio}`,
    info.browser ?? "?",
    info.os ?? "?",
    `vw${vwBucket}`,
  ].join("|");
}

const RESEND_WINDOW_MS = 30 * 60 * 1000;
let lastSignature: string | null = null;
let lastSentAt = 0;

/** Report the current environment; same-signature re-reports are throttled. */
export function reportDevice(): void {
  const info = collectDeviceInfo();
  const sig = signatureOf(info);
  const now = Date.now();
  if (sig === lastSignature && now - lastSentAt < RESEND_WINDOW_MS) return;
  lastSignature = sig;
  lastSentAt = now;

  void apiFetch("/api/activity/device", {
    method: "POST",
    body: info,
    request: DeviceInfoSchema,
    response: OkResponseSchema,
  }).catch(() => {
    // Best-effort telemetry: allow a retry on the next trigger.
    lastSignature = null;
  });
}
