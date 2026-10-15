import { motion } from "framer-motion";
import { type CSSProperties, useRef } from "react";
import { Avatar, Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { AgentGlyph, AssassinGlyph, BystanderGlyph } from "./Glyphs";

// The 5×5 table, shared by Codenames and Duet (and their reviews). Each game
// maps its own view to `GridCard`s: what covers a card, the key tint a
// spymaster sees under a face-down one, the team's pointers (avatars on the
// card each operative would touch) and sticky notes (earlier clues pinned to
// it), the viewer's own pick with its Touch button, and — in the review —
// which cards the shown turn was about.
//
// Touching is two steps by design: a tap picks (and points), the Touch button
// on the picked card commits. Every control is a tap target — nothing here
// depends on hover, so a phone can do everything a mouse can.
//
// The grid sizes itself to its box (a size container): as wide as the
// column allows and as tall as the space left, never scrolling, always
// centred — the board doesn't move when the header changes.

export type CoverTone = "red" | "blue" | "tan" | "ink" | "green";

export interface GridCard {
  word: string;
  /** What covers it once touched; null while face down. */
  cover: CoverTone | null;
  /** The key under a face-down card, for whoever may see it. */
  keyTone: CoverTone | null;
  /** Teammates pointing at it — the card each of them would touch. */
  pointers?: readonly CardPointer[];
  /** The team's sticky notes on it: earlier clues it may belong to. */
  notes?: readonly CardNote[];
  /** The viewer's own pick: the card its Touch button commits. */
  selected?: boolean;
  /** Pinning a clue: this card already carries it (tap again to unpin). */
  pinned?: boolean;
  /** Small corner chips (Duet: which sides revealed a bystander here). */
  badges?: readonly { label: string; tone: CoverTone }[];
  pickable: boolean;
  /** Spymaster writing a clue: this card is one of its targets. */
  chosen?: boolean;
  /** Review: part of the shown turn ("focus") or not ("fade"). */
  emphasis?: "focus" | "fade";
  /** Review: the shown clue was aimed at this card. */
  target?: boolean;
  /** The n-th card touched in the shown turn (review) or the latest turn (live). */
  touch?: number;
  /** Live: the side that touched it, colouring its order badge. */
  touchTone?: CoverTone;
  /** Spymaster: a card an earlier clue meant that is still face down. */
  owed?: boolean;
}

export interface CardPointer {
  key: string;
  /** Who points — their name, for the avatar and its label. */
  name: string;
  /** The viewer's own pointer. */
  mine: boolean;
}

export interface CardNote {
  key: string;
  /** The pinned clue's word. */
  label: string;
  /** The whole story: the clue with its number, who pinned it. */
  title: string;
}

/** Ink in each tone, for a mark's numeral on the card's paper. */
const TONE_INK: Record<CoverTone, string> = {
  red: "text-cn-red",
  blue: "text-cn-blue",
  tan: "text-cn-tan-deep",
  ink: "text-cn-ink",
  green: "text-cn-green",
};

/**
 * The n-th touch of the latest turn (live) or the shown turn (review): the
 * tile's corner turned down, the number printed on the paper underside in
 * the ink of the side that touched it (none in the review, where every touch
 * is the shown turn's). A touch landing now folds in after its cover.
 */
function TouchMark({
  n,
  tone,
  animate,
}: {
  n: number;
  tone: CoverTone | undefined;
  animate: boolean;
}) {
  return (
    <motion.span
      {...(animate
        ? {
            initial: { opacity: 0, clipPath: "polygon(100% 0, 100% 0, 100% 0)" },
            transition: { delay: 0.18, duration: 0.28, ease: "easeOut" },
          }
        : { initial: false as const })}
      animate={{ opacity: 1, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
      aria-label={`Touch ${n}`}
      className="pointer-events-none absolute right-0 top-0 z-lift aspect-square w-[30%] @max-[7rem]:w-[40%]"
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-bl from-cn-plate via-cn-card to-cn-card-shade shadow-[-2px_2px_6px_rgb(0_0_0/0.35)] [clip-path:polygon(0_0,100%_0,100%_100%)]"
      />
      <span
        className={cn(
          "absolute right-[13%] top-[9%] font-black tabular-nums leading-none [font-size:11cqw] @max-[7rem]:[font-size:15cqw]",
          tone ? TONE_INK[tone] : "text-cn-card-ink",
        )}
      >
        {n}
      </span>
    </motion.span>
  );
}

/** How many pointers / notes a card shows before "+n". */
const MAX_POINTERS = 4;
const MAX_NOTES = 2;

const COVER_FILL: Record<CoverTone, string> = {
  red: "from-cn-red to-cn-red-deep",
  blue: "from-cn-blue to-cn-blue-deep",
  tan: "from-cn-tan to-cn-tan-deep",
  ink: "from-cn-ink to-cn-ink-deep",
  green: "from-cn-green to-cn-green-deep",
};

const SOLID: Record<CoverTone, string> = {
  red: "bg-cn-red",
  blue: "bg-cn-blue",
  tan: "bg-cn-tan",
  ink: "bg-cn-ink",
  green: "bg-cn-green",
};

/** The plate's tint and frame when the key shows under a face-down card. */
const KEY_PLATE: Record<CoverTone, string> = {
  red: "bg-cn-red/15 ring-2 ring-cn-red/80",
  blue: "bg-cn-blue/15 ring-2 ring-cn-blue/80",
  tan: "bg-cn-tan/25 ring-2 ring-cn-tan-deep/60",
  ink: "bg-cn-ink ring-2 ring-cn-ink",
  green: "bg-cn-green/15 ring-2 ring-cn-green/80",
};

const COVER_LABEL: Record<CoverTone, string> = {
  red: "Red agent",
  blue: "Blue agent",
  tan: "Bystander",
  ink: "Assassin",
  green: "Agent",
};

function Figure({ tone, className }: { tone: CoverTone; className?: string }) {
  if (tone === "ink") return <AssassinGlyph className={className} />;
  if (tone === "tan") return <BystanderGlyph className={className} />;
  return <AgentGlyph className={className} />;
}

/** A font size (in card-width units) that fits `word` across `span`% of the card. */
function fitSize(word: string, max: number, span: number): string {
  // ~0.86em per letter: a heavy uppercase face with pill tracking.
  return `${Math.min(max, span / Math.max(4, word.length * 0.86)).toFixed(2)}cqw`;
}

/**
 * The plate's word: the printed size on a roomy card, and on a narrow
 * (phone) card a bigger one across a wider plate — `[font-size:var(--…)]`
 * swaps them by the card's own width.
 */
function plateText(word: string): CSSProperties {
  return {
    "--cn-word": fitSize(word, 10.5, 74),
    "--cn-word-narrow": fitSize(word, 16, 94),
  } as CSSProperties;
}

/** Faint diagonal hatching, so a cover reads as a printed tile, not a flat fill. */
const HATCH: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.07) 0 2px, transparent 2px 9px)",
};

