import { toGtp } from "@boardgames/core/games/go/coords";
import type { GoMoveView, GoResult } from "@boardgames/core/games/go/view";
import type { LogAction, LogBlock } from "../../components/action-log";

const PER_BLOCK = 10;

/** The move list for the History rail, ten moves to a block, newest block last. */
export function mapGoLog(
  size: number,
  moves: readonly GoMoveView[],
  names: readonly string[],
  result: GoResult | null,
): LogBlock[] {
  const blocks: LogBlock[] = [];
  for (let start = 0; start < moves.length; start += PER_BLOCK) {
    const actions: LogAction[] = moves.slice(start, start + PER_BLOCK).map((m, i) => {
      const n = start + i + 1;
      const who = names[m.color] ?? (m.color === 0 ? "Black" : "White");
      if (m.point === null) {
        return {
          key: n,
          icon: "⏭",
          variant: "neutral",
          spans: [`${n}. `, { text: who, bold: true }, " passes"],
        };
      }
      return {
        key: n,
        icon: m.color === 0 ? "●" : "○",
        variant: m.captured > 0 ? "success" : "action",
        spans: [
          `${n}. `,
          { text: toGtp(size, m.point), bold: true },
          ...(m.captured > 0 ? [` · captures ${m.captured}`] : []),
        ],
      };
    });
    blocks.push({ key: start, label: `Moves ${start + 1}–${start + actions.length}`, actions });
  }
  if (result) {
    const how =
      result.reason === "resign"
        ? "by resignation"
        : result.reason === "timeout"
          ? "on time"
          : "on the count";
    blocks.push({
      key: "end",
      label: "Result",
      actions: [
        {
          key: "end",
          icon: "🏁",
          variant: "special",
          spans: [{ text: result.result, bold: true }, ` — ${how}`],
        },
      ],
    });
  }
  return blocks;
}
