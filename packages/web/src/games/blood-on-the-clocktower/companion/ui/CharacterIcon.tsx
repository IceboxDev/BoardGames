import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { cn } from "../../../../lib/cn";
import { characterIconUrl } from "../icons";
import { TYPE_TEXT } from "../labels";

/** The character's token art. Sized for inline (sm/md) up to token-display (xl). */
export function CharacterIcon({
  character,
  size = "md",
  className,
  decorative = false,
}: {
  character: CharacterId;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /**
   * The icon sits next to text that already names the player (a seat chip,
   * a row): keep it out of the accessible name so "Alice" stays "Alice".
   */
  decorative?: boolean;
}) {
  const url = characterIconUrl(character);
  if (!url) return null;
  const sizeCls = { sm: "h-6 w-6", md: "h-9 w-9", lg: "h-14 w-14", xl: "h-28 w-28" }[size];
  return (
    <img
      src={url}
      alt={decorative ? "" : CHARACTERS[character].name}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn(
        sizeCls,
        "shrink-0 select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
        className,
      )}
    />
  );
}

/** The character's name, in its type's colour. */
export function CharacterTag({ character }: { character: CharacterId }) {
  const c = CHARACTERS[character];
  return <span className={cn("font-semibold", TYPE_TEXT[c.type])}>{c.name}</span>;
}
