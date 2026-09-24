import { deckCardRefs } from "@boardgames/core/games/quiztopia/ids";
import {
  BUILDING_COUNT,
  QUIZTOPIA_DECKS,
  type QuiztopiaDeck,
} from "@boardgames/core/games/quiztopia/types";
import { QUIZTOPIA_DIFFICULTIES } from "@boardgames/core/history/coop-challenge";
import type { QuiztopiaLanguage } from "@boardgames/core/protocol";
import { Badge, FieldGroup, SegmentedControl, Surface } from "../../components/ui";
import type { LobbyConfigProps } from "../types";
import { Skyline } from "./components/common/Skyline";
import { CARD_IDS } from "./content";
import { DIFFICULTY_SHORT, tierFacts } from "./logic/copy";

// The four table options a host sets before Start. The emitted object is
// exactly `QuiztopiaStartConfigInput` minus playerCount/seats (the room
// manager supplies those): `{ difficulty, expert, deck, language }`, where
// "Both" as the room language is the absence of a default (`language`
// omitted) — the START schema only knows "en" | "de".

export interface QuiztopiaLobbyValue {
  difficulty: number;
  expert: boolean;
  deck: QuiztopiaDeck;
  language?: "en" | "de";
}

const DEFAULT_VALUE: QuiztopiaLobbyValue = {
  difficulty: 0,
  expert: false,
  deck: "original",
  language: "en",
};

const ORIGINAL_COUNT = CARD_IDS.length;
const EXTENDED_COUNT = deckCardRefs(CARD_IDS, "extended").length;

// Which buildings the preview darkens for n players. A fixed spread (not the
// engine's shuffle) so the picture is stable while the host flips options.
const PREVIEW_DARK_ORDER = [3, 7, 0, 10, 5, 1, 8, 11];

export function readLobbyValue(value: unknown): QuiztopiaLobbyValue {
  if (!value || typeof value !== "object") return DEFAULT_VALUE;
  const v = value as Record<string, unknown>;
  const difficulty =
    typeof v.difficulty === "number" &&
    Number.isInteger(v.difficulty) &&
    v.difficulty >= 0 &&
    v.difficulty < QUIZTOPIA_DIFFICULTIES.length
      ? v.difficulty
      : DEFAULT_VALUE.difficulty;
  const deck = QUIZTOPIA_DECKS.includes(v.deck as QuiztopiaDeck)
    ? (v.deck as QuiztopiaDeck)
    : DEFAULT_VALUE.deck;
  const language = v.language === "en" || v.language === "de" ? v.language : undefined;
  return { difficulty, expert: v.expert === true, deck, language };
}

/** The wire object for a room language choice ("both" = no default). */
export function withLanguage(
  value: QuiztopiaLobbyValue,
  language: QuiztopiaLanguage,
): QuiztopiaLobbyValue {
  const { language: _drop, ...rest } = value;
  return language === "both" ? rest : { ...rest, language };
}

export function previewLit(playerCount: number): boolean[] {
  const dark = new Set(PREVIEW_DARK_ORDER.slice(0, Math.min(playerCount, 6) + 2));
  return Array.from({ length: BUILDING_COUNT }, (_, i) => !dark.has(i));
}

export default function QuiztopiaLobbyConfig({
  value,
  onChange,
  isHost = true,
  playerCount = 1,
}: LobbyConfigProps) {
  const cfg = readLobbyValue(value);
  const solo = playerCount <= 1;
  const facts = tierFacts(cfg.difficulty);
  // Solo rules: the engine forces Expert off at one player, so the control
  // shows what will actually be played.
  const mode: "standard" | "expert" = cfg.expert && !solo ? "expert" : "standard";
  const language: QuiztopiaLanguage = cfg.language ?? "both";
  const darkCount = Math.min(playerCount, 6) + 2;
  const disabled = !isHost;

  return (
    <Surface
      variant="raised"
      padding="lg"
      className="mx-auto mb-6 flex w-full max-w-md flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-fg-strong">Table</span>
        {!isHost && (
          <Badge tone="amber" size="sm">
            Host is setting the table
          </Badge>
        )}
      </div>

      <FieldGroup
        label="Difficulty"
        hint={
          <>
            Win at <strong className="text-fg-primary">{facts.required}</strong> buildings · lost at{" "}
            <strong className="text-fg-primary">{facts.lossAt}</strong> lost · Expert tips{" "}
            <strong className="text-fg-primary">{facts.tips}</strong>
          </>
        }
      >
        <SegmentedControl
          aria-label="Difficulty"
          shape="rounded"
          size="sm"
          tone="amber"
          disabled={disabled}
          options={DIFFICULTY_SHORT.map((label, i) => ({
            value: i,
            label,
            title: QUIZTOPIA_DIFFICULTIES[i],
          }))}
          value={cfg.difficulty}
          onChange={(difficulty) => onChange({ ...cfg, difficulty })}
        />
      </FieldGroup>

      <FieldGroup
        label="Mode"
        action={
          solo ? (
            <Badge
              tone="sky"
              size="sm"
              title="One player: no reader, no tip cards, three help cards"
            >
              Solo rules
            </Badge>
          ) : undefined
        }
        hint={
          solo
            ? "Expert mode needs a table — one player answers alone by definition."
            : "Expert: no free discussion. Tip cards buy help; Plenum opens the floor."
        }
      >
        <SegmentedControl
          aria-label="Mode"
          shape="rounded"
          size="sm"
          tone="amber"
          disabled={disabled || solo}
          options={[
            { value: "standard", label: "Standard" },
            { value: "expert", label: "Expert" },
          ]}
          value={mode}
          onChange={(m) => onChange({ ...cfg, expert: m === "expert" })}
        />
      </FieldGroup>

      <FieldGroup label="Deck">
        <SegmentedControl
          aria-label="Deck"
          shape="rounded"
          size="sm"
          tone="amber"
          disabled={disabled}
          options={[
            { value: "original", label: `Original (${ORIGINAL_COUNT})` },
            { value: "extended", label: `Extended (${EXTENDED_COUNT})` },
          ]}
          value={cfg.deck}
          onChange={(deck) => onChange({ ...cfg, deck })}
        />
      </FieldGroup>

      <FieldGroup label="Language" hint="Room default — every seat can toggle in the game.">
        <SegmentedControl
          aria-label="Language"
          shape="rounded"
          size="sm"
          tone="amber"
          disabled={disabled}
          options={[
            { value: "en", label: "EN" },
            { value: "de", label: "DE" },
            { value: "both", label: "Both" },
          ]}
          value={language}
          onChange={(lang) => onChange(withLanguage(cfg, lang))}
        />
      </FieldGroup>

      <div className="flex flex-col gap-1">
        <Skyline mode="mini" lit={previewLit(playerCount)} className="h-20 w-full" />
        <p className="text-center text-xs text-fg-muted">
          {darkCount} of {BUILDING_COUNT} start dark for {playerCount}{" "}
          {playerCount === 1 ? "player" : "players"}
        </p>
      </div>
    </Surface>
  );
}
