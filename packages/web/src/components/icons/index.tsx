// Centralized icon set. Every icon is a small functional component that
// inherits color via `currentColor` and accepts a `className` for sizing.
// Adding a new icon? Drop it here so the same SVG isn't redefined across
// modals, cards, and lists. Pure presentational — no event handlers, no
// state, no aria; the parent labels the icon's container.

type IconProps = {
  className?: string;
};

const STROKE_BASE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function XIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M3 3l10 10M13 3l-10 10" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M10 3l-5 5 5 5" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

export function CheckIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2.5}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export function StarIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.2 2.73.99-5.78L1.58 7.62l5.82-.85L10 1.5z" />
    </svg>
  );
}

export function FlameIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.4 1.6c-.3-.4-.9-.5-1.3-.2-.3.2-.5.6-.4 1 .3 1.7-.2 3-1.3 4-1.4 1.2-2.4 2.8-2.4 4.7 0 2.5 2 4.5 4 4.5s4-2 4-4.5c0-1.1-.4-2.1-1-2.9.7.3 1.5.4 2.3.2.4-.1.7-.5.7-.9 0-.3-.2-.6-.5-.7-1.7-.7-3.1-2.4-4.1-5.2zM8 12.5c-1 0-1.7-.8-1.7-1.7 0-.7.4-1.3 1-1.6.2.6.7 1 1.3 1 .4 0 .8-.2 1-.5.4.3.7.7.7 1.2 0 .9-.7 1.7-1.7 1.7z" />
    </svg>
  );
}

export function ClockIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  );
}

export function PinIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M8 14s5-4.5 5-8.5A5 5 0 0 0 3 5.5C3 9.5 8 14 8 14z" />
      <circle cx="8" cy="6" r="1.6" />
    </svg>
  );
}

export function HostIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M2 14l6-11 6 11" />
      <path d="M5 14V9h6v5" />
    </svg>
  );
}

export function PadlockIcon({
  closed = true,
  className = "h-4 w-4",
}: IconProps & { closed?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.8}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.5" />
      {closed ? (
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      ) : (
        <path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3" />
      )}
    </svg>
  );
}
