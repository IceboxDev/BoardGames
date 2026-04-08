import type { BoutPair, Suit } from "@boardgames/core/games/durak/types";
import Card from "./Card";

interface TableProps {
  table: BoutPair[];
  trumpSuit: Suit;
  isDefending: boolean;
  onClickUndefended?: (attackIndex: number) => void;
}

export default function Table({ table, trumpSuit, isDefending, onClickUndefended }: TableProps) {
  if (table.length === 0) {
    return (
      <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-gray-700 text-sm text-gray-500">
        No cards on the table
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-4">
      {table.map((pair, i) => (
        <div key={pair.attack.id} className="relative">
          {/* Attack card */}
          <Card card={pair.attack} trumpSuit={trumpSuit} size="md" />

          {/* Defense card (overlapping) or empty slot */}
          {pair.defense ? (
            <div className="absolute left-3 top-3">
              <Card card={pair.defense} trumpSuit={trumpSuit} size="md" />
            </div>
          ) : (
            <button
              type="button"
              onClick={isDefending && onClickUndefended ? () => onClickUndefended(i) : undefined}
              disabled={!isDefending || !onClickUndefended}
              className={`absolute left-3 top-3 flex h-28 w-20 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                isDefending && onClickUndefended
                  ? "border-emerald-500/60 bg-emerald-500/5 hover:border-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                  : "border-gray-700/40 bg-gray-800/20"
              }`}
            >
              {isDefending && onClickUndefended && (
                <span className="text-xs text-emerald-400/60">Beat</span>
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
