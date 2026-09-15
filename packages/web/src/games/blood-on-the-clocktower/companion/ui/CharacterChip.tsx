import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { Button } from "../../../../components/ui";
import { RADIUS_UI_LG } from "../../../../components/ui/radii";
import { cn } from "../../../../lib/cn";
import { TYPE_TEXT } from "../labels";
import { CharacterIcon } from "./CharacterIcon";

// A character token in a row: icon + name, coloured by type. Tappable when
// given `onClick` (the bag's swap-a-token affordance), otherwise inert
// (bluffs, outsiders shown to the Godfather, tokens to add to the bag).
export function CharacterChip({
  character,
  onClick,
  title,
  className,
}: {
  character: CharacterId;
  onClick?: () => void;
  /** Tooltip / accessible name for the tappable form. */
  title?: string;
  className?: string;
}) {
  const c = CHARACTERS[character];
  const chrome = cn(
    RADIUS_UI_LG,
    "flex items-center gap-1.5 border border-line-strong bg-surface-950/60 px-2 py-1 text-sm font-semibold",
    TYPE_TEXT[c.type],
    className,
  );
  if (onClick) {
    return (
      <Button
        variant="plain"
        size="xs"
        title={title}
        aria-label={title}
        onClick={onClick}
        className={cn(chrome, "transition-colors hover:border-fg-strong/40 hover:bg-surface-900")}
      >
        <CharacterIcon character={character} size="sm" />
        {c.name}
      </Button>
    );
  }
  return (
    <span className={chrome}>
      <CharacterIcon character={character} size="sm" />
      {c.name}
    </span>
  );
}
