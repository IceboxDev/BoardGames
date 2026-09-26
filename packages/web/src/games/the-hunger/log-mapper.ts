import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import type { HungerPlayerView, LogEntry } from "@boardgames/core/games/the-hunger/types";
import { createElement } from "react";
import type {
  LogAction,
  LogBlock,
  LogCardRef,
  LogSpan,
  LogTextSpan,
} from "../../components/action-log";
import HungerCard from "./components/HungerCard";
import { TONE_HEX, toneOf } from "./logic/card-colors";
import {
  bonusName,
  cardName,
  missionName,
  seatLabel,
  spaceLabel,
  vampireColor,
} from "./logic/labels";

type View = Pick<HungerPlayerView, "me" | "players" | "options">;

const FATE_TEXT = {
  castle: "safe in the Castle",
  cemetery: "hid in a Cemetery vault (−5)",
  mountains: "sheltered in the Mountains",
  ashes: "burned to ashes at sunrise",
} as const;

/** A card tag in the log: its kind's colour, and the full card on hover. */
function cardRef(id: string): LogCardRef {
  return {
    card: cardName(id),
    color: TONE_HEX[toneOf(cardDef(id))],
    tooltipContent: createElement(HungerCard, { card: id }),
  };
}

function who(view: View, seat: number, names: readonly (string | null)[]): LogTextSpan {
  const p = view.players[seat];
  return {
    text: seatLabel(view, seat, names),
    bold: true,
    color: p ? vampireColor(p.vampire) : undefined,
  };
}

function describe(
  e: LogEntry,
  view: View,
  names: readonly (string | null)[],
): Omit<LogAction, "key"> | null {
  const where = (id: string) => spaceLabel(view.options, id);
  switch (e.t) {
    case "turn":
      return null;
    case "resolve":
      return {
        icon: "🃏",
        variant: "info",
        spans: [
          who(view, e.p, names),
          " used ",
          cardRef(e.card),
          ...(e.discarded ? [" discarding ", cardRef(e.discarded) as LogSpan] : []),
          e.drew ? `, drew ${e.drew}` : "",
        ],
      };
    case "bonus":
      return {
        icon: "🎁",
        variant: "info",
        spans: [who(view, e.p, names), ` spent ${bonusName(e.bonus)}`],
      };
    case "confuse":
      return {
        icon: "😵",
        variant: "warning",
        spans: [who(view, e.p, names), " was Confused toward the Labyrinth, to ", where(e.to)],
      };
    case "move":
      return {
        icon: "🦇",
        variant: "action",
        spans: [
          who(view, e.p, names),
          " moved to ",
          where(e.to),
          e.spent ? ` (${e.spent} Speed)` : "",
        ],
      };
    case "push":
      return {
        icon: "💨",
        variant: "warning",
        spans: [who(view, e.p, names), " pushed ", who(view, e.victim, names), " to ", where(e.to)],
      };
    case "castle":
      return {
        icon: "🏰",
        variant: "success",
        spans: [who(view, e.p, names), ` returned to the Castle (+${e.tile} VP)`],
      };
    case "chest":
      return {
        icon: "🗝",
        variant: "success",
        spans: [who(view, e.p, names), ` opened a Chest: ${bonusName(e.bonus)} (+${e.vp} VP)`],
      };
    case "digest":
      return {
        icon: "🩸",
        variant: "info",
        spans: [who(view, e.p, names), " digested ", cardRef(e.card)],
      };
    case "missions":
      return {
        icon: "📜",
        variant: "info",
        spans: [
          who(view, e.p, names),
          e.source === "setup"
            ? " chose a starting Mission"
            : ` visited the ${e.source} Crypt (keeps ${e.kept})`,
        ],
      };
    case "hunt":
      return {
        icon: e.source === "rose" ? "🌹" : "🩸",
        variant: "action",
        spans: [
          who(view, e.p, names),
          e.source === "gregarious"
            ? " — a Gregarious Human brought "
            : e.source === "familiar"
              ? " tamed "
              : e.source === "tavern"
                ? " hunted the Tavern: "
                : e.col
                  ? ` hunted column ${e.col}: `
                  : " took ",
          ...e.cards.flatMap((c, i): LogSpan[] => [i > 0 ? ", " : "", cardRef(c)]),
          ` (+${e.vp} VP)`,
        ],
      };
    case "instant":
      return {
        icon: "✨",
        variant: "special",
        spans: [
          who(view, e.p, names),
          ` discarded ${missionName(e.mission)}`,
          e.vp > 0 ? ` (+${e.vp} VP)` : "",
        ],
      };
    case "familiar":
      return {
        icon: "🐾",
        variant: "special",
        spans: [
          who(view, e.p, names),
          " — ",
          cardRef(e.card),
          ...(e.target ? [" digested ", cardRef(e.target) as LogSpan] : []),
          e.vp > 0 ? ` (+${e.vp} VP)` : "",
        ],
      };
    case "hypnosis":
      return {
        icon: "🌀",
        variant: "info",
        spans: [
          who(view, e.p, names),
          " hypnotised ",
          cardRef(e.card),
          ` to row ${e.row + 1}, column ${e.col + 1}`,
        ],
      };
    case "nanny":
      return {
        icon: "🧹",
        variant: "warning",
        spans: [who(view, e.p, names), " gave up ", cardRef(e.card), " to the Nanny"],
      };
    case "end-turn":
      return e.vp > 0
        ? {
            icon: "🌹",
            variant: "success",
            spans: [who(view, e.p, names), ` ended the turn (+${e.vp} VP)`],
          }
        : null;
    case "sunrise":
      return {
        icon: e.fate === "ashes" ? "🔥" : "🌅",
        variant: e.fate === "ashes" ? "danger" : "neutral",
        spans: [who(view, e.p, names), ` ${FATE_TEXT[e.fate]}`],
      };
  }
}

/** One block per night turn, oldest first (ActionLog shows newest first). */
export function mapHungerLog(
  log: readonly LogEntry[],
  view: View,
  names: readonly (string | null)[],
): LogBlock[] {
  const blocks: LogBlock[] = [{ key: "setup", label: "Setup", actions: [] }];
  log.forEach((e, i) => {
    if (e.t === "turn") {
      blocks.push({
        key: `turn-${e.turn}`,
        label: e.turn > 15 ? "Parasol turn" : `Turn ${e.turn}`,
        actions: [],
      });
      return;
    }
    if (e.t === "sunrise" && blocks[blocks.length - 1]?.key !== "sunrise") {
      blocks.push({ key: "sunrise", label: "Sunrise", actions: [] });
    }
    const action = describe(e, view, names);
    if (action) blocks[blocks.length - 1].actions.push({ key: i, ...action });
  });
  return blocks.filter((b) => b.actions.length > 0);
}
