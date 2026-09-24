import { Link, type LinkProps } from "react-router-dom";
import { cn } from "../../../../lib/cn";

// An in-app text link in the accent ink — "Read full article →", "Wiki →".
// `ButtonLink` is an anchor for real hrefs; the trainer's links are router
// paths, so they go through react-router's <Link> with one shared skin.

type Props = LinkProps & {
  tone?: "accent" | "muted";
};

const TONES = {
  accent: "text-accent-300 hover:text-accent-200",
  muted: "text-fg-muted hover:text-fg-secondary",
} as const;

export function TextLink({ tone = "accent", className, children, ...rest }: Props) {
  return (
    <Link
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
