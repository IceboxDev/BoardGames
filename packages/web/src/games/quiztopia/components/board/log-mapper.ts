import { helpCardDef } from "@boardgames/core/games/quiztopia/help-cards";
import type {
  HelpCardId,
  QuestionLogEntry,
  QuiztopiaPlayerView,
} from "@boardgames/core/games/quiztopia/types";
import type { LogAction, LogBlock } from "../../../../components/action-log";
import { districtByIndex } from "../../bands";
import { deckLabel } from "../../logic/copy";
import { type SeatNames, seatName } from "../../logic/seats";

// The History rail: the view's `questionLog` (every judged or redrawn
// question) plus the turn in progress, grouped one block per turn. Nothing
// here reads an answer the viewer may not see — the log carries answers
// only for judged entries, and the live turn contributes no answer text.

type Lang = "en" | "de";

function buildingName(index: number, lang: Lang): string {
  const d = districtByIndex(index);
  return lang === "de" ? d.buildingLabelDe : d.buildingLabel;
}

function helpName(id: HelpCardId, lang: Lang): string {
  const def = helpCardDef(id);
  return lang === "de" ? def.nameDe : def.nameEn;
}

/** The one-line effect the log shows when a help card is played. */
export function helpLine(id: HelpCardId, lang: Lang): string {
  const name = helpName(id, lang);
  switch (id) {
    case "besetzung":
      return `${name} — a lost building returns to the middle`;
    case "datenleak":
      return `${name} — someone peeked at the answer`;
    case "insidertipp":
      return `${name} — the reader may say one word`;
    case "benefizvorstellung":
      return `${name} — the reader acts it out`;
    case "alternative-fakten":
      return `${name} — question redrawn`;
    case "streik":
      return `${name} — a wrong answer changes nothing this turn`;
  }
}

/** "Correct — Cinema won" / "Wrong — Cinema went dark" for a judged entry. */
export function verdictLine(
  entry: Pick<QuestionLogEntry, "correct" | "shielded" | "buildingAfter" | "categoryIndex">,
  lang: Lang,
): { icon: string; text: string; variant: LogAction["variant"] } {
  const b = buildingName(entry.categoryIndex, lang);
  if (entry.correct === null) {
    return {
      icon: "↻",
      text: `Question redrawn — ${b} waits for the next card`,
      variant: "special",
    };
  }
  if (entry.correct) {
    return {
      icon: "✓",
      text: entry.buildingAfter === "won" ? `Correct — ${b} won` : `Correct — ${b} lit up`,
      variant: "success",
    };
  }
  if (entry.shielded) {
    return { icon: "✗", text: `Wrong — Strike held, ${b} unchanged`, variant: "warning" };
  }
  return {
    icon: "✗",
    text: entry.buildingAfter === "lost" ? `Wrong — ${b} lost` : `Wrong — ${b} went dark`,
    variant: "danger",
  };
}

interface TurnBlock {
  block: LogBlock;
  helps: Set<HelpCardId>;
  tipFlips: number;
  plenum: boolean;
  penalties: number;
  reader: boolean;
}

