import { getLegalActions } from "@boardgames/core/games/exploding-kittens/rules";
import type { Action, CardType, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { CARD_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import { Button } from "../../../components/ui/Button";
import { getCardImageUrl, getSkinsForType } from "../assets/card-art";

interface NopeWindowProps {
  state: GameState;
  onAction: (action: Action) => void;
}

function PendingCardPreview({ cardType }: { cardType: CardType }) {
  const skins = getSkinsForType(cardType);
  const skin = skins.length > 0 ? skins[0] : null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {skin ? (
        <img
          src={getCardImageUrl(skin.file)}
          alt={CARD_LABELS[cardType]}
          className="h-[72px] w-[50px] rounded object-cover ring-1 ring-white/20"
          draggable={false}
        />
      ) : (
        <div className="flex h-[72px] w-[50px] items-center justify-center rounded bg-surface-700 ring-1 ring-white/20">
          <span className="text-lg">{CARD_LABELS[cardType]?.[0] ?? "?"}</span>
        </div>
      )}
      <span className="max-w-[54px] truncate text-center text-[9px] text-fg-secondary">
        {CARD_LABELS[cardType]}
      </span>
    </div>
  );
}

export default function NopeWindow({ state, onAction }: NopeWindowProps) {
  const nw = state.nopeWindow;
  if (!nw) return null;

  const legalActions = getLegalActions(state);
  const canNope = legalActions.some((a) => a.type === "nope");
  const nopeAction = legalActions.find((a) => a.type === "nope");

  const sourcePlayer = state.players[nw.sourcePlayerIndex];
  const sourceName = sourcePlayer.type === "human" ? "You" : `AI ${nw.sourcePlayerIndex}`;

  let effectLabel: string;
  if (nw.effectType === "pair") effectLabel = "Pair Combo (steal)";
  else if (nw.effectType === "triple") effectLabel = "Triple Combo (named steal)";
  else if (nw.effectType === "five-different") effectLabel = "5-Different Combo (discard pick)";
  else effectLabel = CARD_LABELS[nw.effectType];

  const pendingCardTypes: CardType[] = nw.pendingCardIds
    .map((id) => {
      for (const card of state.discardPile) {
        if (card.id === id) return card.type;
      }
      return null;
    })
    .filter((t): t is CardType => t !== null);

  return (
    <div className="rounded-xl border border-yellow-700/50 bg-yellow-950/40 p-4">
      <div className="mb-3 text-center">
        <p className="text-sm font-medium text-yellow-300">✋ Nope Window</p>
        <p className="mt-1 text-xs text-fg-secondary">
          {sourceName} played <span className="font-semibold text-white">{effectLabel}</span>
        </p>
        {nw.nopeChain.length > 0 && (
          <p className="mt-1 text-xs text-yellow-400">
            Nope chain: {nw.nopeChain.length}x (action will be{" "}
            {nw.nopeChain.length % 2 === 0 ? "resolved" : "cancelled"} if no more Nopes)
          </p>
        )}
      </div>

      {pendingCardTypes.length > 0 && (
        <div className="mb-3 flex justify-center gap-1.5">
          {pendingCardTypes.map((ct, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional card previews
            <PendingCardPreview key={i} cardType={ct} />
          ))}
        </div>
      )}

      <div className="flex justify-center gap-3">
        {canNope && nopeAction && (
          <Button variant="danger" size="md" onClick={() => onAction(nopeAction)}>
            Play Nope!
          </Button>
        )}
        <Button variant="secondary" size="md" onClick={() => onAction({ type: "pass-nope" })}>
          Pass
        </Button>
      </div>
    </div>
  );
}
