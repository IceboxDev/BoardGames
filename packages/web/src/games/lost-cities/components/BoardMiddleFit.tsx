import { type ReactNode, useLayoutEffect, useRef } from "react";

/**
 * Scales children uniformly so the block fits the allocated height (flex parent).
 * Uses absolute positioning so transformed content does not expand layout; no scrollbars.
 */
export default function BoardMiddleFit({
  children,
  measureKey,
}: {
  children: ReactNode;
  measureKey: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: measureKey remeasures when expeditions/MCTS change
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const apply = () => {
      const H = outer.clientHeight;
      inner.style.transform = "scale(1)";
      inner.style.transformOrigin = "top center";
      inner.style.top = "0px";
      void inner.offsetHeight;
      const N = inner.scrollHeight;
      if (H <= 0 || N <= 0) {
        inner.style.transform = "scale(1)";
        return;
      }
      const s = Math.min(1, H / N);
      const offsetY = (H - N * s) / 2;
      inner.style.transform = `scale(${s})`;
      inner.style.transformOrigin = "top center";
      inner.style.top = `${offsetY}px`;
    };

    const ro = new ResizeObserver(apply);
    ro.observe(outer);
    apply();
    return () => ro.disconnect();
  }, [measureKey]);

  return (
    <div ref={outerRef} className="flex-1 min-h-0 overflow-hidden relative w-full">
      <div ref={innerRef} className="absolute left-0 right-0 w-full">
        {children}
      </div>
    </div>
  );
}