export function mapQuiztopiaLog(
  view: QuiztopiaPlayerView,
  names: SeatNames,
  lang: Lang = "en",
): LogBlock[] {
  const blocks: LogBlock[] = [];
  const turns = new Map<number, TurnBlock>();

  blocks.push({
    key: "setup",
    label: "Setup",
    actions: [
      {
        key: "setup-table",
        icon: "⚙",
        spans: [
          {
            text: `${view.difficultyLabel} · ${view.expert ? "Expert" : "Standard"} · ${deckLabel(view.deck)} deck · ${view.playerCount} ${view.playerCount === 1 ? "player" : "players"}`,
          },
        ],
        variant: "info",
      },
      {
        key: "setup-goal",
        icon: "◎",
        spans: [{ text: `Win at ${view.required} buildings · lost at ${view.lossAt} lost` }],
        variant: "info",
      },
    ],
  });

  const turnBlock = (turn: number, activeSeat: number, bakery: boolean): TurnBlock => {
    let tb = turns.get(turn);
    if (!tb) {
      const who = seatName(names, activeSeat);
      tb = {
        block: {
          key: `turn-${turn}`,
          label: bakery ? `Turn ${turn} · ${who} · bakery run` : `Turn ${turn} · ${who}`,
          actions: [],
        },
        helps: new Set(),
        tipFlips: 0,
        plenum: false,
        penalties: 0,
        reader: false,
      };
      turns.set(turn, tb);
      blocks.push(tb.block);
    }
    return tb;
  };

  const pushPick = (tb: TurnBlock, key: string, activeSeat: number, categoryIndex: number) => {
    tb.block.actions.push({
      key,
      icon: "▣",
      spans: [
        { text: seatName(names, activeSeat), bold: true },
        { text: ` picked ${buildingName(categoryIndex, lang)}` },
      ],
      variant: "action",
    });
  };

  const pushReader = (tb: TurnBlock, turn: number, readerSeat: number | null) => {
    if (readerSeat === null || tb.reader) return;
    tb.reader = true;
    tb.block.actions.push({
      key: `${turn}-reads`,
      icon: "📖",
      spans: [{ text: `${seatName(names, readerSeat)} reads` }],
      variant: "info",
    });
  };

  const pushHelps = (tb: TurnBlock, turn: number, helpPlayed: readonly HelpCardId[]) => {
    for (const id of helpPlayed) {
      if (tb.helps.has(id)) continue;
      tb.helps.add(id);
      tb.block.actions.push({
        key: `${turn}-help-${id}`,
        icon: "✦",
        spans: [{ text: helpLine(id, lang) }],
        variant: "special",
      });
    }
  };

  const pushExpert = (
    tb: TurnBlock,
    turn: number,
    tipFlips: number,
    plenum: boolean,
    penalties: number,
  ) => {
    if (tipFlips > tb.tipFlips) {
      tb.tipFlips = tipFlips;
      tb.block.actions.push({
        key: `${turn}-tips-${tipFlips}`,
        icon: "💡",
        spans: [{ text: tipFlips === 1 ? "A tip card flipped" : `${tipFlips} tip cards flipped` }],
        variant: "warning",
      });
    }
    if (plenum && !tb.plenum) {
      tb.plenum = true;
      tb.block.actions.push({
        key: `${turn}-plenum`,
        icon: "🗣",
        spans: [{ text: "Plenum — open discussion" }],
        variant: "warning",
      });
    }
    if (penalties > tb.penalties) {
      tb.penalties = penalties;
      tb.block.actions.push({
        key: `${turn}-penalty-${penalties}`,
        icon: "⚠",
        spans: [{ text: penalties === 1 ? "Penalty — a tip card lost" : `${penalties} penalties` }],
        variant: "danger",
      });
    }
  };

  view.questionLog.forEach((e, i) => {
    const tb = turnBlock(e.turn, e.activeSeat, e.bakery);
    pushPick(tb, `${e.turn}-pick-${i}`, e.activeSeat, e.categoryIndex);
    pushReader(tb, e.turn, e.readerSeat);
    pushHelps(tb, e.turn, e.helpPlayed);
    pushExpert(tb, e.turn, e.tipFlips, e.plenum, e.penalties);
    const v = verdictLine(e, lang);
    tb.block.actions.push({
      key: `${e.turn}-verdict-${i}`,
      icon: v.icon,
      spans: [{ text: v.text, bold: e.correct !== null }],
      variant: v.variant,
    });
  });

  // The turn in progress: whatever has happened since the last verdict.
  const t = view.turn;
  const live = view.phase !== "game-over" && view.outcome === null;
  if (live && view.phase !== "bakery-offer" && view.phase !== "loss-pending") {
    const tb = turnBlock(t.index, view.activeSeat, view.bakery);
    if (t.buildingIndex !== null && t.question) {
      // A redraw already logged the pick for this building; don't repeat it.
      const picked = tb.block.actions.some((a) => String(a.key).startsWith(`${t.index}-pick`));
      if (!picked) pushPick(tb, `${t.index}-pick-live`, view.activeSeat, t.buildingIndex);
    }
    pushReader(tb, t.index, view.readerSeat);
    pushHelps(tb, t.index, t.helpPlayed);
    pushExpert(tb, t.index, t.tipFlips, t.plenum, t.penalties);
    if (t.revealed) {
      tb.block.actions.push({
        key: `${t.index}-revealed`,
        icon: "👁",
        spans: [{ text: "Answer revealed — judging" }],
        variant: "info",
      });
    }
  }

  if (view.bakeryOffer) {
    blocks.push({
      key: "bakery-offer",
      label: "Quiztopia is saved",
      actions: [
        {
          key: "bakery-offer-line",
          icon: "🥐",
          spans: [
            { text: `${seatName(names, view.activeSeat)} decides: take the win or go for all 12` },
          ],
          variant: "success",
        },
      ],
    });
  }

  if (view.lossPending) {
    blocks.push({
      key: "loss-pending",
      label: "Quiztopia is falling",
      actions: [
        {
          key: "loss-pending-line",
          icon: "🌑",
          spans: [{ text: "Too many buildings lost — Besetzung can still turn it around" }],
          variant: "danger",
        },
      ],
    });
  }

  if (view.outcome) {
    const text =
      view.outcome === "win"
        ? view.bakeryComplete
          ? "The whole bakery — all 12 buildings shine"
          : `Quiztopia shines — ${view.won} buildings won`
        : view.outcome === "loss-buildings"
          ? `Quiztopia went dark — ${view.lost} buildings lost`
          : "Out of questions — the holder is empty";
    blocks.push({
      key: "game-over",
      label: "Game over",
      actions: [
        {
          key: "outcome",
          icon: view.outcome === "win" ? "🏙" : "🌑",
          spans: [{ text, bold: true }],
          variant: view.outcome === "win" ? "success" : "danger",
        },
      ],
    });
  }

  return blocks;
}
