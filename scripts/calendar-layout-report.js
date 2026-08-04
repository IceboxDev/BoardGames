// Calendar layout diagnostic — paste the whole file into the browser console.
//
// Purpose: capture the exact rendered geometry of the offline calendar grid and
// the name chips inside the day cells (DayCell / DayLabels / NameRow in
// packages/web/src/components/offline/CalendarDayCell.tsx) on THIS display, so
// a layout fix can be scoped to the right breakpoint tier without guessing.
//
// Usage:
//   1. On the display you want to diagnose, open the calendar with names
//      visible (admin overlay on), at your normal OS scaling / browser zoom —
//      both change effective CSS pixels and are recorded in the report.
//   2. Open DevTools UNDOCKED (or docked to bottom) so the panel doesn't
//      shrink the viewport width you're measuring.
//   3. Paste this file's contents into the console and press Enter.
//   4. The full JSON report is copied to the clipboard — paste it to Claude.
//      A per-grid summary is also printed for a quick eyeball.
//
// Optionally run it once more on a screen where the layout looks GOOD — a
// healthy baseline makes it easy to verify a fix only touches the broken tier.
//
// Report contents:
//   env      — viewport, screen, devicePixelRatio, zoom, root font size, and
//              which project breakpoints (xs2/sm/md/lg/xl/2xl/3xl) are active.
//   grids    — one entry per rendered calendar grid (main + compact mini):
//     rect / gap / rowHeightsPx — grid geometry and actual row heights.
//     chipCss  — computed font size, line height, gaps, dot size of a chip.
//     summary  — chip totals, truncated/clipped/hidden counts, wrap lines,
//                and the worst-offender cells.
//     cells    — every name-bearing cell: size, padding, names-area box,
//                clippedPx (pixels cut by overflow-hidden), and per-row chip
//                detail (full detail only where something is wrong; healthy
//                rows keep one sample chip to stay compact).

