import type {
  Action,
  ParksPlayerView,
  PassionId,
  ResourceType,
  WaterGapIndex,
} from "@boardgames/core/games/parks/types";
import {
  CANTEEN_LABELS,
  GEAR_LABELS,
  PASSION_LABELS,
  RESOURCE_LABELS,
  SITE_LABELS,
} from "@boardgames/core/games/parks/types";
import type { ReactNode } from "react";
import { AiThinkingIndicator } from "../../../components/ui";

const GEAR_EFFECT_DESCRIPTIONS: Record<PassionId, string> = {
  adventure: "Each Instant-Action park you visit also rolls the Trail Die.",
  birdwatching: "Park costs that include Sun cost 1 fewer Sun.",
  botany: "Each Forest you'd gain becomes Wildlife instead.",
  collecting: "Take an extra canteen each time you draw one.",
  forestry: "Park costs that include Forest cost 1 fewer Forest.",
  kayaking: "Park costs that include Water cost 1 fewer Water.",
  mountaineering: "Park costs that include Mountain cost 1 fewer Mountain.",
  "rock-climbing": "Each Mountain you'd gain becomes Wildlife instead.",
  swimming: "Each water token you place rolls the Trail Die.",
  wildlife: "Photos paid with Wildlife give you 2 photos instead of 1.",
};

const END_BONUS_DESCRIPTIONS: Record<PassionId, string> = {
  adventure: "+1 PT per Instant-Action park visited.",
  birdwatching: "+1 PT per visited park with a Sun cost.",
  botany: "+1 PT per 2 Forest icons on your visited parks.",
  collecting: "+1 PT per extra canteen taken (beyond your starter).",
  forestry: "+1 PT per visited park with a Forest cost.",
  kayaking: "+1 PT per visited park with a Water cost.",
  mountaineering: "+1 PT per visited park with a Mountain cost.",
  "rock-climbing": "+1 PT per 2 Mountain icons on your visited parks.",
  swimming: "+1 PT per 2 Water icons on your visited parks.",
  wildlife: "+1 PT per 3 photos taken (in addition to per-photo PT).",
};

interface ActionPanelProps {
  view: ParksPlayerView;
  legalActions: Action[];
  isMyTurn: boolean;
  isAiThinking: boolean;
  onAction: (action: Action) => void;
}

