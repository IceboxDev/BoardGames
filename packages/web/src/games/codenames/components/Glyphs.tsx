// The table's three figures, drawn for the cards and covers: the agent (a
// hat-and-collar silhouette), the innocent bystander, and the assassin.

interface GlyphProps {
  className?: string;
}

export function AgentGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8.1 8.5 9.2 4.4c.2-.7.9-1.1 1.6-.9l1.2.4 1.2-.4c.7-.2 1.4.2 1.6.9l1.1 4.1z" />
      <path d="M3.6 9.4c0-.8 3.8-1.5 8.4-1.5s8.4.7 8.4 1.5-3.8 1.3-8.4 1.3-8.4-.6-8.4-1.3z" />
      <path d="M8.4 11.1c.4 2.5 1.9 4.3 3.6 4.3s3.2-1.8 3.6-4.3c-1.1.2-2.3.3-3.6.3s-2.5-.1-3.6-.3z" />
      <path d="M3.5 21.5c.3-3.3 2.7-5.5 5.6-6.1l2.9 3.1 2.9-3.1c2.9.6 5.3 2.8 5.6 6.1z" />
    </svg>
  );
}

export function BystanderGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="12" cy="7.4" r="3.9" />
      <path d="M4.2 21.5c.4-4.4 3.6-7.4 7.8-7.4s7.4 3 7.8 7.4z" />
    </svg>
  );
}

export function AssassinGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M12 2.5c-4.6 0-8 3.2-8 7.6 0 2.5 1.2 4.4 3 5.5v2.6c0 .7.6 1.3 1.3 1.3h.9v1.5h1.6v-1.5h2.4v1.5h1.6v-1.5h.9c.7 0 1.3-.6 1.3-1.3v-2.6c1.8-1.1 3-3 3-5.5 0-4.4-3.4-7.6-8-7.6zM8.6 13.3a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2zm6.8 0a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2zM12 13.6l-1.2 2h2.4z"
      />
    </svg>
  );
}
