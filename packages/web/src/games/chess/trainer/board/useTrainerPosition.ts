/**
 * Where the board stands, kept in the URL so a link or a reload lands on the
 * same position: `?side=w&line=e2e4.c7c5.c2c3&ply=2` — the colour whose tree
 * is open, the line of moves on the board, and how far along it you are (the
 * end when absent). Stepping back keeps the rest of the line for ▶.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { type LineStep, type Position, START, walkLine } from "./model";

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export interface TrainerPosition {
  readonly color: "w" | "b";
  /** Every move of the line (legal ones only). */
  readonly line: readonly LineStep[];
  /** Moves played to reach the shown position. */
  readonly ply: number;
  readonly here: Position;
  /** The move that led here, if any. */
  readonly last: LineStep | null;
  readonly setColor: (color: "w" | "b") => void;
  /** Play a move from the shown position (follows the line when it's the next move). */
  readonly play: (uci: string) => void;
  /** Play several moves from the shown position (an engine line). */
  readonly playLine: (ucis: readonly string[]) => void;
  readonly goTo: (ply: number) => void;
  /** One move back (-1) or forward (+1) — from the latest position, so quick presses all count. */
  readonly step: (delta: -1 | 1) => void;
  /** Open a saved line (or a colour's start) at its end. */
  readonly open: (color: "w" | "b", moves: readonly string[]) => void;
}

export function useTrainerPosition(): TrainerPosition {
  const [params, setParams] = useSearchParams();
  const color = params.get("side") === "b" ? "b" : "w";
  const raw = params.get("line") ?? "";
  const line = useMemo(() => walkLine(raw.split(".").filter((u) => UCI.test(u))), [raw]);
  const plyParam = params.get("ply");
  const ply = Math.min(
    line.length,
    Math.max(0, plyParam === null ? line.length : Number(plyParam) || 0),
  );

  const write = useCallback(
    (next: { color?: "w" | "b"; moves?: readonly string[]; ply?: number | null }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.color) p.set("side", next.color);
          if (next.moves) {
            if (next.moves.length > 0) p.set("line", next.moves.join("."));
            else p.delete("line");
          }
          if (next.ply === null) p.delete("ply");
          else if (next.ply !== undefined) p.set("ply", String(next.ply));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const ucis = useMemo(() => line.map((s) => s.uci), [line]);

  const play = useCallback(
    (uci: string) => {
      if (ucis[ply] === uci) {
        write({ ply: ply + 1 === ucis.length ? null : ply + 1 });
        return;
      }
      write({ moves: [...ucis.slice(0, ply), uci], ply: null });
    },
    [ucis, ply, write],
  );

  const playLine = useCallback(
    (more: readonly string[]) => write({ moves: [...ucis.slice(0, ply), ...more], ply: null }),
    [ucis, ply, write],
  );

  const goTo = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(ucis.length, to));
      write({ ply: clamped === ucis.length ? null : clamped });
    },
    [ucis.length, write],
  );

  const step = useCallback(
    (delta: -1 | 1) => {
      setParams(
        () => {
          // The address bar, not the router's last render: two quick presses
          // must see each other (the router hands both the same `prev`).
          const p = new URLSearchParams(window.location.search);
          const total = walkLine(
            (p.get("line") ?? "").split(".").filter((u) => UCI.test(u)),
          ).length;
          const at = p.get("ply");
          const cur = Math.min(total, Math.max(0, at === null ? total : Number(at) || 0));
          const next = Math.max(0, Math.min(total, cur + delta));
          if (next === total) p.delete("ply");
          else p.set("ply", String(next));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setColor = useCallback((c: "w" | "b") => write({ color: c }), [write]);
  const open = useCallback(
    (c: "w" | "b", moves: readonly string[]) => write({ color: c, moves, ply: null }),
    [write],
  );

  const last = ply > 0 ? (line[ply - 1] ?? null) : null;
  return {
    color,
    line,
    ply,
    here: last ?? START,
    last,
    setColor,
    play,
    playLine,
    goTo,
    step,
    open,
  };
}
