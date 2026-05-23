import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  DESCRIPTION_BODY_INSET_PX,
  DESCRIPTION_DEFAULT_FONT_PX,
  DESCRIPTION_FONT_LADDER,
  DESCRIPTION_LINE_HEIGHT,
  DESCRIPTION_TARGET_PX,
  DescriptionFontContext,
} from "./description-font";
import { largestFontFittingAll } from "./fit-text";
import { measureTextHeight, syncMeasurerFont } from "./measure-text";

type Props = {
  /** Every `default` description that will render in the grid. Must be a
   *  STABLE reference (memoize at the call site). The longest one sets the
   *  font for all. */
  texts: string[];
  className?: string;
  children: ReactNode;
};

/**
 * Renders the catalog grid `<div>` and provides the uniform description font
 * to its cards (via `useDescriptionFont`). It measures its own resolved
 * column width (`gridTemplateColumns`) and recomputes on resize / breakpoint
 * change, so the font tracks the actual card size on any screen.
 */
export function DescriptionGrid({ texts, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontPx, setFontPx] = useState(DESCRIPTION_DEFAULT_FONT_PX);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const compute = () => {
      const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
      const track = Number.parseFloat(tracks[0] ?? "");
      if (!Number.isFinite(track) || track <= 0) return;
      const width = track - DESCRIPTION_BODY_INSET_PX;
      if (width <= 0) return;
      syncMeasurerFont(grid);
      setFontPx(
        largestFontFittingAll(texts, DESCRIPTION_TARGET_PX, DESCRIPTION_FONT_LADDER, (t, f) =>
          measureTextHeight(t, width, f, DESCRIPTION_LINE_HEIGHT),
        ),
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [texts]);

  return (
    <DescriptionFontContext.Provider value={fontPx}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </DescriptionFontContext.Provider>
  );
}