function WordCard({
  card,
  onPick,
  onTouch,
  touchLabel,
}: {
  card: GridCard;
  onPick: () => void;
  onTouch?: () => void;
  touchLabel: string;
}) {
  // A cover that arrives while the board is open is laid on; one already
  // there when the board appears simply is.
  const coveredAtMount = useRef(card.cover !== null);
  const covered = card.cover !== null;
  const key = !covered ? card.keyTone : null;
  const dark = key === "ink";
  const label = covered ? `${card.word}: ${COVER_LABEL[card.cover as CoverTone]}` : card.word;
  const pointers = card.pointers ?? [];
  const notes = card.notes ?? [];
  const raised = card.chosen || card.selected;

  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0 transition-[opacity,filter,transform] duration-300",
        card.emphasis === "fade" && "opacity-35 saturate-50",
      )}
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: the word card is the game piece itself */}
      <button
        type="button"
        data-word-card=""
        disabled={!card.pickable}
        onClick={onPick}
        aria-label={label}
        aria-pressed={card.chosen ?? card.selected ?? undefined}
        className={cn(
          "@container relative block h-full w-full overflow-hidden rounded-card-md text-left shadow-md transition-[transform,box-shadow] duration-150",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400/70",
          dark
            ? "bg-gradient-to-b from-surface-700 to-surface-900"
            : "bg-gradient-to-b from-cn-card to-cn-card-shade",
          card.pickable
            ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            : "cursor-default",
          raised && "-translate-y-0.5 shadow-xl ring-4 ring-accent-400",
          card.pinned && !raised && "ring-4 ring-cn-note ring-offset-2 ring-offset-surface-950",
          card.target &&
            !raised &&
            !card.pinned &&
            "ring-2 ring-fg-strong ring-offset-2 ring-offset-surface-950",
          card.owed && "outline-dashed outline-2 outline-offset-2 outline-cn-note",
        )}
      >
        {/* The printed card: frame, emblem, and the word on its plate. */}
        <span
          className={cn(
            "absolute inset-[4%] flex flex-col rounded-ui-md border",
            dark ? "border-fg-strong/15" : "border-cn-card-ink/15",
          )}
        >
          <span className="flex min-h-0 flex-1 items-center justify-center">
            <span
              className={cn(
                "flex aspect-square h-[70%] items-center justify-center rounded-full",
                key ? cn(SOLID[key], "text-cn-cover-ink") : "bg-cn-card-ink/10 text-cn-card-ink/35",
                dark && "bg-cn-cover-ink/90 text-cn-ink",
              )}
            >
              <Figure tone={key ?? "tan"} className="h-[72%] w-[72%]" />
            </span>
          </span>
          <span
            className={cn(
              "mx-[3%] mb-[4%] flex h-[46%] items-center justify-center rounded-ui-md px-[4%] shadow-inner @max-[7rem]:mx-[2%] @max-[7rem]:h-[52%] @max-[7rem]:px-[2%]",
              key ? KEY_PLATE[key] : "bg-cn-plate ring-1 ring-cn-card-ink/10",
            )}
          >
            <span
              className={cn(
                "w-full truncate text-center font-black uppercase leading-none tracking-pill [font-size:var(--cn-word)]",
                "@max-[7rem]:tracking-normal @max-[7rem]:[font-size:var(--cn-word-narrow)]",
                dark ? "text-cn-cover-ink" : "text-cn-card-ink",
              )}
              style={plateText(card.word)}
            >
              {card.word}
            </span>
          </span>
        </span>

        {key && key !== "ink" && (
          <span
            aria-hidden
            className={cn("absolute left-0 top-0 h-[22%] w-[3.5%] rounded-br-ui-md", SOLID[key])}
          />
        )}

        {covered && (
          <motion.span
            aria-hidden
            initial={
              coveredAtMount.current ? false : { opacity: 0, scale: 1.18, y: -10, rotate: -3 }
            }
            animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center rounded-card-md bg-gradient-to-br shadow-inner",
              COVER_FILL[card.cover as CoverTone],
            )}
          >
            <span aria-hidden className="absolute inset-0 rounded-card-md" style={HATCH} />
            <Figure
              tone={card.cover as CoverTone}
              className="relative h-[52%] w-[52%] text-cn-cover-ink/85 drop-shadow"
            />
            <span
              className="relative mt-[2%] w-full truncate px-[6%] text-center font-bold uppercase leading-none tracking-pill text-cn-cover-ink/75 [font-size:var(--cn-word)] @max-[7rem]:px-[3%] @max-[7rem]:tracking-normal @max-[7rem]:[font-size:var(--cn-word-narrow)]"
              style={
                {
                  "--cn-word": fitSize(card.word, 7, 70),
                  "--cn-word-narrow": fitSize(card.word, 13, 90),
                } as CSSProperties
              }
            >
              {card.word}
            </span>
          </motion.span>
        )}

        {card.touch !== undefined && (
          <TouchMark n={card.touch} tone={card.touchTone} animate={!coveredAtMount.current} />
        )}
      </button>

      {pointers.length > 0 && (
        <span
          className="pointer-events-none absolute -top-2.5 right-1 z-raised flex -space-x-1.5"
          title={`Pointing here: ${pointers.map((p) => (p.mine ? "you" : p.name)).join(", ")}`}
        >
          {pointers.slice(0, MAX_POINTERS).map((p) => (
            <span
              key={p.key}
              className={cn(
                "rounded-full bg-surface-900 shadow-lg ring-2",
                p.mine ? "ring-accent-400" : "ring-surface-950",
              )}
            >
              <Avatar name={p.name} size="xs" className="h-6 w-6" />
            </span>
          ))}
          {pointers.length > MAX_POINTERS && (
            <span className="flex h-6 items-center rounded-full bg-surface-900 px-1.5 text-3xs font-bold text-fg-primary ring-2 ring-surface-950">
              +{pointers.length - MAX_POINTERS}
            </span>
          )}
        </span>
      )}

      {notes.length > 0 && (
        <span
          className="pointer-events-none absolute inset-x-1 -bottom-2 z-raised flex gap-0.5"
          title={notes.map((n) => n.title).join("\n")}
        >
          {notes.slice(0, MAX_NOTES).map((n, i) => (
            <span
              key={n.key}
              className={cn(
                "min-w-0 truncate rounded-ui-md bg-cn-note px-1.5 text-3xs font-black uppercase leading-5 tracking-pill text-cn-note-ink shadow-lg ring-1 ring-cn-note-ink/20",
                i % 2 === 0 ? "-rotate-3" : "rotate-2",
              )}
            >
              {n.label}
            </span>
          ))}
          {notes.length > MAX_NOTES && (
            <span className="shrink-0 rounded-ui-md bg-cn-note px-1 text-3xs font-black leading-5 text-cn-note-ink shadow-lg">
              +{notes.length - MAX_NOTES}
            </span>
          )}
        </span>
      )}

      {card.selected && onTouch && !covered && (
        <span className="absolute inset-x-0 top-[16%] z-raised flex justify-center">
          <Button
            size="xs"
            variant="primary"
            shape="pill"
            onClick={onTouch}
            aria-label={`${touchLabel} ${card.word}`}
            className="shadow-xl ring-2 ring-surface-950"
          >
            {touchLabel}
          </Button>
        </span>
      )}

      {card.badges && card.badges.length > 0 && (
        <span className="pointer-events-none absolute -bottom-1.5 right-1 z-raised flex gap-0.5">
          {card.badges.map((b) => (
            <span
              key={b.label}
              title={`Bystander for ${b.label}`}
              className={cn(
                "flex items-center gap-0.5 rounded-full px-1.5 text-3xs font-bold leading-5 shadow-lg ring-2 ring-surface-950",
                SOLID[b.tone],
                "text-cn-ink",
              )}
            >
              <BystanderGlyph className="h-2.5 w-2.5" />
              {b.label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function WordGrid({
  cards,
  onPick,
  onTouch,
  touchLabel = "Touch",
  className,
}: {
  cards: readonly GridCard[];
  onPick?: (index: number) => void;
  /** Commit the selected card (its Touch button). */
  onTouch?: (index: number) => void;
  touchLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-48 w-full flex-1 items-start justify-center [container-type:size]",
        className,
      )}
    >
      {/* Landscape cards as printed; on a phone-narrow board, taller ones that use the height. */}
      <div className="grid aspect-[8/5] w-[min(100cqw,160cqh)] grid-cols-5 grid-rows-5 gap-[1.1cqmin] @max-xl:aspect-[5/6] @max-xl:w-[min(100cqw,83cqh)]">
        {cards.map((card, i) => (
          <WordCard
            // biome-ignore lint/suspicious/noArrayIndexKey: the grid position is the card's identity
            key={i}
            card={card}
            onPick={() => onPick?.(i)}
            {...(onTouch ? { onTouch: () => onTouch(i) } : {})}
            touchLabel={touchLabel}
          />
        ))}
      </div>
    </div>
  );
}
