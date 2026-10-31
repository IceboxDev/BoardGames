import { useEffect, useRef } from "react";

// A thin rule in the section's ink, pinned to the top of the page, that
// fills as the page is read: how far its scroll container has scrolled.
// Drawn with a transform, so it never moves anything around it.

export function ReadingProgress({ color }: { color: string }) {
  const bar = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let scroller = bar.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    if (!scroller) return;
    const el = scroller;
    const update = () => {
      const range = el.scrollHeight - el.clientHeight;
      const share = range > 0 ? Math.min(1, el.scrollTop / range) : 1;
      if (bar.current) bar.current.style.transform = `scaleX(${share})`;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return (
    <div aria-hidden="true" className="sticky top-0 z-lift h-0.5 shrink-0 bg-line-soft">
      <span
        ref={bar}
        className="block h-full origin-left"
        style={{ backgroundColor: color, transform: "scaleX(0)" }}
      />
    </div>
  );
}
