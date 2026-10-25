import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import type { Color } from "@boardgames/core/games/chess/engine/types";
import { type Deviation, deviationOf } from "@boardgames/core/games/chess/trainer/deviation";
import { TRAINER_FOLDERS } from "@boardgames/core/games/chess/trainer/folders";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Eyebrow } from "../../../../components/ui";
import { lineText } from "../../analysis/line";
import { chessKeys, repertoireQuery, repertoiresQuery } from "../../trainer/api";
import { currentFolder, flatten } from "../../trainer/board/folder-tree";
import { walkLine } from "../../trainer/board/model";
import { TRAINER_BASE } from "../../trainer/paths";

const EMPTY_OWNERS: ReadonlyMap<string, string> = new Map();

/**
 * "Your repertoire" in a game's review: where the game left your opening
 * tree for that colour — your move that wasn't the tree's, or the opponent's
 * reply it doesn't prepare — with the way into the trainer. Nothing at all
 * when you have no tree for the colour (or the game didn't start from the
 * start position).
 */
export function RepertoireCard({
  color,
  startFen,
  moves,
  onShow,
}: {
  color: Color;
  startFen: string;
  moves: readonly string[];
  /** Go to the game position before move `index`, marking the tree's move there. */
  onShow: (index: number, uci: string | null) => void;
}) {
  const navigate = useNavigate();
  const fromStart =
    startFen.split(" ").slice(0, 4).join(" ") === START_FEN.split(" ").slice(0, 4).join(" ");
  const list = useQuery({
    queryKey: chessKeys.repertoires,
    queryFn: repertoiresQuery,
    enabled: fromStart,
    retry: false,
  });
  const id = list.data?.repertoires.find((r) => r.color === color)?.id ?? null;
  const rep = useQuery({
    queryKey: chessKeys.repertoire(id ?? ""),
    queryFn: repertoireQuery(id ?? ""),
    enabled: id !== null,
    retry: false,
  });
  const tree = rep.data?.tree ?? null;
  const deviation: Deviation | null = useMemo(
    () => (tree ? deviationOf(tree, startFen, moves) : null),
    [tree, startFen, moves],
  );
  if (!deviation) return null;

  const at = "index" in deviation ? deviation.index : deviation.plies;
  const before = walkLine(moves.slice(0, at));
  const fenAt = before.at(-1)?.fen ?? startFen;
  const folder = currentFolder(flatten(TRAINER_FOLDERS[color]), before, EMPTY_OWNERS);
  const played = "played" in deviation ? lineText(fenAt, [deviation.played], 1) : "";
  const openTrainer = () =>
    navigate(`${TRAINER_BASE}?side=${color}&view=board&line=${moves.slice(0, at).join(".")}`);

  return (
    <section className="flex flex-col gap-2 rounded-card-md bg-fill px-3 py-2.5 ring-1 ring-line-soft">
      <Eyebrow as="h4" size="sm" tone="accent">
        Your repertoire
      </Eyebrow>
      {deviation.kind === "you-left" && (
        <p className="text-sm text-fg-primary">
          You left it at <b className="text-fg-strong">{played}</b>. Your move there is{" "}
          <b className="text-amber-200">{lineText(fenAt, [deviation.expected], 1)}</b>
          <span className="text-fg-muted">
            {deviation.source === "handpicked" ? " (★ yours)" : " (the engine's)"}
          </span>
          .
        </p>
      )}
      {deviation.kind === "they-left" && (
        <p className="text-sm text-fg-primary">
          They left your tree at <b className="text-fg-strong">{played}</b>, a reply you haven't
          prepared.
        </p>
      )}
      {deviation.kind === "unsettled" && (
        <p className="text-sm text-fg-primary">
          Your move after {Math.ceil(at / 2)} moves isn't settled in your tree yet.
        </p>
      )}
      {deviation.kind === "stayed" && (
        <p className="text-sm text-fg-primary">
          Stayed in your repertoire for {Math.ceil(deviation.plies / 2)} moves.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {deviation.kind !== "stayed" && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => onShow(at, deviation.kind === "you-left" ? deviation.expected : null)}
          >
            Show
          </Button>
        )}
        {deviation.kind === "you-left" && folder ? (
          <Button
            size="xs"
            variant="tinted"
            tone="amber"
            onClick={() =>
              navigate(`${TRAINER_BASE}?side=${color}&view=drill&drill=${folder.folder.id}`)
            }
            title={folder.folder.name}
          >
            Drill this folder
          </Button>
        ) : (
          <Button size="xs" variant="ghost" onClick={openTrainer}>
            Open in trainer
          </Button>
        )}
      </div>
    </section>
  );
}
