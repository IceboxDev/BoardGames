import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import type { CardId, HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { Button, Surface } from "../../../components/ui";
import type { ViewId } from "../logic/attention";
import type { HungerInteraction } from "../logic/interaction";
import { cardName, EFFECT_LABEL, spaceLabel } from "../logic/labels";

interface Props {
  ix: HungerInteraction;
  /** The view on screen, so the bar can offer to go where the move is made. */
  current: ViewId;
  onGo: (view: ViewId) => void;
}

/**
 * The one bar every view shares, pinned to the bottom of the screen. It holds
 * buttons and nothing else: what you can do right now, a button to the view
 * where the rest of the move is made (the Hunt, the map, your board), and
 * Undo. Whose turn it is shows in the navigator; guidance lives in tooltips.
 */
export default function ActionBar({ ix, current, onGo }: Props) {
  return (
    <Surface
      variant="raised"
      padding="sm"
      className="grid min-h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2"
    >
      <span aria-hidden />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <StepControls ix={ix} current={current} onGo={onGo} />
      </div>
      <div className="flex justify-end">
        {ix.undo && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => ix.send(ix.undo)}
            title="Take back your last move, push or choice that revealed nothing (Ctrl+Z)"
          >
            ↶ Undo
          </Button>
        )}
      </div>
    </Surface>
  );
}

/** A button to the view where the rest of the move is made, unless it is on screen. */
function GoTo({
  view,
  current,
  onGo,
  children,
}: {
  view: ViewId;
  current: ViewId;
  onGo: (view: ViewId) => void;
  children: string;
}) {
  if (view === current) return null;
  return (
    <Button size="xs" variant="primary" onClick={() => onGo(view)}>
      {children} →
    </Button>
  );
}

function StepControls({ ix, current, onGo }: Props) {
  const { view, turn, myTurn, pending, setPending, send, find, legalActions, me } = ix;
  if (view.phase === "setup" || !myTurn || !turn) return null;

  const cancel = pending && pending.kind !== "instant" && (
    <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
      Cancel
    </Button>
  );
  const extras =
    pending?.kind === "hypnosis" ? (
      <HypnosisControls ix={ix} current={current} onGo={onGo} />
    ) : (
      <>
        <FamiliarControls ix={ix} />
        <InstantControls ix={ix} current={current} onGo={onGo} />
      </>
    );

  switch (turn.step) {
    case "manipulate":
      return (
        <>
          <GoTo view="player" current={current} onGo={onGo}>
            Play your cards
          </GoTo>
          {extras}
          {cancel}
          <Button
            size="xs"
            variant="success"
            disabled={!find("end-manipulation")}
            title={
              ix.mustDraw.length > 0
                ? `${ix.mustDraw.map(cardName).join(" and ")} must draw first — click it on your board`
                : "Done with draw and discard effects: on to movement"
            }
            onClick={() => send(find("end-manipulation"))}
          >
            Done
          </Button>
        </>
      );
    case "move":
      return (
        <>
          <GoTo view="map" current={current} onGo={onGo}>
            {`Move · ${turn.speed} Speed`}
          </GoTo>
          {find("stay") && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => send(find("stay"))}
              title="Don't move this turn"
            >
              Stay here
            </Button>
          )}
        </>
      );
    case "push":
      return (
        <>
          <GoTo view="map" current={current} onGo={onGo}>
            Push them
          </GoTo>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => send(legalActions.find((a) => a.type === "push" && a.to === null))}
          >
            Leave them
          </Button>
        </>
      );
    case "act": {
      const here = me ? graphFor(view.options).spaces.get(me.pos) : undefined;
      const useSpace = find("space");
      const canHunt = legalActions.some((a) => a.type === "hunt");
      const onMap = legalActions.some((a) => a.type === "hunt-rose");
      const tavern = find("hunt-tavern");
      return (
        <>
          {canHunt && (
            <GoTo view="shop" current={current} onGo={onGo}>
              {`Hunt · ${turn.speedLeft} Speed left`}
            </GoTo>
          )}
          {onMap && (
            <GoTo view="map" current={current} onGo={onGo}>
              Take a Rose
            </GoTo>
          )}
          {tavern && (
            <Button
              size="xs"
              variant="tinted"
              tone="amber"
              onClick={() => send(tavern)}
              title="Hunt every face-down card in the Tavern for 2 Speed"
            >
              Hunt the Tavern · {view.tavernCount} card{view.tavernCount === 1 ? "" : "s"}
            </Button>
          )}
          {useSpace && here && (
            <Button size="xs" variant="tinted" tone="sky" onClick={() => send(useSpace)}>
              {EFFECT_LABEL[here.effect]}
            </Button>
          )}
          {extras}
          {cancel}
          <Button size="xs" variant="success" onClick={() => send(find("end-turn"))}>
            End turn
          </Button>
        </>
      );
    }
    case "inspire":
      return (
        <>
          {legalActions.map((a) =>
            a.type === "inspire" ? (
              <Button
                key={a.crypt}
                size="xs"
                variant="tinted"
                tone="amber"
                onClick={() => send(a)}
                title="Take a Mission from this Crypt"
              >
                {spaceLabel(view.options, a.crypt)} · {view.crypts[a.crypt] ?? 0} left
              </Button>
            ) : null,
          )}
        </>
      );
    default:
      return null;
  }
}

