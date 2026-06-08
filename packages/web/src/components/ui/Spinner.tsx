// The single spinner primitive — a rotating ring that inherits its color from
// `currentColor` (defaults to accent). Pass a `label` to announce it to screen
// readers (role=status); omit it when the spinner is decorative inside a
// labelled container such as `LoadingState` or a loading `Button`.

type SpinnerProps = {
  size?: "xs" | "sm" | "md" | "lg";
  /** Accessible label. When set, the spinner announces as role="status". */
  label?: string;
  className?: string;
};

const SIZES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
};

export function Spinner({ size = "md", label, className = "" }: SpinnerProps) {
  const cls = `inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent text-accent-400 ${SIZES[size]} ${className}`;
  return label ? (
    <span role="status" aria-label={label} className={cls} />
  ) : (
    <span aria-hidden="true" className={cls} />
  );
}
