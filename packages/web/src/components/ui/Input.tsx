import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { invalid = false, className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border bg-surface-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 ${
        invalid
          ? "border-red-500/50 focus:ring-red-500/40"
          : "border-white/10 focus:border-accent-400/60 focus:ring-accent-400/30"
      } ${className}`}
      {...rest}
    />
  );
});
