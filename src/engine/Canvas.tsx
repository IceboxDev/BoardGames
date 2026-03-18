import type { RefObject } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import useGameLoop from "./useGameLoop";

export interface CanvasProps {
  width?: number;
  height?: number;
  autoResize?: boolean;
  onFrame?: (ctx: CanvasRenderingContext2D, dt: number) => void;
  className?: string;
}

export interface CanvasHandle {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
}

const GameCanvas = function GameCanvas({
  width,
  height,
  autoResize = false,
  onFrame,
  className,
  ref,
}: CanvasProps & { ref?: RefObject<CanvasHandle | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useImperativeHandle(ref, () => ({
    get canvas() {
      return canvasRef.current;
    },
    get ctx() {
      return ctxRef.current;
    },
  }));

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (autoResize) {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctxRef.current?.scale(dpr, dpr);
    } else if (width && height) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctxRef.current?.scale(dpr, dpr);
    }
  }, [autoResize, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext("2d");
    resize();
  }, [resize]);

  useEffect(() => {
    if (!autoResize) return;
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [autoResize, resize]);

  useGameLoop((dt) => {
    if (onFrame && ctxRef.current) {
      onFrame(ctxRef.current, dt);
    }
  }, !!onFrame);

  return <canvas ref={canvasRef} className={className} />;
};

export default GameCanvas;
