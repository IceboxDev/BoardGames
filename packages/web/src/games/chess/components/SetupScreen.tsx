import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import { chessManifest } from "@boardgames/core/games/chess/manifest";
import type { TimeControl } from "@boardgames/core/games/chess/schemas";
import { TRAINER_FOLDERS } from "@boardgames/core/games/chess/trainer/folders";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PvAISetupScreen } from "../../../components/setup/PvAISetupScreen";
import { SectionLabel } from "../../../components/setup/SectionLabel";
import { Button, Checkbox, SegmentedControl } from "../../../components/ui";
import { lineText, playLine } from "../analysis/line";
import { lineFromSearch } from "../logic/play-line";
import { readSetup, saveSetup } from "../logic/preferences";
import { currentFolder, flatten } from "../trainer/board/folder-tree";
import { walkLine } from "../trainer/board/model";
import { MiniBoard } from "./board/MiniBoard";
import { TimeControlPicker } from "./TimeControlPicker";

export type ColorChoice = "w" | "random" | "b";

export interface ChessSetup {
  readonly strategy: string;
  readonly color: ColorChoice;
  readonly timeControl: TimeControl | null;
  readonly takebacks: boolean;
  /** A line to start after ("Play from here"); empty for the usual start. */
  readonly openingMoves: readonly string[];
}

/** Solo setup: the AI ladder, plus colour, clock and takebacks — last game's, remembered. */
export default function SetupScreen({ onStart }: { onStart: (setup: ChessSetup) => void }) {
  const [saved] = useState(readSetup);
  const [params, setParams] = useSearchParams();
  const line = useMemo(() => lineFromSearch(params), [params]);
  const [color, setColor] = useState<ColorChoice>(line?.side ?? saved?.color ?? "w");
  const [timeControl, setTimeControl] = useState<TimeControl | null>(saved?.timeControl ?? null);
  const [takebacks, setTakebacks] = useState(saved?.takebacks ?? true);

  return (
    <PvAISetupScreen
      title="Chess"
      manifest={chessManifest}
      initialStrategy={saved?.strategy}
      onStart={(_n, strategy) => {
        const setup = { strategy, color, timeControl, takebacks };
        saveSetup(setup);
        onStart({ ...setup, openingMoves: line?.moves ?? [] });
      }}
      extraControls={
        <div className="mb-8 flex w-full max-w-3xl flex-col gap-6">
          {line && (
            <OpeningLine
              moves={line.moves}
              side={line.side}
              onClear={() => setParams({}, { replace: true })}
            />
          )}
          <div>
            <SectionLabel>Play as</SectionLabel>
            <SegmentedControl<ColorChoice>
              aria-label="Your colour"
              value={color}
              onChange={setColor}
              options={[
                { value: "w", label: "♔ White" },
                { value: "random", label: "Random" },
                { value: "b", label: "♚ Black" },
              ]}
            />
          </div>
          <div>
            <SectionLabel>Time control</SectionLabel>
            <TimeControlPicker value={timeControl} onChange={setTimeControl} />
          </div>
          <Checkbox
            checked={takebacks}
            onChange={(e) => setTakebacks(e.target.checked)}
            label="Allow takebacks"
          />
        </div>
      }
    />
  );
}

/** The line the game starts after: its position, its moves, its folder's name. */
function OpeningLine({
  moves,
  side,
  onClear,
}: {
  moves: readonly string[];
  side: "w" | "b";
  onClear: () => void;
}) {
  const fen = playLine(START_FEN, moves).fens.at(-1) ?? START_FEN;
  const folder = currentFolder(flatten(TRAINER_FOLDERS[side]), walkLine(moves), new Map());
  return (
    <div>
      <SectionLabel>Opening</SectionLabel>
      <div className="flex items-center gap-4 rounded-card-lg bg-fill p-3 ring-1 ring-line-soft">
        <MiniBoard
          fen={fen}
          orientation={side}
          lastMove={moves.at(-1) ?? null}
          className="size-24 shrink-0 overflow-hidden rounded-card-md"
          label="The position the game starts from"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {folder && (
            <span className="truncate text-sm font-semibold text-fg-strong">
              {folder.folder.name}
            </span>
          )}
          <span className="line-clamp-2 text-sm text-fg-secondary">
            {lineText(START_FEN, moves, moves.length)}
          </span>
          <span className="text-xs text-fg-muted">The game starts after these moves.</span>
        </div>
        <Button size="xs" variant="ghost" onClick={onClear}>
          Standard start
        </Button>
      </div>
    </div>
  );
}
