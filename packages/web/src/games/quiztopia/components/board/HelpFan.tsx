import { helpCardDef } from "@boardgames/core/games/quiztopia/help-cards";
import type { HelpCardId, HelpCardState } from "@boardgames/core/games/quiztopia/types";
import { CardFan } from "../../../../components/card-fan";
import { cardChrome } from "../../../../components/card-fan/card-chrome";
import { Badge, Eyebrow, MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type BoardLanguage, helpCardName, pickTexts } from "../../logic/copy";

// "Hilfe in der Not": the face-up help cards as the table's hand. A card the
// engine lists as playable for this seat glows; clicking any face-up card
// opens its dialog. The face-down rest and the used count sit in the header
// line, which is why the faces are a step narrower than the fan's 160px
// slot — the whole thing has to live inside the fixed `h-fan` tray.

type Props = {
  faceUp: readonly HelpCardState[];
  hidden: number;
  deckSize: number;
  playerCount: number;
  playableIds: ReadonlySet<HelpCardId>;
  lang: BoardLanguage;
  onOpen: (id: HelpCardId) => void;
};

function HelpCardFace({
  card,
  lang,
  playable,
  hovered,
  size = "hand",
}: {
  card: HelpCardState;
  lang: BoardLanguage;
  playable: boolean;
  hovered?: boolean;
  size?: "hand" | "preview";
}) {
  const def = helpCardDef(card.id);
  const texts = pickTexts(lang, def.textEn, def.textDe);
  const preview = size === "preview";
  return (
    <div
      className={cardChrome({
        size: preview ? "w-72 aspect-card" : "mx-auto w-36 aspect-card",
        rounded: "lg",
        hover: "none",
        disabled: card.used,
        glowClass: playable && !card.used ? "ring-1 ring-purple-400/60 shadow-purple-500/30" : "",
        className: cn(
          "flex flex-col border bg-surface-900 text-left",
          card.used ? "border-line" : "border-purple-500/40",
          hovered && playable && "ring-2 ring-purple-300/70",
        ),
      })}
      role="img"
      aria-label={`${helpCardName(card.id, lang)}${card.used ? ", used" : playable ? ", playable" : ""}`}
    >
      <span className="h-1 w-full shrink-0 bg-purple-400" aria-hidden="true" />
      <div className="flex flex-col gap-1.5 p-2.5">
        <MicroLabel className="truncate text-purple-300">Help in need</MicroLabel>
        <p
          className={cn(
            "font-semibold leading-tight text-fg-strong",
            preview ? "text-lg" : "text-sm",
          )}
        >
          {helpCardName(card.id, lang)}
        </p>
        {card.used ? (
          <Badge tone="neutral" size="xs" className="self-start">
            used
          </Badge>
        ) : def.assumed ? (
          <Badge
            tone="purple"
            size="xs"
            className="self-start"
            title="Effect designed from the name"
          >
            assumed
          </Badge>
        ) : null}
        {texts.map((text, i) => (
          <p
            key={text}
            className={cn(
              "leading-snug text-fg-secondary",
              preview ? "text-sm" : i === 0 ? "line-clamp-4 text-2xs" : "line-clamp-2 text-3xs",
            )}
          >
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function HelpFan({
  faceUp,
  hidden,
  deckSize,
  playerCount,
  playableIds,
  lang,
  onOpen,
}: Props) {
  const used = faceUp.filter((c) => c.used).length;
  const cards = [...faceUp];
  return (
    <div className="relative flex h-full w-full items-end" data-testid="help-fan">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3">
        <Eyebrow size="sm" tone="neutral" className="text-purple-300">
          Help in need
        </Eyebrow>
        <MicroLabel className="tabular-nums">
          {faceUp.length} face-up · {hidden} face-down · {used} used
        </MicroLabel>
        {playerCount === 1 && (
          <MicroLabel title="Datenleak, Insidertipp and Benefizvorstellung need a table">
            Solo: 3 help cards removed
          </MicroLabel>
        )}
        {deckSize === 0 && <MicroLabel>No help cards</MicroLabel>}
      </div>
      <div className="min-w-0 flex-1">
        <CardFan
          cards={cards}
          getCardId={(c) => c.id}
          maxRotation={8}
          renderCard={(card, { isHovered }) => (
            <HelpCardFace
              card={card}
              lang={lang}
              playable={playableIds.has(card.id)}
              hovered={isHovered}
            />
          )}
          onCardClick={(card) => onOpen(card.id)}
        />
      </div>
    </div>
  );
}
