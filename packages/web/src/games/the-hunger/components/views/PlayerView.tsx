import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import type { CardId, PlayCard } from "@boardgames/core/games/the-hunger/types";
import { useState } from "react";
import { Button, Eyebrow, MicroLabel, Modal, ModalBody, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type ArtName, artUrl, vampireArt } from "../../logic/art";
import type { HungerInteraction } from "../../logic/interaction";
import { seatLabel, spaceLabel, vampireColor, vampireName } from "../../logic/labels";
import CardBack from "../CardBack";
import CardPreview from "../CardPreview";
import { BonusToken, PanelCorners } from "../Fittings";
import HungerCard from "../HungerCard";
import MissionTile, { MissionsHeading } from "../MissionTile";
import VampireAvatar from "../VampireAvatar";

/**
 * A Vampire's board: the playing area laid out large, every pile open to
 * browse, the tokens and Missions. Every seat has one; only your own is
 * interactive and shows your Missions — another Vampire's Missions stay face
 * down until spent. Your hand fans in GameScreen's fan slot.
 */
export default function PlayerView({
  ix,
  names,
  seat,
}: {
  ix: HungerInteraction;
  names: readonly (string | null)[];
  /** Whose board to show. */
  seat: number;
}) {
  const { view } = ix;
  const me = view.players[seat];
  if (!me) return <p className="text-sm text-fg-muted">Nobody sits there.</p>;
  const mine = seat === view.me;
  const playArea = mine ? ix.playArea : me.playArea;
  const permanents = playArea.filter((c) => cardDef(c.id).keywords.includes("permanent"));
  const played = playArea.filter((c) => !cardDef(c.id).keywords.includes("permanent"));
  const selected = mine && ix.pending?.kind === "card" ? ix.pending.source : null;
  const acting = ix.activeSeat === seat;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {/* Header: who you are and where you stand. */}
      <Surface variant="raised" padding="md" className="flex shrink-0 flex-wrap items-center gap-4">
        <VampireAvatar vampire={me.vampire} className="h-16 w-16 text-3xl" />
        <div className="flex min-w-0 flex-col">
          <span className="text-lg font-bold text-fg-strong">
            {seatLabel(view, me.index, names)}
          </span>
          <span className="text-xs text-fg-muted">
            {spaceLabel(view.options, me.pos)}
            {me.castleTile !== null && ` · home, +${me.castleTile} VP`}
          </span>
        </div>
        <div className="relative ml-auto flex gap-6">
          {artUrl("ink-splatter") && (
            <img
              src={artUrl("ink-splatter")}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute -top-6 -left-8 h-24 w-24 opacity-25 invert"
            />
          )}
          <Stat label="VP" value={me.vp} />
          <Stat label="Expected Speed" value={me.expectedSpeed} />
          <Stat label="Hunted" value={me.hunted} />
        </div>
      </Surface>

      <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(11rem,15rem)_1fr_20rem]">
        <VampirePortrait vampire={me.vampire} />

        {/* The board: your playing area. */}
        <Surface
          variant="raised"
          padding="md"
          className="relative flex min-h-0 flex-col gap-3 overflow-hidden"
          style={woodBoard()}
        >
          <PanelCorners art="board-corner" className="h-12 w-12 opacity-90" />
          <div className="flex items-baseline justify-between">
            <Eyebrow size="sm">In play</Eyebrow>
            <span className="text-2xs text-fg-muted">
              {mine
                ? acting
                  ? "Click a glowing card to use it"
                  : "Your hand comes into play at the start of your turn"
                : acting
                  ? "Playing their turn now"
                  : `${me.handCount} cards in hand, face down`}
            </span>
          </div>
          <CardRow
            title="Permanent"
            cards={permanents}
            ix={ix}
            interactive={mine}
            selected={selected}
            empty="No Permanent cards yet"
          />
          <CardRow
            title="This turn"
            cards={played}
            ix={ix}
            interactive={mine}
            selected={selected}
            empty={acting ? "Nothing played" : "—"}
          />
          <div className="mt-auto flex flex-wrap gap-3 border-t border-line-soft pt-3">
            <PileStack
              zone="zone-deck"
              title="Draw pile"
              cards={me.drawPile}
              faceDown
              vampire={me.vampire}
              note="unordered"
            />
            <PileStack zone="zone-discard" title="Discard pile" cards={me.discard} />
            <PileStack zone="zone-digestion" title="Digested" cards={me.digested} />
          </div>
        </Surface>

        <div className="flex flex-col gap-3">
          <Surface variant="raised" padding="md" className="flex flex-col gap-2">
            <Eyebrow size="sm">Bonus tokens · {me.bonus.length}</Eyebrow>
            {me.bonus.length === 0 && <span className="text-xs text-fg-muted">None yet</span>}
            <div className="flex flex-wrap gap-2">
              {me.bonus.map((b) => {
                const usable = mine && ix.usableTokens.has(b.id);
                const token = <BonusToken key={b.id} id={b.id} used={b.used} className="w-20" />;
                return usable ? (
                  <Button
                    key={b.id}
                    variant="plain"
                    bleed
                    onClick={() => ix.onToken(b.id)}
                    aria-label={`Use ${bonusDef(b.id).name}: ${bonusDef(b.id).text}`}
                    aria-pressed={ix.pending?.kind === "token" && ix.pending.token === b.id}
                    className={cn(
                      "w-auto rounded-full ring-2 ring-amber-300/70",
                      ix.pending?.kind === "token" &&
                        ix.pending.token === b.id &&
                        "ring-amber-200 shadow-glow-amber",
                    )}
                  >
                    {token}
                  </Button>
                ) : (
                  <span key={b.id}>{token}</span>
                );
              })}
            </div>
          </Surface>
          <Surface variant="raised" padding="md" className="flex flex-col gap-2">
            {mine ? (
              <>
                <MissionsHeading>Your Missions · {view.missions.length}</MissionsHeading>
                {view.missions.length === 0 && me.usedMissions.length === 0 && (
                  <span className="text-xs text-fg-muted">None held</span>
                )}
                {view.missions.map((m) => (
                  <MissionTile key={m} id={m} />
                ))}
              </>
            ) : (
              <>
                <MissionsHeading>Missions · {me.missionCount} held</MissionsHeading>
                <span className="text-xs text-fg-muted">
                  {me.missionCount === 0
                    ? "None held"
                    : "Face down until the end of the game, or until spent as an Instant."}
                </span>
              </>
            )}
            {me.usedMissions.map((m) => (
              <MissionTile key={m} id={m} badge="used" className="opacity-50" />
            ))}
          </Surface>
        </div>
      </div>
    </div>
  );
}

