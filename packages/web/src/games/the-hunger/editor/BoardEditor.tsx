import {
  type BoardProblem,
  boardProblems,
  PATHS,
  REGIONS,
  SPACE_EFFECTS,
  tidyIds,
} from "@boardgames/core/games/the-hunger/content/board-schema";
import type {
  BoardDef,
  PathKind,
  Region,
  SpaceDef,
  SpaceEffect,
} from "@boardgames/core/games/the-hunger/types";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Button,
  Checkbox,
  Eyebrow,
  Input,
  MicroLabel,
  SegmentedControl,
  Select,
  Surface,
} from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { boardImage, PATH_STROKE, REGION_FILL } from "../components/board/geometry";
import { EFFECT_GLYPH } from "../logic/labels";
import {
  addSpace,
  type Draft,
  emptyBoard,
  removeSpace,
  renameSpace,
  toFile,
  toggleEdge,
  updateSpace,
} from "./board-model";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Side B is side A's map without the Mountain penalties (core content/boards.ts). */
type Side = "A";
const side: Side = "A";
type Mode = "place" | "connect" | "move";

const EFFECT_NAME: Record<SpaceEffect, string> = {
  none: "Path (no effect)",
  well: "Well",
  chest: "Chest (face down)",
  "chest-open": "Chest (open, face up)",
  crypt: "Crypt (Missions)",
  market: "Market · digest a Villager",
  church: "Church · digest a Religious",
  mansion: "Mansion · digest a Noble",
  barracks: "Barracks · digest a Military",
  ship: "Ship (no hunting)",
  tavern: "Tavern",
  castle: "Castle",
  cemetery: "Cemetery",
  labyrinth: "Labyrinth (Roses)",
};

/** Keyboard: set the brush (and retype the selected space). */
const EFFECT_KEYS: Partial<Record<string, SpaceEffect>> = {
  "1": "none",
  "2": "well",
  "3": "chest",
  "4": "chest-open",
  "5": "crypt",
  "6": "market",
  "7": "church",
  "8": "mansion",
  "9": "barracks",
  "0": "ship",
  t: "tavern",
};
const REGION_KEYS: Partial<Record<string, Region>> = {
  a: "mountains",
  s: "plains",
  d: "forest",
  f: "cemetery",
};
const PATH_KEYS: Partial<Record<string, PathKind | null>> = {
  q: "road",
  w: "rail",
  e: "boat",
  x: null,
};
const KEY_OF = (map: Record<string, unknown>, value: unknown) =>
  Object.entries(map).find(([, v]) => v === value)?.[0];

interface Brush {
  effect: SpaceEffect;
  region: Region;
  path: PathKind | null;
  mountainPenalty?: number;
}

/** A Castle / Labyrinth / Cemetery sits in its own region with no path. */
function normalise(space: Omit<SpaceDef, "id">): Omit<SpaceDef, "id"> {
  if (space.effect === "castle") return { ...space, region: "castle", path: null };
  if (space.effect === "cemetery") return { ...space, region: "cemetery", path: null };
  if (space.effect === "labyrinth") return { ...space, path: null };
  return space;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

interface History {
  board: Draft | null;
  past: Draft[];
  future: Draft[];
}

type HistoryAction =
  | { type: "load"; board: Draft }
  | { type: "edit"; board: Draft }
  /** A drag in progress: replaces the present without a new undo step. */
  | { type: "live"; board: Draft }
  | { type: "undo" }
  | { type: "redo" };

function history(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "load":
      return { board: action.board, past: [], future: [] };
    case "edit":
      if (!state.board || action.board === state.board) return state;
      return { board: action.board, past: [...state.past.slice(-199), state.board], future: [] };
    case "live":
      return { ...state, board: action.board };
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev || !state.board) return state;
      return { board: prev, past: state.past.slice(0, -1), future: [state.board, ...state.future] };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next || !state.board) return state;
      return { board: next, past: [...state.past, state.board], future: rest };
    }
  }
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const endpoint = (side: Side, draft = false) =>
  `/__dev/hunger-board/${side.toLowerCase()}${draft ? "/draft" : ""}`;

/**
 * Dev tool: map a printed board side by clicking its spaces on the board
 * image. Drafts autosave to `content/boards/board-x.draft.json`; Publish
 * writes the `board-x.json` the game plays on, once nothing is broken.
 */
