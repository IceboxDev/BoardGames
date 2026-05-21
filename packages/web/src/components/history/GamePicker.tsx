import { useId, useMemo, useState } from "react";
import { games } from "../../games/registry";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type Props = {
  /** Current registry slug, or null when free-text. */
  slug: string | null;
  title: string;
  onChange: (value: { slug: string | null; title: string }) => void;
};

export function GamePicker({ slug, title, onChange }: Props) {
  const inputId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(title);

  const options = useMemo(() => games.map((g) => ({ slug: g.slug, title: g.title })), []);

  const matches = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.title.toLowerCase().includes(q));
  }, [options, query]);

  function pick(slugVal: string | null, titleVal: string) {
    setQuery(titleVal);
    setOpen(false);
    onChange({ slug: slugVal, title: titleVal });
  }

  return (
    <div className="relative">
      <Input
        id={inputId}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Clear slug whenever the title diverges from any registry entry.
          if (slug && options.find((o) => o.slug === slug)?.title !== e.target.value) {
            onChange({ slug: null, title: e.target.value });
          } else {
            onChange({ slug, title: e.target.value });
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Game title — type to search the registry"
        autoComplete="off"
        aria-controls={listId}
        aria-expanded={open}
      />
      {open && matches.length > 0 && (
        <ul
          id={listId}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-white/10 bg-surface-900 shadow-xl"
        >
          {matches.map((m) => (
            <li key={m.slug}>
              <Button
                variant="ghost"
                size="sm"
                block
                shape="rounded"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m.slug, m.title);
                }}
                className="!justify-start rounded-none"
              >
                {m.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!slug && query && (
        <p className="mt-1 text-[11px] text-gray-500">
          Will be saved as a free-text title (not in the registry).
        </p>
      )}
    </div>
  );
}
