import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import CardPreview from "./CardPreview";
import type { CardFanProps } from "./types";
import { useFanLayout } from "./use-fan-layout";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 25 };

export default function CardFan<T>({
  cards,
  getCardId,
  renderCard,
  renderPreview,
  onCardClick,
  onCardDragEnd,
  disabled = false,
  maxRotation = 15,
  previewDelay = 1400,
}: CardFanProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [previewCard, setPreviewCard] = useState<T | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cards: layout, fanWidth } = useFanLayout(
    cards.length,
    hoveredIndex,
    maxRotation,
    containerWidth,
  );

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  const handlePointerEnter = useCallback(
    (index: number) => {
      if (disabled || draggingIndex !== null) return;
      setHoveredIndex(index);
      clearPreviewTimer();
      if (renderPreview) {
        previewTimerRef.current = setTimeout(() => {
          setPreviewCard(cards[index]);
        }, previewDelay);
      }
    },
    [disabled, draggingIndex, clearPreviewTimer, renderPreview, cards, previewDelay],
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredIndex(null);
    clearPreviewTimer();
  }, [clearPreviewTimer]);

  const closePreview = useCallback(() => {
    setPreviewCard(null);
    setHoveredIndex(null);
    clearPreviewTimer();
  }, [clearPreviewTimer]);

  const handlePointerDown = useCallback(() => {
    didDragRef.current = false;
  }, []);

  const handleDragStart = useCallback(
    (index: number) => {
      setDraggingIndex(index);
      clearPreviewTimer();
      setPreviewCard(null);
    },
    [clearPreviewTimer],
  );

  const handleDrag = useCallback(() => {
    didDragRef.current = true;
  }, []);

  const handleDragEnd = useCallback(
    (index: number, point: { x: number; y: number }) => {
      setDraggingIndex(null);
      if (onCardDragEnd && didDragRef.current) {
        onCardDragEnd(cards[index], point);
      }
    },
    [onCardDragEnd, cards],
  );

  const handleClick = useCallback(
    (index: number) => {
      if (disabled || didDragRef.current) return;
      onCardClick?.(cards[index]);
    },
    [disabled, onCardClick, cards],
  );

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ clipPath: "inset(-200px -200px 0px -200px)" }}
      >
        <div className="relative mx-auto" style={{ width: fanWidth, height: 240 }}>
          <AnimatePresence mode="popLayout">
            {cards.map((card, i) => {
              const pos = layout[i];
              if (!pos) return null;
              const id = getCardId(card);
              const isHovered = hoveredIndex === i;
              const isDragging = draggingIndex === i;

              return (
                <motion.div
                  key={id}
                  className="absolute bottom-0 cursor-grab active:cursor-grabbing"
                  style={{
                    left: pos.x,
                    width: 160,
                    transformOrigin: "bottom center",
                    willChange: "transform",
                  }}
                  animate={{
                    x: pos.hoverX,
                    y: pos.y,
                    rotate: pos.rotation,
                    scale: pos.scale,
                    zIndex: pos.zIndex,
                  }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={SPRING}
                  onPointerDown={handlePointerDown}
                  onPointerEnter={() => handlePointerEnter(i)}
                  onPointerLeave={handlePointerLeave}
                  onClick={() => handleClick(i)}
                  drag={!disabled}
                  dragSnapToOrigin
                  dragMomentum={false}
                  whileDrag={{ scale: 1.1, zIndex: 100, rotate: 0 }}
                  onDragStart={() => handleDragStart(i)}
                  onDrag={handleDrag}
                  onDragEnd={(_, info) => handleDragEnd(i, info.point)}
                >
                  {renderCard(card, { isHovered, isDragging })}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {renderPreview && (
        <CardPreview onClose={closePreview}>
          {previewCard ? renderPreview(previewCard) : null}
        </CardPreview>
      )}
    </>
  );
}