/** Hypnosis: pick a card on the track, then an arrow for where it goes. */
function HypnosisControls({ ix, current, onGo }: Props) {
  const { pending, hypnoses, view, send, setPending } = ix;
  if (pending?.kind !== "hypnosis") return null;
  const { card, pick } = pending;
  const from = pick ? locate(view.track, pick) : null;
  const moves = hypnoses.filter((a) => a.card === card && a.pick === pick);
  return (
    <>
      {!pick && (
        <GoTo view="shop" current={current} onGo={onGo}>
          Hypnosis: pick a card
        </GoTo>
      )}
      {from &&
        moves.map((a) => (
          <Button
            key={`${a.row}-${a.col}`}
            size="xs"
            variant="tinted"
            tone="purple"
            onClick={() => send(a)}
          >
            {arrow(from, a)}
          </Button>
        ))}
      <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
        Cancel
      </Button>
    </>
  );
}

/** Kutya / Ursa: Familiar abilities with no target, one button each. */
function FamiliarControls({ ix }: { ix: HungerInteraction }) {
  return (
    <>
      {ix.legalActions.map((a) =>
        a.type === "familiar" && !a.target ? (
          <Button
            key={a.card}
            size="xs"
            variant="tinted"
            tone="emerald"
            onClick={() => ix.send(a)}
            title={cardDef(a.card).text}
          >
            {cardDef(a.card).activated?.kind === "redraw-hand"
              ? `${cardName(a.card)}: new hand`
              : `${cardName(a.card)}: column-1 Hunt`}
          </Button>
        ) : null,
      )}
    </>
  );
}

function InstantControls({ ix, current, onGo }: Props) {
  const { pending, armed, instants, send, setPending, onInstant } = ix;
  if (pending?.kind === "instant") {
    const name = missionDef(pending.mission).name;
    const cards = armed.filter((a) => a.card);
    return (
      <>
        {cards.length === 0 &&
          (armed.some((a) => a.space) ? (
            <GoTo view="map" current={current} onGo={onGo}>
              {`${name}: pick a Chest`}
            </GoTo>
          ) : (
            <GoTo view="shop" current={current} onGo={onGo}>
              {`${name}: pick a pile`}
            </GoTo>
          ))}
        {cards.map((a) => (
          <Button key={a.card} size="xs" variant="tinted" tone="emerald" onClick={() => send(a)}>
            {a.card ? cardName(a.card) : ""}
          </Button>
        ))}
        <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
          Cancel
        </Button>
      </>
    );
  }
  const missions = [...new Set(instants.map((a) => a.mission))];
  return (
    <>
      {missions.map((m) => (
        <Button
          key={m}
          size="xs"
          variant="tinted"
          tone="amber"
          onClick={() => onInstant(m)}
          title={missionDef(m).text}
        >
          {missionDef(m).name}
          {missionDef(m).instant?.kind === "digest-hand" ? " (skip turn)" : ""}
        </Button>
      ))}
    </>
  );
}

function locate(
  track: HungerPlayerView["track"],
  card: CardId,
): { row: number; col: number } | null {
  for (let row = 0; row < track.length; row++) {
    for (let col = 0; col < track[row].length; col++) {
      if (track[row][col].includes(card)) return { row, col };
    }
  }
  return null;
}

/** Column 3 is drawn on the left, so a lower column index is further right. */
function arrow(from: { row: number; col: number }, to: { row: number; col: number }): string {
  if (to.row < from.row) return `↑ row ${to.row + 1}`;
  if (to.row > from.row) return `↓ row ${to.row + 1}`;
  return to.col < from.col ? `→ column ${to.col + 1}` : `← column ${to.col + 1}`;
}
