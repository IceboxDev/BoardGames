import { useCallback, useEffect, useRef, useState } from "react";

// The single copy-to-clipboard hook. Three screens (admin reset-link modal,
// calendar-sync URL field, the BGA table link) each hand-rolled
// `useState + navigator.clipboard + setTimeout` — two of them leaked the
// timeout on unmount, and the three disagreed on reset delay and label.
// One hook, one delay, cleanup handled.

export function useCopyToClipboard(resetMs = 2000): {
  /** True for `resetMs` after a successful copy — drive the "Copied" label. */
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
      return true;
    },
    [resetMs],
  );

  return { copied, copy };
}
