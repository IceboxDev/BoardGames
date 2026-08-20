// The frame every celebratory takeover shares.
//
// A greeting is a full Modal, not a banner — it earns the interruption by
// being rare and always good news. The shell owns the parts that must look
// identical whichever greeting is showing: the accent plumbing (one CSS
// variable the whole subtree reads), the hero tile with its cover art or glow,
// and the Later / CTA footer. What goes UNDER the hero is the caller's — the
// intro shows the viewer's hexagon, a spotlight shows the board it is
// claiming.

import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_ACCENT } from "../../../lib/accent.ts";
import { ArrowRightIcon, SparkleIcon } from "../../icons";
import { Button } from "../../ui/Button.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Modal, ModalBody, ModalFooter } from "../../ui/Modal.tsx";
import { Surface } from "../../ui/Surface.tsx";

export function GreetingShell({
  accentHex,
  eyebrow,
  title,
  subheader,
  heroEyebrow,
  heroTitle,
  heroDetail,
  emblem,
  coverSrc,
  ctaLabel,
  onCta,
  onDismiss,
  children,
  switcher,
}: {
  accentHex: string | null | undefined;
  /** Modal header: the kind of news. */
  eyebrow: string;
  title: string;
  subheader?: ReactNode;
  /** Hero tile: whose news it is, what happened, and the detail behind it. */
  heroEyebrow: string;
  /** A string, or a rendered stat (a rank jump, a big number). */
  heroTitle: ReactNode;
  heroDetail: string;
  emblem: ReactNode;
  /** Optional backdrop (a game thumbnail) behind the hero tile. */
  coverSrc?: string;
  ctaLabel: string;
  onCta: () => void;
  onDismiss: () => void;
  /** The proof block — whatever backs up the claim. */
  children: ReactNode;
  /** Admin-only dev tool: preview the modal as another member. */
  switcher?: ReactNode;
}) {
  const accent = accentHex ?? DEFAULT_ACCENT;
  return (
    <Modal
      onClose={onDismiss}
      size="sm"
      eyebrow={eyebrow}
      eyebrowClassName="text-[var(--accent)]"
      title={title}
      subheader={subheader}
      panelClassName="border border-[var(--accent)]/30"
      style={{ "--accent": accent } as CSSProperties}
    >
      <ModalBody gap="md">
        <Surface variant="tile" padding="none" className="relative shrink-0 overflow-hidden">
          {coverSrc ? (
            <>
              <img
                src={coverSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-surface-950/90 via-surface-950/60 to-transparent" />
            </>
          ) : (
            <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--accent)]/25 blur-2xl" />
          )}
          <SparkleIcon className="absolute right-3 top-3 h-4 w-4 text-white/50" />
          <SparkleIcon className="absolute right-9 top-8 h-2.5 w-2.5 text-white/30" />

          <div className="relative flex items-center gap-4 p-4">
            {emblem}
            {/* pr-8 keeps long tracked-caps eyebrows clear of the sparkles. */}
            <div className="min-w-0 flex-1 pr-8">
              <MicroLabel className="font-semibold text-[var(--accent)]">{heroEyebrow}</MicroLabel>
              <div className="mt-0.5 text-lg font-black leading-tight text-white">{heroTitle}</div>
              <p className="mt-0.5 text-2xs text-fg-secondary">{heroDetail}</p>
            </div>
          </div>
        </Surface>

        {children}
        {switcher}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Later
        </Button>
        <Button size="sm" onClick={onCta}>
          {ctaLabel}
          <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </ModalFooter>
    </Modal>
  );
}
