import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import { drawCount, hasHuman } from "@boardgames/core/games/the-hunger/rules";
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

  // Hypnosis, draw counts and Instants carry their own Cancel.
  const cancel = pending &&
    pending.kind !== "instant" &&
    pending.kind !== "hypnosis" &&
    pending.kind !== "draw" && (
      <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
        Cancel
      </Button>
    );
  const extras =
    pending?.kind === "hypnosis" ? (
      <HypnosisControls ix={ix} current={current} onGo={onGo} />
    ) : pending?.kind === "draw" ? (
      <DrawControls ix={ix} />
    ) : (
      <>
        <TokenControls ix={ix} current={current} onGo={onGo} />
        <InstantControls ix={ix} current={current} onGo={onGo} />
      </>
    );

  switch (turn.step) {
    case "manipulate":
      return (
        <>
          {ix.clickableCards.size > 0 && pending?.kind !== "hypnosis" && (
            <GoTo view="player" current={current} onGo={onGo}>
              Play your cards
            </GoTo>
          )}
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
          {extras}
          {cancel}
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

/**
 * Hypnosis: the Hunt Track does the work — pickable cards pulse, then the
 * piles the picked card can reach light up. The bar only offers the way to
 * the Hunt (if you left it) and one Cancel.
 */
function HypnosisControls({ ix, current, onGo }: Props) {
  const { pending, setPending } = ix;
  if (pending?.kind !== "hypnosis") return null;
  return (
    <>
      <GoTo view="shop" current={current} onGo={onGo}>
        {pending.pick ? "Hypnosis: move it" : "Hypnosis: pick a card"}
      </GoTo>
      <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
        Cancel Hypnosis
      </Button>
    </>
  );
}

/**
 * Bonus tokens you can spend right now, one button each, on every view:
 * Gain 1 Mission, +Speed, Draw and +1 Hunt act at once; Discard / Draw arms a
 * pick on your board (the cards it could discard light up).
 */
function TokenControls({ ix, current, onGo }: Props) {
  const seen = new Set<string>();
  return (
    <>
      {ix.legalActions.map((a) => {
        if (a.type !== "use-bonus") return null;
        const def = bonusDef(a.token);
        // Two copies (or several targets) of one token read as one button.
        if (seen.has(def.id)) return null;
        seen.add(def.id);
        const targeted = Boolean(a.discard);
        return (
          <Button
            key={a.token}
            size="xs"
            variant="tinted"
            tone="amber"
            onClick={() => {
              if (!targeted) ix.send(a);
              else {
                ix.onToken(a.token);
                if (current !== "player") onGo("player");
              }
            }}
            title={def.text}
          >
            {def.name}
          </Button>
        );
      })}
    </>
  );
}

/** A "may draw" card: one button per count, most first. */
function DrawControls({ ix }: { ix: HungerInteraction }) {
  const most = ix.drawChoices.find((a) => a.draw === undefined);
  const counts = ix.drawChoices
    .map((a) => ({ a, n: a.draw ?? null }))
    .sort((x, y) => (y.n ?? 99) - (x.n ?? 99));
  return (
    <>
      {counts.map(({ a, n }) => (
        <Button
          key={n ?? "all"}
          size="xs"
          variant={a === most ? "primary" : "tinted"}
          tone={a === most ? undefined : "emerald"}
          onClick={() => ix.send(a)}
        >
          {n === null ? `Draw ${drawMax(ix, a.card)}` : `Draw ${n}`}
        </Button>
      ))}
      <Button size="xs" variant="secondary" onClick={() => ix.setPending(null)}>
        Cancel
      </Button>
    </>
  );
}

/** How many a card's full draw is, from the card and what is in play. */
function drawMax(ix: HungerInteraction, card: string): number {
  const m = cardDef(card).manipulation;
  if (!m || m.kind !== "draw") return 1;
  return drawCount(m, hasHuman(ix.playArea));
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
