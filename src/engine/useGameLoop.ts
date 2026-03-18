import { useCallback, useEffect, useRef } from "react";

export interface GameLoopControls {
  start: () => void;
  stop: () => void;
  pause: () => void;
}

export default function useGameLoop(
  onFrame: (dt: number) => void,
  autoStart = true,
): GameLoopControls {
  const rafId = useRef<number>(0);
  const lastTime = useRef<number>(0);
  const running = useRef(false);
  const callbackRef = useRef(onFrame);
  callbackRef.current = onFrame;

  const loop = useCallback((time: number) => {
    if (!running.current) return;
    const dt = lastTime.current ? (time - lastTime.current) / 1000 : 0;
    lastTime.current = time;
    callbackRef.current(dt);
    rafId.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    lastTime.current = 0;
    rafId.current = requestAnimationFrame(loop);
  }, [loop]);

  const stop = useCallback(() => {
    running.current = false;
    lastTime.current = 0;
    cancelAnimationFrame(rafId.current);
  }, []);

  const pause = useCallback(() => {
    running.current = false;
    cancelAnimationFrame(rafId.current);
  }, []);

  useEffect(() => {
    if (autoStart) start();
    return stop;
  }, [autoStart, start, stop]);

  return { start, stop, pause };
}
