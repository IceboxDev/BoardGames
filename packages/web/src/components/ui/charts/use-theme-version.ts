import { useSyncExternalStore } from "react";
import { getThemeVersion, subscribeToThemeChange } from "./tone-hex";

/**
 * Re-renders the component when the personalization engine dispatches
 * `themechange`, so per-render `chartHex`/`resolveChartColor` calls pick up
 * the new CSS-var values. Every chart component calls this at the top; the
 * returned counter doubles as a memo dep for any derived-color memoization.
 */
export function useThemeVersion(): number {
  return useSyncExternalStore(subscribeToThemeChange, getThemeVersion, getThemeVersion);
}
