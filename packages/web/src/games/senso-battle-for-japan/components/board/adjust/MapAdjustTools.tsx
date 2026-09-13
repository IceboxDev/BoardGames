import { regionLabel } from "@boardgames/core/games/senso-battle-for-japan/types";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../../../components/ui/Button.tsx";
import { MicroLabel } from "../../../../../components/ui/Label.tsx";
import { type MapLayout, type NodeLayout, stockNodeSize } from "../geometry";
import { clampScale, type MapAdjust } from "./use-map-placements";

// Dev-only placement tooling for the Sensō map (`?adjust` in the URL).
//
// Inside the SVG, every region card gets a drag surface (move), a corner
// handle (uniform resize) and a flip button (column ⇄ row). A floating
// panel outside the SVG shows the selected card's numbers, scales every
// card at once, resets, and copies the placements as the TypeScript literal
// to paste into geometry.ts. Keyboard on the selected card: arrows nudge
// (Shift = ×10), [ and ] resize, R flips, Escape deselects.
//
// Pointer positions are converted to viewBox units through the SVG's own
// screen matrix, so dragging is exact whatever the surface's on-screen size.

const HANDLE = 10;
const ACCENT = "#22d3ee";
const ACCENT_SOFT = "rgba(34, 211, 238, 0.18)";

interface Props {
  layout: MapLayout;
  adjust: MapAdjust;
}

function toBoard(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function ownerSvg(e: ReactPointerEvent<SVGElement>): SVGSVGElement | null {
  return (e.currentTarget as SVGGraphicsElement).ownerSVGElement;
}

/**
 * Route the rest of the gesture to `target` even when the pointer leaves it.
 * Capture is best-effort: a synthetic pointer (tests) has no active id and
 * throws, and the listeners below still work because the events are
 * dispatched to the element directly.
 */
function track(target: SVGElement, pointerId: number, onMove: (ev: PointerEvent) => void): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // no active pointer — synthetic events
  }
  const up = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}

export default function MapAdjustTools({ layout, adjust }: Props) {
  const { selected, select, update, scaleAll, reset, source } = adjust;

  // Keyboard nudges on the selected card.
  useEffect(() => {
    if (selected === null) return;
    const p = adjust.placements[selected];
    if (!p) return;
    function onKey(e: KeyboardEvent) {
      if (selected === null || !p) return;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "ArrowLeft":
          update(selected, { x: p.x - step });
          break;
        case "ArrowRight":
          update(selected, { x: p.x + step });
          break;
        case "ArrowUp":
          update(selected, { y: p.y - step });
          break;
        case "ArrowDown":
          update(selected, { y: p.y + step });
          break;
        case "[":
          update(selected, { scale: clampScale(p.scale - 0.05) });
          break;
        case "]":
          update(selected, { scale: clampScale(p.scale + 0.05) });
          break;
        case "r":
        case "R":
          update(selected, { arrangement: p.arrangement === "column" ? "row" : "column" });
          break;
        case "Escape":
          select(null);
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, adjust.placements, update, select]);

  return (
    <>
      <g data-layer="adjust">
        {layout.nodes.map((node) => (
          <AdjustHandle
            key={node.region}
            node={node}
            selected={selected === node.region}
            onSelect={() => select(node.region)}
            onMove={(x, y) => update(node.region, { x, y })}
            onScale={(scale) => update(node.region, { scale })}
            onFlip={() =>
              update(node.region, {
                arrangement: node.placement.arrangement === "column" ? "row" : "column",
              })
            }
          />
        ))}
      </g>
      {createPortal(
        <AdjustPanel
          adjust={adjust}
          onScaleAll={scaleAll}
          onReset={reset}
          source={source}
          selectedNode={selected === null ? null : (layout.nodes[selected] ?? null)}
        />,
        document.body,
      )}
    </>
  );
}

function AdjustHandle({
  node,
  selected,
  onSelect,
  onMove,
  onScale,
  onFlip,
}: {
  node: NodeLayout;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onScale: (scale: number) => void;
  onFlip: () => void;
}) {
  const { bounds, placement } = node;
  const stock = stockNodeSize(node.squares.length, placement.arrangement);

  const startDrag = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      e.stopPropagation();
      onSelect();
      const svg = ownerSvg(e);
      if (!svg) return;
      const origin = toBoard(svg, e.clientX, e.clientY);
      const start = { x: placement.x, y: placement.y };
      track(e.currentTarget, e.pointerId, (ev) => {
        const p = toBoard(svg, ev.clientX, ev.clientY);
        onMove(start.x + (p.x - origin.x), start.y + (p.y - origin.y));
      });
    },
    [onSelect, onMove, placement.x, placement.y],
  );

  const startResize = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      e.stopPropagation();
      onSelect();
      const svg = ownerSvg(e);
      if (!svg) return;
      track(e.currentTarget, e.pointerId, (ev) => {
        const p = toBoard(svg, ev.clientX, ev.clientY);
        // The corner follows the pointer: the diagonal from the card's origin
        // sets the scale, so the card grows toward wherever the hand goes.
        const dx = Math.max(1, p.x - placement.x);
        const dy = Math.max(1, p.y - placement.y);
        onScale(clampScale(Math.max(dx / stock.w, dy / stock.h)));
      });
    },
    [onSelect, onScale, placement.x, placement.y, stock.w, stock.h],
  );

  const label = regionLabel(node.region);
  const flipX = bounds.x + bounds.w - HANDLE;
  const flipY = bounds.y - HANDLE - 2;

  return (
    <g data-adjust-region={node.region}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        rx={4}
        fill={selected ? ACCENT_SOFT : "transparent"}
        stroke={ACCENT}
        strokeWidth={selected ? 2 : 1}
        strokeDasharray={selected ? undefined : "4 3"}
        style={{ cursor: "move" }}
        onPointerDown={startDrag}
      >
        <title>{`Region ${label}: drag to move`}</title>
      </rect>
      <rect
        x={bounds.x + bounds.w - HANDLE / 2}
        y={bounds.y + bounds.h - HANDLE / 2}
        width={HANDLE}
        height={HANDLE}
        fill={ACCENT}
        stroke="#0b1220"
        strokeWidth={1}
        style={{ cursor: "nwse-resize" }}
        onPointerDown={startResize}
      >
        <title>Drag to resize</title>
      </rect>
      <g
        style={{ cursor: "pointer" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onFlip();
        }}
      >
        <title>Flip column ⇄ row</title>
        <rect
          x={flipX - HANDLE / 2}
          y={flipY - HANDLE / 2}
          width={HANDLE + 4}
          height={HANDLE + 2}
          rx={2}
          fill="#0b1220"
          stroke={ACCENT}
          strokeWidth={1}
        />
        <text
          x={flipX + 2}
          y={flipY + 1}
          fontSize={9}
          fontWeight={700}
          fill={ACCENT}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          ⇄
        </text>
      </g>
      <text
        x={bounds.x}
        y={bounds.y + bounds.h + 11}
        fontSize={8}
        fontWeight={700}
        fill={ACCENT}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {label} · {placement.x},{placement.y} · ×{placement.scale}
      </text>
    </g>
  );
}