/**
 * Your Vampire at full length, standing over their seat crest in a panel lit
 * with their colour. Hidden below `xl`, where the board needs the width.
 */
function VampirePortrait({ vampire }: { vampire: number }) {
  const full = vampireArt(vampire, "full");
  const sigil = vampireArt(vampire, "sigil");
  const color = vampireColor(vampire);
  if (!full) return null;
  return (
    <Surface
      variant="raised"
      padding="none"
      className="relative hidden min-h-0 overflow-hidden xl:flex xl:flex-col xl:items-center xl:justify-end"
      style={{ background: `radial-gradient(ellipse at 50% 30%, ${color}55, transparent 70%)` }}
    >
      {sigil && (
        <img
          src={sigil}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute left-1/2 top-4 w-3/4 -translate-x-1/2 opacity-15"
        />
      )}
      <img
        src={full}
        alt={vampireName(vampire)}
        draggable={false}
        className="relative max-h-full w-full object-contain object-bottom drop-shadow-2xl"
      />
    </Surface>
  );
}

/** The playing area laid on dark mahogany, darkened so the cards stay the focus. */
function woodBoard() {
  const wood = artUrl("board-wood");
  return wood
    ? {
        background: `linear-gradient(rgb(12 7 16 / 0.72), rgb(12 7 16 / 0.8)), url(${wood}) center / 512px repeat`,
      }
    : undefined;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-xl font-bold text-fg-strong tabular-nums">{value}</span>
      <MicroLabel>{label}</MicroLabel>
    </div>
  );
}

function CardRow({
  title,
  cards,
  ix,
  interactive,
  selected,
  empty,
}: {
  title: string;
  cards: readonly PlayCard[];
  ix: HungerInteraction;
  /** Only your own board's cards can be used. */
  interactive: boolean;
  selected: CardId | null;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <MicroLabel>{title}</MicroLabel>
      {cards.length === 0 && <span className="text-xs text-fg-muted">{empty}</span>}
      <div className="flex flex-wrap gap-2">
        {cards.map((c) => {
          const clickable = interactive && ix.clickableCards.has(c.id);
          const face = (
            <CardPreview key={c.id} card={c.id} className="w-40 2xl:w-48">
              <HungerCard
                card={c.id}
                spent={c.resolved}
                glowing={clickable}
                selected={selected === c.id}
              />
            </CardPreview>
          );
          return clickable ? (
            <Button
              key={c.id}
              variant="plain"
              bleed
              onClick={() => ix.onCard(c.id)}
              aria-label={`${cardDef(c.id).name}${cardDef(c.id).text ? ` — ${cardDef(c.id).text}` : ""}`}
              className="w-auto"
            >
              {face}
            </Button>
          ) : (
            <div key={c.id}>{face}</div>
          );
        })}
      </div>
    </section>
  );
}

/** A pile as a stack with its count; click to browse every card in it. */
function PileStack({
  zone,
  title,
  cards,
  faceDown = false,
  vampire,
  note,
}: {
  /** The pile's emblem, beside its title. */
  zone: ArtName;
  title: string;
  cards: readonly CardId[];
  faceDown?: boolean;
  /** Whose Starting-deck back a face-down pile shows. */
  vampire?: number;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const top = cards[cards.length - 1];
  return (
    <>
      <Button
        variant="ghost"
        disabled={cards.length === 0}
        onClick={() => setOpen(true)}
        aria-label={`${title}: ${cards.length} cards — browse`}
        className="h-auto"
      >
        <span className="relative h-16 w-12 shrink-0" aria-hidden>
          {cards.length === 0 ? (
            <span className="absolute inset-0 rounded-card-md border border-dashed border-line" />
          ) : faceDown || !top ? (
            <CardBack vampire={vampire} className="absolute inset-0" />
          ) : (
            <span className="absolute inset-0 overflow-hidden rounded-card-md">
              <HungerCard card={top} size="mini" className="h-full w-full" />
            </span>
          )}
          {cards.length > 1 && (
            <span className="absolute -bottom-1 -right-1 -z-0 h-16 w-12 rounded-card-md border border-line bg-fill" />
          )}
        </span>
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-primary">
            {artUrl(zone) && (
              <img src={artUrl(zone)} alt="" aria-hidden draggable={false} className="h-5 w-5" />
            )}
            {title}
          </span>
          <span className="text-2xs text-fg-muted">
            {cards.length} card{cards.length === 1 ? "" : "s"}
            {note ? ` · ${note}` : ""}
          </span>
        </span>
      </Button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          size="xl"
          title={title}
          subheader={`${cards.length} cards${note ? `, ${note}` : ""}`}
        >
          <ModalBody>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {[...cards].reverse().map((id) => (
                <CardPreview key={id} card={id}>
                  <HungerCard card={id} />
                </CardPreview>
              ))}
            </div>
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
