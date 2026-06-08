import type { Ref, TextareaHTMLAttributes } from "react";

// `<textarea>` sibling of `Input` — same surface-token chrome, focus ring, and
// `invalid` state. Use for match notes and other multi-line fields instead of
// re-styling a raw `<textarea>`.

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({ invalid = false, className = "", ref, ...rest }: Props) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border bg-surface-900 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:ring-2 ${
        invalid
          ? "border-rose-500/50 focus:ring-rose-500/40"
          : "border-white/10 focus:border-accent-400/60 focus:ring-accent-400/30"
      } ${className}`}
      {...rest}
    />
  );
}
