import type { OnlineMode } from "@boardgames/core/protocol";
import type { SegmentedOption } from "../ui/SegmentedControl";

// Shared SegmentedControl options for the three-state online mode picker.
// Used by both the admin user row (per-user setting) and the pre-register
// queue card (stamped onto the next signup) so the two controls stay
// visually identical and order is consistent.
export const ONLINE_MODE_OPTIONS: ReadonlyArray<SegmentedOption<OnlineMode>> = [
  { value: "offline", label: "Offline" },
  { value: "both", label: "Both" },
  { value: "online", label: "Online" },
];
