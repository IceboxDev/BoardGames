import { cn } from "../../../../lib/cn";
import { domainOf } from "../../domains";

/** Pixel sizes the icon is drawn at (the art is 128 px, so 2× up to 64). */
const SIZE = {
  14: "size-3.5",
  16: "size-4",
  20: "size-5",
  24: "size-6",
  28: "size-7",
  40: "size-10",
  56: "size-14",
} as const;
export type DomainIconSize = keyof typeof SIZE;

/**
 * A quiz domain's printer's-cut icon (assets/domains, DOMAIN-ICON-PROMPTS.md).
 * Decorative by default — the domain's name is always printed beside it;
 * pass `label` where the icon stands alone.
 */
export function DomainIcon({
  domain,
  size = 20,
  label,
  className,
}: {
  domain: string;
  size?: DomainIconSize;
  label?: string;
  className?: string;
}) {
  const d = domainOf(domain);
  return (
    <img
      src={d.icon}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 object-contain", SIZE[size], className)}
    />
  );
}