/** Standard "Title · message" row used by every game's action bar. */
function Prompt({
  title,
  message,
  children,
}: {
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-semibold text-cyan-400">{title}</span>
      {message && (
        <>
          <span className="text-gray-500">&middot;</span>
          <span className="text-xs text-gray-400">{message}</span>
        </>
      )}
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-gray-600 bg-gray-700/60 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-600 disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function ActionPanel({
  view,
  legalActions,
  isMyTurn,
  isAiThinking,
  onAction,
}: ActionPanelProps) {
  // Opponent's turn — use the standard AI-thinking / waiting indicator.
  if (!isMyTurn) {
    if (view.phase === "awaiting-passion-choice") {
      return <AiThinkingIndicator message="Opponent is choosing a passion" />;
    }
    return <AiThinkingIndicator message={isAiThinking ? "AI is thinking" : "Opponent's turn"} />;
  }

  // Game-start passion choice — handled by full-screen PassionPickOverlay.
  if (view.phase === "awaiting-passion-choice") return null;

  // Goal-met: pick gear effect or end-game bonus.
  if (view.phase === "awaiting-passion-mode-choice") {
    const me = view.players[view.activePlayer];
    const pid = me.passion;
    if (!pid) return null;
    return (
      <div className="flex flex-col items-center gap-2">
        <Prompt
          title="Goal met"
          message={`${PASSION_LABELS[pid]} — pick ONE reward (locked for the rest of the game)`}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => onAction({ type: "passion-mode-choice", mode: "gear" })}
            className="flex max-w-xs flex-col items-start gap-0.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-left text-emerald-300 transition hover:bg-emerald-500/25"
          >
            <span className="text-xs font-semibold">Gear Effect (ongoing)</span>
            <span className="text-[10px] leading-tight text-emerald-200/70">
              {GEAR_EFFECT_DESCRIPTIONS[pid]}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onAction({ type: "passion-mode-choice", mode: "end-bonus" })}
            className="flex max-w-xs flex-col items-start gap-0.5 rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 py-1.5 text-left text-violet-300 transition hover:bg-violet-500/25"
          >
            <span className="text-xs font-semibold">End-Game Bonus</span>
            <span className="text-[10px] leading-tight text-violet-200/70">
              {END_BONUS_DESCRIPTIONS[pid]}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Pick a canteen to draw — handled by the always-visible CanteenDisplay panel.
  if (view.phase === "awaiting-canteen-draw") {
    return <Prompt title="Your turn" message="Draw a canteen from the display above" />;
  }

  // Drew a canteen — pick which row to place it on.
  if (view.phase === "awaiting-canteen-row-choice") {
    const rowActions = legalActions.filter(
      (a): a is Action & { type: "place-canteen-row" } => a.type === "place-canteen-row",
    );
    const effect = view.pendingCanteenEffect;
    return (
      <Prompt
        title="Place canteen"
        message={effect ? `${CANTEEN_LABELS[effect]} — pick a row` : "Pick a row"}
      >
        {rowActions.map((a) => (
          <PrimaryButton key={`row-${a.row}`} onClick={() => onAction(a)}>
            Row {a.row + 1}
          </PrimaryButton>
        ))}
      </Prompt>
    );
  }

  // Landed on a tile with both weather + a site — pick order.
  if (view.phase === "awaiting-landing-choice" && view.pendingLanding) {
    const pl = view.pendingLanding;
    const weatherLabel = pl.weather === "S" ? "Sun" : "Water";
    return (
      <Prompt title="Resolve in order" message="Pick what to do first">
        <PrimaryButton onClick={() => onAction({ type: "landing-choice", first: "weather" })}>
          Take {weatherLabel} first
        </PrimaryButton>
        <PrimaryButton onClick={() => onAction({ type: "landing-choice", first: "site" })}>
          Trigger {SITE_LABELS[pl.site]} first
        </PrimaryButton>
      </Prompt>
    );
  }

  if (view.phase === "awaiting-exchange" || view.phase === "awaiting-canteen-exchange") {
    const exchangeActions = legalActions.filter(
      (a): a is Action & { type: "exchange-resource" } => a.type === "exchange-resource",
    );
    const canPass = legalActions.some((a) => a.type === "pass");
    return (
      <Prompt title="Trade for Wildlife" message="Spend 1 resource">
        {exchangeActions.map((a) => (
          <PrimaryButton key={a.resource} onClick={() => onAction(a)}>
            Spend {RESOURCE_LABELS[a.resource as ResourceType]}
          </PrimaryButton>
        ))}
        {canPass && (
          <SecondaryButton onClick={() => onAction({ type: "pass" })}>Skip</SecondaryButton>
        )}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-canteen-or-photo") {
    const photoActions = legalActions.filter(
      (
        a,
      ): a is Action & {
        type: "canteen-or-photo-choice";
        choice: "photo";
        payWith: ResourceType;
      } => a.type === "canteen-or-photo-choice" && a.choice === "photo",
    );
    const canTakeCanteen = legalActions.some(
      (a) => a.type === "canteen-or-photo-choice" && a.choice === "canteen",
    );
    return (
      <Prompt title="Choose" message="Take a canteen or pay 1 resource for a photo">
        {canTakeCanteen && (
          <PrimaryButton
            onClick={() => onAction({ type: "canteen-or-photo-choice", choice: "canteen" })}
          >
            Take Canteen
          </PrimaryButton>
        )}
        {photoActions.map((a) => (
          <PrimaryButton key={a.payWith} onClick={() => onAction(a)}>
            Pay {RESOURCE_LABELS[a.payWith as ResourceType]}
          </PrimaryButton>
        ))}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-water-placement") {
    const placeActions = legalActions.filter(
      (a): a is Action & { type: "place-or-keep-water"; placement: WaterGapIndex } =>
        a.type === "place-or-keep-water" && a.placement !== "keep",
    );
    const keepAction = legalActions.find(
      (a): a is Action & { type: "place-or-keep-water"; placement: "keep" } =>
        a.type === "place-or-keep-water" && a.placement === "keep",
    );
    const remaining = view.pendingWaterPlacements;
    return (
      <Prompt title="Place water" message={`${remaining} remaining — pick a row or keep`}>
        {placeActions.map((a) => (
          <PrimaryButton key={`gap-${a.placement}`} onClick={() => onAction(a)}>
            Row {a.placement + 1}
          </PrimaryButton>
        ))}
        {keepAction && (
          <SecondaryButton onClick={() => onAction(keepAction)}>Keep in backpack</SecondaryButton>
        )}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-canteen-photo") {
    const photoActions = legalActions.filter(
      (
        a,
      ): a is Action & {
        type: "canteen-or-photo-choice";
        choice: "photo";
        payWith: ResourceType;
      } => a.type === "canteen-or-photo-choice" && a.choice === "photo",
    );
    const canPass = legalActions.some((a) => a.type === "pass");
    return (
      <Prompt title="Snap photo" message="Pay 1 resource">
        {photoActions.map((a) => (
          <PrimaryButton key={a.payWith} onClick={() => onAction(a)}>
            Pay {RESOURCE_LABELS[a.payWith as ResourceType]}
          </PrimaryButton>
        ))}
        {canPass && (
          <SecondaryButton onClick={() => onAction({ type: "pass" })}>Skip</SecondaryButton>
        )}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-gear-or-end") {
    const onShopSite = view.pendingSiteContext?.source === "site";
    const canActivateAny = legalActions.some((a) => a.type === "activate-gear");
    const canBuyAny = legalActions.some((a) => a.type === "buy-gear");
    const canPass = legalActions.some((a) => a.type === "pass");
    const message = onShopSite
      ? canActivateAny
        ? "Trading Post — buy gear above, activate a Gear chip, or pass"
        : "Trading Post — buy a gear card above or pass"
      : canActivateAny
        ? "Activate a Gear chip in your tray — or pass to end your turn"
        : "End of turn";
    return (
      <Prompt title="Your turn" message={message}>
        {canPass && (
          <SecondaryButton onClick={() => onAction({ type: "pass" })}>
            {canBuyAny || canActivateAny ? "Pass / End turn" : "End turn"}
          </SecondaryButton>
        )}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-gear-photo-payment") {
    const photoActions = legalActions.filter(
      (a): a is Action & { type: "gear-photo-payment"; payWith: ResourceType } =>
        a.type === "gear-photo-payment",
    );
    const gearKind = view.pendingGearActivation?.kind;
    const canPass = legalActions.some((a) => a.type === "pass");
    return (
      <Prompt
        title={gearKind ? GEAR_LABELS[gearKind] : "Photo"}
        message="Pay 1 resource for a photo"
      >
        {photoActions.map((a) => (
          <PrimaryButton key={a.payWith} onClick={() => onAction(a)}>
            Pay {RESOURCE_LABELS[a.payWith as ResourceType]}
          </PrimaryButton>
        ))}
        {canPass && (
          <SecondaryButton onClick={() => onAction({ type: "pass" })}>Cancel</SecondaryButton>
        )}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-reserve-source") {
    const displayActions = legalActions.filter(
      (a): a is Action & { type: "reserve-park"; source: "display"; parkId: number } =>
        a.type === "reserve-park" && a.source === "display",
    );
    const deckTopAction = legalActions.find(
      (a): a is Action & { type: "reserve-park"; source: "deck-top" } =>
        a.type === "reserve-park" && a.source === "deck-top",
    );
    const gearKind = view.pendingGearActivation?.kind;
    const canPass = legalActions.some((a) => a.type === "pass");
    return (
      <Prompt
        title={gearKind ? GEAR_LABELS[gearKind] : "Reserve"}
        message="Reserve a park — pick a source"
      >
        {displayActions.map((a) => {
          const park = view.parksDisplay.find((p) => p.id === a.parkId);
          return (
            <PrimaryButton key={a.parkId} onClick={() => onAction(a)}>
              {park ? park.name : `#${a.parkId}`} ({park?.pt ?? "?"} PT)
            </PrimaryButton>
          );
        })}
        {deckTopAction && (
          <SecondaryButton onClick={() => onAction(deckTopAction)}>Top of deck</SecondaryButton>
        )}
        {canPass && (
          <SecondaryButton onClick={() => onAction({ type: "pass" })}>Cancel</SecondaryButton>
        )}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-shutterbug-photo") {
    const payActions = legalActions.filter(
      (a): a is Action & { type: "shutterbug-photo-pay"; payWith: ResourceType } =>
        a.type === "shutterbug-photo-pay",
    );
    return (
      <Prompt title="Shutterbug bonus" message="Pay 1 resource for an extra photo, or skip">
        {payActions.map((a) => (
          <PrimaryButton key={a.payWith} onClick={() => onAction(a)}>
            Pay {RESOURCE_LABELS[a.payWith as ResourceType]}
          </PrimaryButton>
        ))}
        <SecondaryButton onClick={() => onAction({ type: "pass" })}>Skip</SecondaryButton>
      </Prompt>
    );
  }

  if (view.phase === "awaiting-resource-discard") {
    const discardActions = legalActions.filter(
      (a): a is Action & { type: "discard-resource"; resource: ResourceType } =>
        a.type === "discard-resource",
    );
    const me = view.players[view.activePlayer];
    const total =
      me.resources.M + me.resources.F + me.resources.S + me.resources.W + me.resources.A;
    return (
      <Prompt title="Over the cap" message={`Discard down to 12 (you have ${total})`}>
        {discardActions.map((a) => (
          <PrimaryButton key={a.resource} onClick={() => onAction(a)}>
            Discard {RESOURCE_LABELS[a.resource as ResourceType]}
          </PrimaryButton>
        ))}
      </Prompt>
    );
  }

  if (view.phase === "awaiting-park-action") {
    const buyDisplayActions = legalActions.filter(
      (a): a is Action & { type: "buy-park"; parkId: number } => a.type === "buy-park",
    );
    const buyReservedActions = legalActions.filter(
      (a): a is Action & { type: "buy-park-reserved"; parkId: number } =>
        a.type === "buy-park-reserved",
    );
    const reserveDisplayActions = legalActions.filter(
      (a): a is Action & { type: "reserve-park"; source: "display"; parkId: number } =>
        a.type === "reserve-park" && a.source === "display",
    );
    const reserveDeckAction = legalActions.find(
      (a): a is Action & { type: "reserve-park"; source: "deck-top" } =>
        a.type === "reserve-park" && a.source === "deck-top",
    );
    return (
      <Prompt title="Park Action" message="Buy or reserve a park, or skip">
        {buyDisplayActions.map((a) => {
          const park = view.parksDisplay.find((p) => p.id === a.parkId);
          return (
            <PrimaryButton key={`buy-${a.parkId}`} onClick={() => onAction(a)}>
              Buy {park ? park.name : `#${a.parkId}`} ({park?.pt ?? "?"} PT)
            </PrimaryButton>
          );
        })}
        {buyReservedActions.map((a) => (
          <PrimaryButton key={`buy-r-${a.parkId}`} onClick={() => onAction(a)}>
            Buy reserved #{a.parkId}
          </PrimaryButton>
        ))}
        {reserveDisplayActions.map((a) => {
          const park = view.parksDisplay.find((p) => p.id === a.parkId);
          return (
            <SecondaryButton key={`res-${a.parkId}`} onClick={() => onAction(a)}>
              Reserve {park ? park.name : `#${a.parkId}`}
            </SecondaryButton>
          );
        })}
        {reserveDeckAction && (
          <SecondaryButton onClick={() => onAction(reserveDeckAction)}>
            Reserve top of deck
          </SecondaryButton>
        )}
        <SecondaryButton onClick={() => onAction({ type: "pass" })}>Skip</SecondaryButton>
      </Prompt>
    );
  }

  // Standard playing phase — flat row matching lost-cities/sushi-go style.
  const canPass = legalActions.some((a) => a.type === "pass");
  return (
    <Prompt title="Your turn" message="Pick a hiker to move, use a canteen, or buy a park">
      {canPass && (
        <SecondaryButton onClick={() => onAction({ type: "pass" })}>Pass</SecondaryButton>
      )}
    </Prompt>
  );
}
