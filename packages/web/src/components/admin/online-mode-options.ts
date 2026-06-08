import type { OnlineMode } from "@boardgames/core/protocol";
import type { SegmentedOption } from "../ui/SegmentedControl";

// Shared SegmentedControl options for the three-state online mode picker.
// Order is consistent across every consumer (offline ↔ both ↔ online reads
// left-to-right as "in-person only → mixed → online only").
//
// Two label variants because the same control appears in very different
// surfaces. The `_COMPACT` form keeps the per-row picker narrow enough not
// to push the admin users table out of bounds; tooltips on each option
// surface the full word for a11y / discoverability.

export const ONLINE_MODE_OPTIONS: ReadonlyArray<SegmentedOption<OnlineMode>> = [
  { value: "offline", label: "Offline" },
  { value: "both", label: "Both" },
  { value: "online", label: "Online" },
];

export const ONLINE_MODE_OPTIONS_COMPACT: ReadonlyArray<SegmentedOption<OnlineMode>> = [
  { value: "offline", label: "Off", title: "Offline only" },
  { value: "both", label: "Both", title: "Online + offline" },
  { value: "online", label: "On", title: "Online only" },
];
