import { cardDef, ROSES } from "@boardgames/core/games/the-hunger/content/cards";
import type { HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import type { ReactNode } from "react";
import { Button, Eyebrow, Surface } from "../../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../../hooks/useMediaQuery";
import { cn } from "../../../../lib/cn";
import { artUrl } from "../../logic/art";
import type { HungerInteraction } from "../../logic/interaction";
import HungerMap from "../board/HungerMap";
import CardBack from "../CardBack";
import CardPreview from "../CardPreview";
import { CastleTile, PanelCorners } from "../Fittings";
import HungerCard from "../HungerCard";
import MissionTile, { MissionsHeading } from "../MissionTile";
import NightTrack from "../NightTrack";
import VampireAvatar from "../VampireAvatar";

/**
 * The map at full height, and beside it only what belongs to the map: the
 * night so far, the Labyrinth's Roses, the Tavern, the Castle tiles and the
 * Public Missions.
 */
export default function MapView({ ix }: { ix: HungerInteraction }) {
  const { view, legalActions, send } = ix;
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className={wide ? "min-h-0 min-w-0 flex-1" : "aspect-square w-full"}>
        <HungerMap
          view={view}
          targets={ix.targets}
          onTarget={ix.onTarget}
          activeSeat={ix.activeSeat}
        />
      </div>
      <aside className="flex w-full flex-col gap-3 lg:w-88 lg:shrink-0 lg:overflow-y-auto">
        <NightTrack turn={view.turn} />

        <Panel title="The Labyrinth" note="Free to take there · counts as your Hunt" ornate>
          <div className="grid w-full grid-cols-3 gap-2">
            {ROSES.map((def) => {
              const rose = view.roses.find((id) => cardDef(id).id === def.id);
              const owner = rose ? undefined : roseOwner(view, def.id);
              if (!rose) {
                return (
                  <div key={def.id} className="relative">
                    <HungerCard card={def.id} disabled className="opacity-35 grayscale" />
                    {owner !== undefined && (
                      <VampireAvatar
                        vampire={view.players[owner].vampire}
                        className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2"
                      />
                    )}
                  </div>
                );
              }
              const take = legalActions.find((a) => a.type === "hunt-rose" && a.card === rose);
              const face = (
                <CardPreview key={rose} card={rose}>
                  <HungerCard card={rose} glowing={Boolean(take)} />
                </CardPreview>
              );
              return take ? (
                <Button
                  key={def.id}
                  variant="plain"
                  bleed
                  onClick={() => send(take)}
                  aria-label={`Take ${def.name}`}
                >
                  {face}
                </Button>
              ) : (
                <div key={def.id}>{face}</div>
              );
            })}
          </div>
        </Panel>

        <Panel title="The Tavern" note="Face down · hunt them all for 2 Speed, from the action bar">
          <div className="flex items-center justify-center gap-6">
            <TavernStack count={view.tavernCount} />
            <div className="flex flex-col items-center gap-2">
              {artUrl("tavern-sign") && (
                <img
                  src={artUrl("tavern-sign")}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="h-16 w-auto object-contain drop-shadow-lg"
                />
              )}
              <span className="text-sm font-semibold tabular-nums text-fg-strong">
                {view.tavernCount} card{view.tavernCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Castle tiles" note="Taken in order by each Vampire home">
          <div className="flex justify-center gap-2">
            {castleTiles(view).map((t, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: tiles keep their order; values repeat
              <div key={i} className="relative">
                <CastleTile
                  vp={t.vp}
                  className={cn("h-16 w-14", t.owner !== undefined && "opacity-40 grayscale")}
                />
                {t.owner !== undefined && (
                  <VampireAvatar
                    vampire={view.players[t.owner].vampire}
                    className="absolute -bottom-1 -right-1 h-6 w-6"
                  />
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Public Missions" note="Everyone scores these at sunrise" missions>
          <div className="flex w-full flex-col gap-2">
            {view.publicMissions.map((m) => (
              <MissionTile key={m} id={m} />
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

/**
 * One section of the side panel. Every section takes an equal share of the
 * free height and centres its content, so the panel fills the column and no
 * section jumps as the night goes on.
 */
function Panel({
  title,
  note,
  ornate = false,
  missions = false,
  children,
}: {
  title: string;
  note: string;
  ornate?: boolean;
  missions?: boolean;
  children: ReactNode;
}) {
  return (
    <Surface
      variant="raised"
      padding="md"
      className="relative flex flex-[1_0_auto] flex-col items-center justify-center gap-3"
    >
      {ornate && <PanelCorners art="frame-ornament" corners={2} className="h-14 w-14 opacity-90" />}
      <div className="relative flex flex-col items-center gap-0.5 text-center">
        {missions ? (
          <MissionsHeading>{title}</MissionsHeading>
        ) : (
          <Eyebrow size="sm">{title}</Eyebrow>
        )}
        <span className="text-3xs text-fg-muted">{note}</span>
      </div>
      {children}
    </Surface>
  );
}

/** Whoever holds a Rose — Roses are Permanent, so it sits in a playing area. */
function roseOwner(view: HungerPlayerView, roseId: string): number | undefined {
  return view.players.find((p) =>
    [...p.playArea.map((c) => c.id), ...p.discard, ...p.digested].some(
      (id) => cardDef(id).id === roseId,
    ),
  )?.index;
}

/** Every Castle tile of the game: claimed ones first (with who took them), then the rest. */
function castleTiles(view: HungerPlayerView): { vp: number; owner?: number }[] {
  const claimed = view.players
    .filter((p) => p.castleTile !== null)
    .map((p) => ({ vp: p.castleTile ?? 0, owner: p.index }))
    .sort((a, b) => b.vp - a.vp);
  return [...claimed, ...view.castleTiles.map((vp) => ({ vp }))];
}

/** A small fanned stack of face-down cards. */
function TavernStack({ count }: { count: number }) {
  const shown = Math.min(count, 3);
  return (
    <div className="relative h-20 w-16 shrink-0" aria-hidden>
      {count === 0 && (
        <div className="absolute inset-0 rounded-card-md border border-dashed border-line" />
      )}
      {Array.from({ length: shown }, (_, i) => i).map((i) => (
        <CardBack
          key={i}
          className="absolute inset-0"
          style={{ transform: `translate(${i * 4}px, ${-i * 3}px) rotate(${(i - 1) * 4}deg)` }}
        />
      ))}
    </div>
  );
}
