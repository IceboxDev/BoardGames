import { motion } from "framer-motion";
import { type CSSProperties, useRef } from "react";
import { cn } from "../../../lib/cn";
import { AgentGlyph, AssassinGlyph, BystanderGlyph } from "./Glyphs";

// The 5×5 table, shared by Codenames and Duet (and their reviews). Each game
// maps its own view to `GridCard`s: what covers a card, the key tint a
// spymaster sees under a face-down one, teammates' pointers, and — in the
// review — which cards the shown turn was about.
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
  /** Initials of teammates pointing at it. */
  marks: readonly string[];
  /** Small corner chips (Duet: which sides revealed a bystander here). */
  badges?: readonly { label: string; tone: CoverTone }[];
  pickable: boolean;
  /** Spymaster writing a clue: this card is one of its targets. */
  chosen?: boolean;
  /** Review: part of the shown turn ("focus") or not ("fade"). */
  emphasis?: "focus" | "fade";
  /** Review: the shown clue was aimed at this card. */
  target?: boolean;
  /** Review: the n-th card touched in the shown turn. */
  touch?: number;
}

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
  onMark,
}: {
  card: GridCard;
  onPick: () => void;
  onMark?: () => void;
}) {
  // A cover that arrives while the board is open is laid on; one already
  // there when the board appears simply is.
  const coveredAtMount = useRef(card.cover !== null);
  const covered = card.cover !== null;
  const key = !covered ? card.keyTone : null;
  const dark = key === "ink";
  const label = covered ? `${card.word}: ${COVER_LABEL[card.cover as CoverTone]}` : card.word;

  return (
    <div
      className={cn(
        "group relative min-h-0 min-w-0 transition-[opacity,filter,transform] duration-300",
        card.emphasis === "fade" && "opacity-35 saturate-50",
      )}
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: the word card is the game piece itself */}
      <button
        type="button"
        disabled={!card.pickable}
        onClick={onPick}
        aria-label={label}
        aria-pressed={card.chosen ?? undefined}
        className={cn(
          "@container relative block h-full w-full overflow-hidden rounded-card-md text-left shadow-md transition-[transform,box-shadow] duration-150",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400/70",
          dark
            ? "bg-gradient-to-b from-surface-700 to-surface-900"
            : "bg-gradient-to-b from-cn-card to-cn-card-shade",
          card.pickable
            ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            : "cursor-default",
          card.chosen && "-translate-y-0.5 shadow-xl ring-4 ring-accent-400",
          card.target &&
            !card.chosen &&
            "ring-2 ring-fg-strong ring-offset-2 ring-offset-surface-950",
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
      </button>

      {card.touch !== undefined && (
        <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-raised flex h-6 w-6 items-center justify-center rounded-full bg-fg-strong text-xs font-black tabular-nums text-surface-950 shadow-lg">
          {card.touch}
        </span>
      )}

      {card.marks.length > 0 && (
        <span className="pointer-events-none absolute -top-2 left-1 z-raised flex gap-0.5">
          {card.marks.map((m) => (
            <span
              key={m}
              className="rounded-full bg-accent-500 px-1.5 text-3xs font-bold leading-5 text-on-accent shadow-lg ring-2 ring-surface-950"
            >
              {m}
            </span>
          ))}
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

      {onMark && card.pickable && (
        // biome-ignore lint/correctness/noRestrictedElements: a corner pointer on the card piece
        <button
          type="button"
          onClick={onMark}
          aria-label={`Point at ${card.word}`}
          title="Point this card out to your team (doesn't guess it)"
          className="absolute -right-1.5 -top-1.5 z-raised hidden h-6 w-6 items-center justify-center rounded-full bg-surface-900 text-xs text-fg-primary shadow-lg ring-1 ring-line-strong hover:bg-surface-800 group-hover:flex"
        >
          ☝
        </button>
      )}
    </div>
  );
}

export function WordGrid({
  cards,
  onPick,
  onMark,
  className,
}: {
  cards: readonly GridCard[];
  onPick?: (index: number) => void;
  onMark?: (index: number) => void;
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
            {...(onMark ? { onMark: () => onMark(i) } : {})}
          />
        ))}
      </div>
    </div>
  );
}
