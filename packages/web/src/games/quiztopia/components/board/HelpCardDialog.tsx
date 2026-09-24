import { helpCardDef } from "@boardgames/core/games/quiztopia/help-cards";
import type { HelpCardId } from "@boardgames/core/games/quiztopia/types";
import { useEffect, useRef } from "react";
import { GameDialogPanel } from "../../../../components/game-layout/GameDialogPanel";
import { Badge, Button, Chip } from "../../../../components/ui";
import { districtByIndex } from "../../bands";
import { type BoardLanguage, helpCardName, pickTexts } from "../../logic/copy";
import { BuildingGlyph } from "../common/BuildingGlyph";

// A help card opened from the fan: its text in the board language, an
// "assumed effect" flag on the four cards whose effect was designed from the
// name, and Play / Cancel. Besetzung plays in two steps — Play, then pick
// which lost building comes back (the targets are exactly the legal ones,
// listed here and made selectable on the Lost shelf).

type Props = {
  helpId: HelpCardId;
  used: boolean;
  /** The engine lists a matching `play-help` for this seat right now. */
  playable: boolean;
  lang: BoardLanguage;
  /** Lost buildings Besetzung may return (legal action targets). */
  besetzungTargets: readonly number[];
  picking: boolean;
  onStartPicking: () => void;
  onPlay: () => void;
  onReturn: (buildingIndex: number) => void;
  onClose: () => void;
};

export default function HelpCardDialog({
  helpId,
  used,
  playable,
  lang,
  besetzungTargets,
  picking,
  onStartPicking,
  onPlay,
  onReturn,
  onClose,
}: Props) {
  const def = helpCardDef(helpId);
  const firstRef = useRef<HTMLButtonElement>(null);
  const primaryLang: "en" | "de" = lang === "de" ? "de" : "en";
  const isBesetzung = helpId === "besetzung";

  // Focus lands on the primary action so Enter plays the card.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-focus when the card or the step changes
  useEffect(() => {
    firstRef.current?.focus();
  }, [helpId, picking]);

  return (
    <GameDialogPanel
      tone="arcane"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {helpCardName(helpId, lang)}
          {def.assumed && (
            <Badge
              tone="purple"
              size="xs"
              ring
              title="Effect designed from the card's name — not the printed text"
            >
              assumed effect
            </Badge>
          )}
          {used && (
            <Badge tone="neutral" size="xs">
              used
            </Badge>
          )}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {pickTexts(lang, def.textEn, def.textDe).map((text, i) => (
          <p
            key={text}
            className={i === 0 ? "text-sm text-fg-primary" : "text-xs text-fg-secondary"}
            lang={i === 0 ? primaryLang : primaryLang === "en" ? "de" : "en"}
          >
            {text}
          </p>
        ))}

        {isBesetzung && picking && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-fg-secondary">
              Pick the building that returns to the middle (dark side up):
            </p>
            <div className="flex flex-wrap gap-2">
              {besetzungTargets.map((index, i) => {
                const d = districtByIndex(index);
                return (
                  <Chip
                    key={d.slug}
                    ref={i === 0 ? firstRef : undefined}
                    pressed={false}
                    tone="rose"
                    variant="outlined"
                    size="sm"
                    icon={<BuildingGlyph name={d.building} size={14} />}
                    onClick={() => onReturn(index)}
                  >
                    {primaryLang === "de" ? d.buildingLabelDe : d.buildingLabel}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {used ? (
            <span className="text-xs text-fg-muted">Already played this game.</span>
          ) : !playable ? (
            <span className="text-xs text-fg-muted">Not playable right now.</span>
          ) : isBesetzung ? (
            !picking && (
              <Button
                ref={firstRef}
                variant="solid"
                tone="purple"
                size="sm"
                onClick={onStartPicking}
              >
                Play — pick a building
              </Button>
            )
          ) : (
            <Button ref={firstRef} variant="solid" tone="purple" size="sm" onClick={onPlay}>
              Play
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            {playable && !used ? "Cancel" : "Close"}
          </Button>
        </div>
      </div>
    </GameDialogPanel>
  );
}
