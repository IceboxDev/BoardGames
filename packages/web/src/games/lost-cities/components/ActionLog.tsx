import type { ActionLogEntry, PlayerIndex } from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX, COLOR_LABELS } from "@boardgames/core/games/lost-cities/types";
import { useEffect, useMemo, useRef } from "react";

interface TurnGroup {
  turn: number;
  player: PlayerIndex;
  entries: ActionLogEntry[];
}

function groupByTurn(entries: ActionLogEntry[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;

  for (const entry of entries) {
    if (!current || current.turn !== entry.turn || current.player !== entry.player) {
      current = { turn: entry.turn, player: entry.player, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }

  return groups;
}

function cardStr(entry: ActionLogEntry): string | null {
  if (entry.card.id === -1) return null;
  const value = entry.card.type === "wager" ? "W" : String(entry.card.value);
  return `${COLOR_LABELS[entry.card.color]} ${value}`;
}

interface ActionLogProps {
  entries: ActionLogEntry[];
}

export default function ActionLog({ entries }: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupByTurn(entries), [entries]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-gray-800/80 shrink-0">
        <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-500">
          History
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1 scrollbar-thin"
      >
        {groups.length === 0 && (
          <p className="text-[0.7rem] text-gray-600 text-center py-4 italic">No actions yet</p>
        )}

        {groups.map((group, gi) => {
          const isAI = group.player === 1;

          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
              key={`${group.turn}-${group.player}-${gi}`}
              className="relative rounded-md pl-2.5 pr-2 py-1.5"
              style={{
                backgroundColor: isAI ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
              }}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[0.6rem] tabular-nums text-gray-600 font-medium w-3.5 shrink-0 text-right">
                  {group.turn}
                </span>
                <span
                  className={[
                    "text-[0.65rem] font-semibold uppercase tracking-wide",
                    isAI ? "text-gray-500" : "text-indigo-400",
                  ].join(" ")}
                >
                  {isAI ? "AI" : "You"}
                </span>
              </div>

              <div className="ml-5 mt-0.5 space-y-0.5">
                {group.entries.map((entry, ei) => {
                  const hidden = entry.card.id === -1;
                  const hex = hidden ? undefined : COLOR_HEX[entry.card.color];
                  const isPlay =
                    entry.action === "play-expedition" || entry.action === "play-discard";
                  let label: string;

                  const name = cardStr(entry);

                  switch (entry.action) {
                    case "play-expedition":
                      label = `Played ${name} to expedition`;
                      break;
                    case "play-discard":
                      label = `Discarded ${name}`;
                      break;
                    case "draw-pile":
                      label = name ? `Drew ${name} from draw pile` : "Drew from draw pile";
                      break;
                    case "draw-discard":
                      label = `Drew ${name ?? "?"} from ${COLOR_LABELS[entry.color!]} discard`;
                      break;
                  }

                  return (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                      key={ei}
                      className="flex items-start gap-1"
                    >
                      {hex ? (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 mt-[3px]"
                          style={{
                            backgroundColor: hex,
                            opacity: isPlay ? (isAI ? 0.5 : 0.8) : isAI ? 0.3 : 0.4,
                          }}
                        />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[3px] bg-gray-700" />
                      )}
                      <span
                        className={[
                          "leading-snug",
                          isPlay ? "text-[0.7rem]" : "text-[0.65rem]",
                          isAI
                            ? isPlay
                              ? "text-gray-400"
                              : "text-gray-500"
                            : isPlay
                              ? "text-gray-200"
                              : "text-gray-400",
                        ].join(" ")}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {group.entries.length > 0 &&
                (() => {
                  const playEntry = group.entries.find(
                    (e) => e.action === "play-expedition" || e.action === "play-discard",
                  );
                  if (!playEntry) return null;
                  const hex = COLOR_HEX[playEntry.card.color];
                  return (
                    <div
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
                      style={{ backgroundColor: hex, opacity: isAI ? 0.35 : 0.7 }}
                    />
                  );
                })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