function AdjustPanel({
  adjust,
  selectedNode,
  onScaleAll,
  onReset,
  source,
}: {
  adjust: MapAdjust;
  selectedNode: NodeLayout | null;
  onScaleAll: (factor: number) => void;
  onReset: () => void;
  source: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The textarea below stays selectable as the fallback.
    }
    console.log(`[senso adjust] ${adjust.orientation} placements:\n${source}`);
  }, [source, adjust.orientation]);

  const p = selectedNode?.placement ?? null;

  return (
    <div className="fixed bottom-3 left-3 z-takeover w-80 rounded-card-lg border border-line bg-surface-900/95 p-3 text-xs text-fg-primary shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <MicroLabel className="font-semibold text-fg-strong">
          Map adjust · {adjust.orientation}
        </MicroLabel>
        <span className="text-3xs text-fg-muted">?adjust · dev only</span>
      </div>

      <p className="mt-1.5 text-2xs text-fg-secondary">
        Drag a card to move it, its corner to resize, ⇄ to flip squares. Arrows nudge (Shift ×10), [
        ] resize, R flips, Esc deselects.
      </p>

      <div className="mt-2 rounded-card-md bg-fill-soft px-2 py-1.5 font-mono text-2xs text-fg-secondary">
        {selectedNode && p
          ? `Region ${regionLabel(selectedNode.region)} · x ${p.x} · y ${p.y} · scale ${p.scale} · ${p.arrangement}`
          : "Click a card to select it"}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <MicroLabel>All cards</MicroLabel>
        <Button variant="secondary" size="xs" onClick={() => onScaleAll(1 / 1.1)}>
          −10%
        </Button>
        <Button variant="secondary" size="xs" onClick={() => onScaleAll(1.1)}>
          +10%
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onReset}>
          Reset
        </Button>
        <Button size="xs" onClick={copy}>
          {copied ? "Copied" : "Copy TS"}
        </Button>
      </div>

      {/* biome-ignore lint/correctness/noRestrictedElements: dev-only read-only dump of the placements for manual copy when the clipboard API is unavailable */}
      <textarea
        readOnly
        value={source}
        rows={5}
        aria-label="Placements as TypeScript"
        className="mt-2 w-full resize-none rounded-card-md border border-line-soft bg-surface-950/80 p-2 font-mono text-3xs leading-snug text-fg-muted"
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className="mt-1 text-3xs text-fg-muted">
        Paste over the matching const in components/board/geometry.ts. Work in progress is kept in
        localStorage until Reset.
      </p>
    </div>
  );
}
