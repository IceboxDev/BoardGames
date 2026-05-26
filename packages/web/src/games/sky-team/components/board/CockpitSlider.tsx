interface Props {
  /** Slot has been activated — knob slides to the left and the rail lights
   *  up "functional green" like an LED indicator. */
  active?: boolean;
}

/**
 * Hardware-mock slider — black inset rail with a textured "lock knob". When
 * the slot is `active`, the knob smoothly slides from the right (idle) to
 * the left (engaged) and the rail underneath glows electronic-green so the
 * slot reads as armed without needing the placed-die chip on top of it.
 */
export default function CockpitSlider({ active = false }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`cockpit-slider${active ? " cockpit-slider--active" : ""}`}
    />
  );
}