(() => {
  "use strict";
  const R = (n) => Math.round(n * 10) / 10;
  // Project breakpoints: Tailwind defaults + xs2/3xl from packages/web/src/index.css
  const BP = { xs2: 420, sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536, "3xl": 1920 };

  // ── Environment: everything that decides which styles are active ──
  const active = Object.entries(BP)
    .filter(([, px]) => innerWidth >= px)
    .map(([k]) => k);
  const env = {
    href: location.href,
    cssViewport: { w: innerWidth, h: innerHeight },
    screen: { w: screen.width, h: screen.height, avail: [screen.availWidth, screen.availHeight] },
    devicePixelRatio: devicePixelRatio,
    pinchZoom: window.visualViewport ? visualViewport.scale : null,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    tailwindActive: active.length ? active : ["base"],
    effectiveTier: active[active.length - 1] || "base",
    ua: navigator.userAgent,
  };

  const grids = [...document.querySelectorAll(".grid-cols-7.grid-rows-6")].filter(
    (g) => g.getClientRects().length > 0,
  );
  if (!grids.length) {
    console.warn("No calendar grid found — open the calendar view (with names visible) first.");
    return;
  }

  // Count wrapped lines from chip y-offsets (>3px apart = new line)
  const lineCount = (tops) => {
    const s = [...tops].sort((a, b) => a - b);
    let lines = s.length ? 1 : 0;
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 3) lines++;
    return lines;
  };

  const gridReports = grids.map((grid) => {
    const gr = grid.getBoundingClientRect();
    const gcs = getComputedStyle(grid);
    const children = [...grid.children];
    const cellReports = [];
    let chipCss = null;

    children.forEach((cell, idx) => {
      if (cell.tagName !== "BUTTON") return;
      const cr = cell.getBoundingClientRect();
      const day = ((cell.getAttribute("aria-label") || "").match(/^\d+/) || ["?"])[0];
      const base = {
        day,
        col: (idx % 7) + 1,
        row: Math.floor(idx / 7) + 1,
        w: R(cr.width),
        h: R(cr.height),
      };
      const wrap = cell.querySelector(":scope > div.overflow-hidden"); // DayLabels root
      if (!wrap) {
        cellReports.push(base);
        return;
      }

      const wr = wrap.getBoundingClientRect();
      const rows = [...wrap.children].map((rowEl) => {
        const chips = [...rowEl.children].filter((c) => c.matches("span[title]"));
        const rcs = getComputedStyle(rowEl);
        const detail = chips.map((chip) => {
          const inner = chip.querySelector(".truncate");
          const chr = chip.getBoundingClientRect();
          const [name, status] = (chip.getAttribute("title") || "").split(" — ");
          return {
            name,
            status: status || "?",
            w: R(chr.width),
            h: R(chr.height),
            top: R(chr.top - wr.top),
            left: R(chr.left - wr.left),
            truncated:
              (inner && inner.scrollWidth - inner.clientWidth > 0.5) ||
              chip.scrollWidth - chip.clientWidth > 0.5,
            clipped: chr.bottom - wr.bottom > 0.5 || chr.right - wr.right > 0.5,
            fullyHidden: chr.top - wr.bottom > -0.5,
          };
        });
        if (!chipCss && chips[0]) {
          const c0 = getComputedStyle(chips[0]);
          const d0 = chips[0].firstElementChild && getComputedStyle(chips[0].firstElementChild);
          chipCss = {
            fontSizePx: parseFloat(c0.fontSize),
            lineHeight: c0.lineHeight,
            fontWeight: c0.fontWeight,
            chipInnerGap: c0.gap,
            rowGaps: `${rcs.columnGap} / ${rcs.rowGap}`,
            dotSize: d0 ? `${d0.width} × ${d0.height}` : null,
          };
        }
        return {
          status: detail[0]?.status ?? "?",
          chips: detail.length,
          lines: lineCount(detail.map((c) => c.top)),
          h: R(rowEl.getBoundingClientRect().height),
          detail,
        };
      });

      const clippedPx = Math.max(0, R(wrap.scrollHeight - wrap.clientHeight));
      cellReports.push({
        ...base,
        padding: getComputedStyle(cell).padding,
        names: {
          areaW: R(wr.width),
          areaH: R(wr.height),
          contentH: wrap.scrollHeight,
          clippedPx,
          rows,
        },
      });
    });

    const withNames = cellReports.filter((c) => c.names);
    const chips = withNames.flatMap((c) => c.names.rows.flatMap((r) => r.detail));
    const summary = {
      cells: cellReports.length,
      typicalCell:
        (withNames[0] || cellReports[0]) &&
        `${(withNames[0] || cellReports[0]).w} × ${(withNames[0] || cellReports[0]).h}`,
      cellsWithNames: withNames.length,
      totalNameChips: chips.length,
      truncatedChips: chips.filter((c) => c.truncated).length,
      clippedChips: chips.filter((c) => c.clipped).length,
      fullyHiddenChips: chips.filter((c) => c.fullyHidden).length,
      cellsClippedVertically: withNames.filter((c) => c.names.clippedPx > 0).length,
      maxLinesInARow: Math.max(0, ...withNames.flatMap((c) => c.names.rows.map((r) => r.lines))),
      worst: withNames
        .map((c) => ({
          day: c.day,
          clippedPx: c.names.clippedPx,
          truncated: c.names.rows.reduce(
            (n, r) => n + r.detail.filter((x) => x.truncated).length,
            0,
          ),
        }))
        .filter((c) => c.clippedPx > 0 || c.truncated > 0)
        .sort((a, b) => b.clippedPx - a.clippedPx || b.truncated - a.truncated)
        .slice(0, 8),
    };

    // Keep the paste small: full chip detail only where something is wrong,
    // otherwise one sample chip per row.
    withNames.forEach((c) =>
      c.names.rows.forEach((r) => {
        const bad = r.detail.filter((x) => x.truncated || x.clipped || x.fullyHidden);
        r.detail = bad.length ? bad : r.detail.slice(0, 1);
      }),
    );

    return {
      kind: grid.querySelector("button.aspect-square") ? "compact/mini" : "main",
      rect: { x: R(gr.x), y: R(gr.y), w: R(gr.width), h: R(gr.height) },
      gap: `${gcs.columnGap} / ${gcs.rowGap}`,
      rowHeightsPx: gcs.gridTemplateRows.split(" ").map((v) => R(parseFloat(v))),
      chipCss,
      summary,
      cells: withNames,
    };
  });

  const out = { generatedAt: new Date().toISOString(), env, grids: gridReports };
  console.log("── Calendar layout report ──");
  gridReports.forEach((g) => console.log(`[${g.kind}]`, g.summary));
  const json = JSON.stringify(out);
  try {
    if (typeof copy === "function") copy(json);
    else navigator.clipboard.writeText(json);
    console.log(
      "%c✔ Full report copied to clipboard — paste it back to Claude.",
      "color:#4ade80;font-weight:bold",
    );
  } catch (e) {
    console.warn("Clipboard failed — expand and copy this instead:", out);
  }
  return out;
})();
