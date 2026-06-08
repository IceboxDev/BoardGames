import type { InputHTMLAttributes, Ref } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ invalid = false, className = "", ref, ...rest }: Props) {
  return (
    <input
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
