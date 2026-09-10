import type { ArrivalVoterFace } from "@boardgames/core/protocol";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";
import { Avatar } from "../ui/Avatar.tsx";
import { voterLabel } from "./arrival-copy.ts";
import { ORBIT_SPIN, stage } from "./arrival-motion.ts";

// The people whose votes pulled a game onto the shelf, as small planets
// around the purchaser's medallion. The ring turns once every 48 seconds;
// each face counter-rotates so it stays upright. Faces are anonymous by
// design — an avatar or a tinted silhouette, never a name — so the whole
// ring is one labelled image ("6 votes from 6 players") and the faces are
// hidden from assistive tech.
//
// Geometry lives in one CSS variable the PARENT sets (`--orbit-r`, the ring
// radius in px, defaulting to 48px), so the same component fits the phone's
// smaller medallion and the desktop's larger one without a JS media query.
// The spoke transform sits on a plain span, never on the motion element:
// framer owns `transform` on its own nodes.

const ORBIT_FACE_CAP = 8;

type VoterOrbitProps = {
  voters: readonly ArrivalVoterFace[];
  votes: number;
  /** Turn the ring (off under reduced motion). */
  spin: boolean;
  cap?: number;
  className?: string;
};

export function VoterOrbit({
  voters,
  votes,
  spin,
  cap = ORBIT_FACE_CAP,
  className,
}: VoterOrbitProps) {
  const shown = voters.slice(0, cap);
  const overflow = voters.length - shown.length;
  const slots = shown.length + (overflow > 0 ? 1 : 0);
  const step = slots > 0 ? 360 / slots : 0;
  const boxStyle: CSSProperties = {
    width: "calc(var(--orbit-r, 48px) * 2 + 2rem)",
    height: "calc(var(--orbit-r, 48px) * 2 + 2rem)",
  };

  return (
    <motion.div
      role="img"
      aria-label={voterLabel(votes, voters.length)}
      data-motion={spin ? "spin" : "static"}
      variants={stage.orbit}
      style={boxStyle}
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        className,
      )}
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        animate={spin ? { rotate: 360 } : undefined}
        transition={spin ? ORBIT_SPIN : undefined}
      >
        {shown.map((face, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: faces are anonymous by design (no id on the wire) and the list never reorders
          <Spoke key={i} angle={i * step} spin={spin}>
            <Avatar
              name=""
              image={face.image}
              accentHex={face.accentHex}
              size="xs"
              fallback="silhouette"
              className="h-6 w-6 ring-2 ring-surface-900"
            />
          </Spoke>
        ))}
        {overflow > 0 && (
          <Spoke angle={shown.length * step} spin={spin}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fill-strong text-3xs font-semibold tabular-nums text-fg-secondary ring-2 ring-surface-900">
              +{overflow}
            </span>
          </Spoke>
        )}
      </motion.div>
    </motion.div>
  );
}

function Spoke({
  angle,
  spin,
  children,
}: {
  angle: number;
  spin: boolean;
  children: React.ReactNode;
}) {
  const spoke: CSSProperties = {
    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--orbit-r, 48px) * -1))`,
  };
  return (
    <span data-face="" className="absolute left-1/2 top-1/2 block" style={spoke}>
      <motion.span
        className="block"
        style={spin ? undefined : { rotate: -angle }}
        initial={spin ? { rotate: -angle } : false}
        animate={spin ? { rotate: -angle - 360 } : undefined}
        transition={spin ? ORBIT_SPIN : undefined}
      >
        {children}
      </motion.span>
    </span>
  );
}