export default function BoardEditor() {
  const [mode, setMode] = useState<Mode>("place");
  const [brush, setBrush] = useState<Brush>({ effect: "none", region: "mountains", path: "road" });
  const [{ board, past, future }, dispatch] = useReducer(history, {
    board: null,
    past: [],
    future: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  /** What the dev server returned for the side: a fresh map starts once the image size is known. */
  const [loaded, setLoaded] = useState<{ side: Side; provisional: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);

  const image = localImage ?? boardImage(side);

  // Load the side's draft (or its published board) from the dev server.
  useEffect(() => {
    let cancelled = false;
    setStatus("Loading…");
    setSelected(null);
    setConnectFrom(null);
    setLoaded(null);
    fetch(endpoint(side))
      .then(
        (r) =>
          r.json() as Promise<{ board: BoardDef & { spaces: SpaceDef[] }; fromDraft: boolean }>,
      )
      .then(({ board: file, fromDraft }) => {
        if (cancelled) return;
        setLoaded({ side, provisional: Boolean(file.provisional) });
        setStatus(
          file.provisional
            ? "The published board is a stand-in: starting a fresh map."
            : fromDraft
              ? "Loaded your draft."
              : "Loaded the published board.",
        );
        if (!file.provisional) {
          const edges = file.edges.map(([a, b]): [string, string] => [a, b]);
          dispatch({ type: "load", board: { ...file, spaces: [...file.spaces], edges } });
        }
      })
      .catch(() => !cancelled && setStatus("Could not reach the dev server endpoint."));
    return () => {
      cancelled = true;
    };
  }, []);

  // A fresh map takes the image's own size as its coordinate space.
  useEffect(() => {
    if (!natural || !loaded || loaded.side !== side || !loaded.provisional) return;
    if (!board || board.side !== side) {
      dispatch({ type: "load", board: emptyBoard(side, natural.width, natural.height) });
    }
  }, [natural, loaded, board]);

  // Autosave the draft.
  useEffect(() => {
    if (!board || past.length === 0) return;
    const t = setTimeout(() => {
      fetch(endpoint(side, true), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toFile(board)),
      })
        .then((r) =>
          setStatus(r.ok ? `Draft saved · ${board.spaces.length} spaces` : "Draft save failed"),
        )
        .catch(() => setStatus("Draft save failed"));
    }, 600);
    return () => clearTimeout(t);
  }, [board, past.length]);

  const problems = useMemo(() => (board ? boardProblems(toFile(board)) : []), [board]);
  const problemSpaces = useMemo(
    () => new Set(problems.filter((p) => p.level === "error" && p.space).map((p) => p.space)),
    [problems],
  );
  const errors = problems.filter((p) => p.level === "error");
  const selectedSpace = board?.spaces.find((s) => s.id === selected) ?? null;

  const edit = useCallback((next: Draft) => dispatch({ type: "edit", board: next }), []);

  const toPoint = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const onBackground = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!board) return;
    if (mode !== "place") {
      setConnectFrom(null);
      setSelected(null);
      return;
    }
    const at = toPoint(e);
    if (!at) return;
    const space = normalise({ ...brush, ...at });
    const { board: next, id } = addSpace(board, space);
    edit(next);
    setSelected(id);
    // Placing along a path: connect to the space placed before, if asked.
    if (e.shiftKey && selected) edit(toggleEdge(next, selected, id));
  };

  const onSpaceDown = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    if (!board) return;
    if (mode === "connect" || (mode === "place" && e.shiftKey && selected && selected !== id)) {
      const from = mode === "connect" ? connectFrom : selected;
      if (from && from !== id) edit(toggleEdge(board, from, id));
      setConnectFrom(id);
      setSelected(id);
      return;
    }
    setSelected(id);
    if (mode === "move") {
      drag.current = { id, moved: false };
      svgRef.current?.setPointerCapture(e.pointerId);
      edit({ ...board });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current || !board) return;
    const at = toPoint(e);
    if (!at) return;
    drag.current.moved = true;
    dispatch({ type: "live", board: updateSpace(board, drag.current.id, at) });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const applyBrush = (patch: Partial<Brush>) => {
    setBrush((b) => ({ ...b, ...patch }));
    if (board && selectedSpace) {
      edit(updateSpace(board, selectedSpace.id, normalise({ ...selectedSpace, ...patch })));
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === "escape") {
        setConnectFrom(null);
        setSelected(null);
      } else if ((key === "delete" || key === "backspace") && board && selected) {
        edit(removeSpace(board, selected));
        setSelected(null);
        setConnectFrom(null);
      } else if (key === "p") setMode("place");
      else if (key === "c") setMode("connect");
      else if (key === "v") setMode("move");
      else if (EFFECT_KEYS[key]) applyBrush({ effect: EFFECT_KEYS[key] });
      else if (REGION_KEYS[key]) applyBrush({ region: REGION_KEYS[key] });
      else if (key in PATH_KEYS) applyBrush({ path: PATH_KEYS[key] ?? null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const publish = async () => {
    if (!board) return;
    const r = await fetch(endpoint(side), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toFile(board)),
    });
    const body = (await r.json()) as { error?: string };
    setStatus(
      r.ok ? `Published board ${side} — the game now plays on it.` : `Not published: ${body.error}`,
    );
  };

  const download = () => {
    if (!board) return;
    const blob = new Blob([`${JSON.stringify(toFile(board), null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-${side.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const byId = new Map(board?.spaces.map((s) => [s.id, s]) ?? []);
  const W = board?.width ?? natural?.width ?? 1000;
  const H = board?.height ?? natural?.height ?? 1000;
  const r = Math.max(8, W / 90);
  const counts = new Map<SpaceEffect, number>();
  for (const s of board?.spaces ?? []) counts.set(s.effect, (counts.get(s.effect) ?? 0) + 1);
  const sizeMismatch =
    board && natural && (board.width !== natural.width || board.height !== natural.height);

  return (
    <div className="flex h-dvh min-h-0 bg-surface-950 text-fg-primary">
      {/* Canvas */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2">
        {!image ? (
          <Surface variant="panel" padding="lg" className="m-8 max-w-lg">
            <p className="text-sm">
              No image for side {side} yet. Add <code>assets/board-{side.toLowerCase()}.webp</code>{" "}
              or pick an image below to map from (it is not saved).
            </p>
          </Surface>
        ) : (
          <div className="relative" style={{ width: `${zoom * 100}%`, aspectRatio: `${W} / ${H}` }}>
            <img
              src={image}
              alt={`Board side ${side}`}
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
              ref={(el) => {
                // A cached image can finish before React attaches onLoad.
                if (el?.complete && el.naturalWidth > 0 && !natural) {
                  setNatural({ width: el.naturalWidth, height: el.naturalHeight });
                }
              }}
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
            {board && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className={cn(
                  "absolute inset-0 h-full w-full",
                  mode === "place"
                    ? "cursor-crosshair"
                    : mode === "move"
                      ? "cursor-move"
                      : "cursor-pointer",
                )}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                role="application"
                aria-label="Board mapping surface"
              >
                <rect
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  fill="transparent"
                  onPointerDown={onBackground}
                />
                <g pointerEvents="none">
                  {board.edges.map(([a, b]) => {
                    const sa = byId.get(a);
                    const sb = byId.get(b);
                    if (!sa || !sb) return null;
                    const stroke = PATH_STROKE[sa.path ?? sb.path ?? "road"];
                    return (
                      <line
                        key={`${a}|${b}`}
                        x1={sa.x}
                        y1={sa.y}
                        x2={sb.x}
                        y2={sb.y}
                        stroke={stroke.color}
                        strokeWidth={r / 3}
                        strokeDasharray={stroke.dash}
                        strokeLinecap="round"
                        opacity={0.9}
                      />
                    );
                  })}
                </g>
                {board.spaces.map((s) => {
                  const isSel = s.id === selected;
                  const isFrom = s.id === connectFrom && mode !== "move";
                  const bad = problemSpaces.has(s.id);
                  return (
                    <g
                      key={s.id}
                      onPointerDown={(e) => onSpaceDown(e, s.id)}
                      style={{ cursor: mode === "move" ? "grab" : "pointer" }}
                    >
                      <title>
                        {s.id} · {EFFECT_NAME[s.effect]} · {s.region}
                        {s.path ? ` · ${s.path}` : ""}
                      </title>
                      {(isSel || isFrom || bad) && (
                        <circle
                          cx={s.x}
                          cy={s.y}
                          r={r * 1.6}
                          fill="none"
                          stroke={bad ? "#f43f5e" : isFrom ? "#22d3ee" : "#fde047"}
                          strokeWidth={r / 4}
                          strokeDasharray={bad && !isSel ? `${r / 2} ${r / 3}` : undefined}
                        />
                      )}
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={r}
                        fill={REGION_FILL[s.region]}
                        fillOpacity={0.85}
                        stroke={s.path ? PATH_STROKE[s.path].color : "#f5f5f5"}
                        strokeWidth={r / 3.5}
                      />
                      <text
                        x={s.x}
                        y={s.y + r / 2.8}
                        textAnchor="middle"
                        fontSize={r}
                        pointerEvents="none"
                      >
                        {EFFECT_GLYPH[s.effect] || "·"}
                      </text>
                      {s.mountainPenalty ? (
                        <text
                          x={s.x}
                          y={s.y - r * 1.25}
                          textAnchor="middle"
                          fontSize={r * 0.9}
                          fontWeight={700}
                          fill="#fca5a5"
                          stroke="#1a0f14"
                          strokeWidth={r / 6}
                          paintOrder="stroke"
                          pointerEvents="none"
                        >
                          −{s.mountainPenalty}
                        </text>
                      ) : null}
                      {showLabels && (
                        <text
                          x={s.x}
                          y={s.y + r * 2.1}
                          textAnchor="middle"
                          fontSize={r * 0.75}
                          fill="#fff"
                          stroke="#120c16"
                          strokeWidth={r / 6}
                          paintOrder="stroke"
                          pointerEvents="none"
                        >
                          {s.id}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Side panel */}
      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow size="sm">The Hunger · board editor</Eyebrow>
          <span className="text-fg-muted">Side A</span>
        </div>
        <p className="text-fg-muted">
          Side B (Elder) is derived: the same map, with any Mountain sunrise penalties dropped.
        </p>
        <p className="text-fg-muted">{status}</p>
        {sizeMismatch && (
          <p className="text-amber-300">
            The board file is {board?.width}×{board?.height} but this image is {natural?.width}×
            {natural?.height}: coordinates will not line up.
          </p>
        )}

        <section className="flex flex-col gap-1.5">
          <MicroLabel>Tool</MicroLabel>
          <SegmentedControl
            aria-label="Tool"
            size="xs"
            fullWidth
            options={[
              {
                value: "place",
                label: "Place (P)",
                title: "Click to add a space; Shift-click to chain",
              },
              {
                value: "connect",
                label: "Connect (C)",
                title: "Click two spaces to (dis)connect them",
              },
              { value: "move", label: "Move (V)", title: "Drag spaces" },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setConnectFrom(null);
            }}
          />
          <p className="text-fg-muted">
            {mode === "place"
              ? "Click the board to add a space with the brush below. Shift-click adds it connected to the selected space — trace a path in one go. Keys retype the selected space."
              : mode === "connect"
                ? "Click a space, then the next along the path: each click links it to the previous one (click an existing link to remove it). Esc starts a new chain."
                : "Drag a space to fine-tune its position."}
          </p>
        </section>

        <section className="flex flex-col gap-1.5">
          <MicroLabel>
            {selectedSpace ? `Space ${selectedSpace.id}` : "Brush for new spaces"}
          </MicroLabel>
          <SpaceFields value={selectedSpace ?? brush} onChange={applyBrush} />
          {selectedSpace && board && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-12 text-fg-muted">Id</span>
                <Input
                  aria-label="Space id"
                  key={selectedSpace.id}
                  defaultValue={selectedSpace.id}
                  onBlur={(e) => {
                    const next = renameSpace(board, selectedSpace.id, e.target.value);
                    if (next !== board) {
                      edit(next);
                      setSelected(e.target.value.trim());
                    }
                  }}
                />
              </div>
              <span className="text-fg-muted">
                ({selectedSpace.x}, {selectedSpace.y}) ·{" "}
                {board.edges.filter((e) => e.includes(selectedSpace.id)).length} connection(s)
              </span>
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant="danger"
                  onClick={() => {
                    edit(removeSpace(board, selectedSpace.id));
                    setSelected(null);
                  }}
                >
                  Delete (Del)
                </Button>
                <Button size="xs" variant="secondary" onClick={() => setSelected(null)}>
                  Deselect (Esc)
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <MicroLabel>
            Checks · {errors.length} error{errors.length === 1 ? "" : "s"},{" "}
            {problems.length - errors.length} warning
            {problems.length - errors.length === 1 ? "" : "s"}
          </MicroLabel>
          {!board && <span className="text-fg-muted">No board loaded yet.</span>}
          {board && problems.length === 0 && (
            <span className="text-emerald-300">Ready to publish.</span>
          )}
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {problems.map((p) => (
              <ProblemLine
                key={`${p.message}-${p.space ?? ""}`}
                problem={p}
                onSelect={setSelected}
              />
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-1.5">
          <MicroLabel>Board</MicroLabel>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="secondary"
              disabled={past.length === 0}
              onClick={() => dispatch({ type: "undo" })}
            >
              Undo
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={future.length === 0}
              onClick={() => dispatch({ type: "redo" })}
            >
              Redo
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={!board}
              title="castle and labyrinth by role, every other space region-N, numbered outward from the Castle"
              onClick={() => {
                if (!board) return;
                const tidy = tidyIds(toFile(board));
                edit({
                  ...tidy,
                  spaces: [...tidy.spaces],
                  edges: tidy.edges.map(([a, b]): [string, string] => [a, b]),
                });
                setSelected(null);
                setConnectFrom(null);
              }}
            >
              Tidy ids
            </Button>
            <Button size="xs" variant="secondary" onClick={download} disabled={!board}>
              Download JSON
            </Button>
            <Button
              size="xs"
              variant="success"
              onClick={publish}
              disabled={!board || errors.length > 0}
            >
              Publish to the game
            </Button>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-fg-muted">Zoom</span>
            {/* biome-ignore lint/correctness/noRestrictedElements: range slider, no primitive yet */}
            <input
              type="range"
              min={1}
              max={4}
              step={0.25}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 tabular-nums">{zoom}×</span>
          </label>
          <Checkbox
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            label="Show space ids"
          />
          <label className="flex flex-col gap-1">
            <span className="text-fg-muted">Map from a local image instead (not saved)</span>
            {/* biome-ignore lint/correctness/noRestrictedElements: native file picker, no primitive yet */}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setLocalImage(URL.createObjectURL(file));
              }}
            />
          </label>
        </section>

        <section className="flex flex-col gap-1">
          <MicroLabel>
            On the board · {board?.spaces.length ?? 0} spaces, {board?.edges.length ?? 0} links
          </MicroLabel>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {SPACE_EFFECTS.map((e) => (
              <span key={e} className={cn(!counts.get(e) && "text-fg-disabled")}>
                {EFFECT_GLYPH[e] || "·"} {EFFECT_NAME[e].split(" ·")[0]}: {counts.get(e) ?? 0}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-1 text-fg-muted">
          <MicroLabel>Keys</MicroLabel>
          <span>
            P / C / V — place, connect, move · Del — delete · Esc — deselect · Ctrl+Z — undo
          </span>
          <span>
            Type:{" "}
            {Object.entries(EFFECT_KEYS)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ")}
          </span>
          <span>Region: A mountains · S plains · D forest · F cemetery</span>
          <span>Path: Q road · W rail · E boat · X none</span>
          <span>Fill = region · ring = path (brown road, dashed grey rail, dotted blue boat)</span>
        </section>
      </aside>
    </div>
  );
}

function SpaceFields({
  value,
  onChange,
}: {
  value: Brush;
  onChange: (patch: Partial<Brush>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-12 text-fg-muted">Type</span>
        <Select
          size="sm"
          block
          aria-label="Space type"
          value={value.effect}
          onChange={(e) => onChange({ effect: e.target.value as SpaceEffect })}
        >
          {SPACE_EFFECTS.map((e) => (
            <option key={e} value={e}>
              {EFFECT_NAME[e]}
              {KEY_OF(EFFECT_KEYS, e) ? `  [${KEY_OF(EFFECT_KEYS, e)}]` : ""}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-fg-muted">Region</span>
        <Select
          size="sm"
          block
          aria-label="Region"
          value={value.region}
          onChange={(e) => onChange({ region: e.target.value as Region })}
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
              {KEY_OF(REGION_KEYS, r) ? `  [${KEY_OF(REGION_KEYS, r)?.toUpperCase()}]` : ""}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-fg-muted">Path</span>
        <Select
          size="sm"
          block
          aria-label="Path"
          value={value.path ?? ""}
          onChange={(e) => onChange({ path: (e.target.value || null) as PathKind | null })}
        >
          <option value="">none (Castle, Cemetery, Labyrinth) [X]</option>
          {PATHS.map((p) => (
            <option key={p} value={p}>
              {p === "rail" ? "railroad" : p} [{KEY_OF(PATH_KEYS, p)?.toUpperCase()}]
            </option>
          ))}
        </Select>
      </div>
      {value.region === "mountains" && (
        <div className="flex items-center gap-2">
          <span className="w-12 text-fg-muted">Sunrise</span>
          <Input
            aria-label="Rookie sunrise penalty"
            type="number"
            min={0}
            placeholder="Rookie penalty, e.g. 5"
            value={value.mountainPenalty ?? ""}
            onChange={(e) =>
              onChange({
                mountainPenalty: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ProblemLine({
  problem,
  onSelect,
}: {
  problem: BoardProblem;
  onSelect: (id: string) => void;
}) {
  const tone = problem.level === "error" ? "text-rose-300" : "text-amber-300";
  if (!problem.space) return <li className={tone}>{problem.message}</li>;
  const space = problem.space;
  return (
    <li>
      <Button variant="link" size="xs" className={tone} onClick={() => onSelect(space)}>
        {problem.message}
      </Button>
    </li>
  );
}
