import { useState } from "react";
import { Button, Surface } from "../../../components/ui";
import CardLine from "./CardLine";

/**
 * A face-up pile of your own — the discard pile (open information) or the
 * Digestion zone — folded to its count until opened. Each card previews on
 * hover like any other row.
 */
export default function PilePanel({
  title,
  cards,
  defaultOpen = false,
}: {
  title: string;
  cards: readonly string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Surface variant="raised" padding="sm" className="flex min-w-0 flex-col gap-1">
      <Button
        variant="ghost"
        size="xs"
        align="start"
        block
        aria-expanded={open}
        disabled={cards.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} {title} ({cards.length})
      </Button>
      {open &&
        // Most recent on top: the last card discarded is the one you just used.
        [...cards].reverse().map((id) => <CardLine key={id} card={id} />)}
    </Surface>
  );
}
