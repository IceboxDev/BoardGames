// The shared tone vocabulary — import tone types from here, not per-component.

// data-select-style selection variants (inert until the personalization
// engine sets the attribute on <html>).
import "./select-styles.css";

export { AiThinkingIndicator, WaitingIndicator } from "./AiThinkingIndicator";
export { AuthCard } from "./AuthCard";
export { Avatar, type AvatarSize } from "./Avatar";
export { Badge, type BadgeTone } from "./Badge";
export { BoardOverlay } from "./BoardOverlay";
export { Button, ButtonLink } from "./Button";
export { Checkbox } from "./Checkbox";
export { Chip, type ChipTone } from "./Chip";
export { CopyField } from "./CopyField";
export { DialogBackdrop } from "./DialogBackdrop";
export { Drawer } from "./Drawer";
export { EmptyState, type EmptyStateTone } from "./EmptyState";
export { ErrorAlert } from "./ErrorAlert";
export { Field, FieldGroup } from "./Field";
export { IconButton } from "./IconButton";
export { Input } from "./Input";
export { InteractiveCard, type InteractiveCardPadding } from "./InteractiveCard";
export { Eyebrow, type EyebrowSize, type EyebrowTone, MicroLabel } from "./Label";
export { LoadingState } from "./LoadingState";
export { Modal, ModalBody, ModalFooter, type ModalSize } from "./Modal";
export { Overlay } from "./Overlay";
export type { PageHeaderAlign, PageHeaderSize } from "./PageHeader";
export { PageHeader } from "./PageHeader";
export type {
  PageMainPadding,
  PageMainWidth,
  PageShellBackground,
  PageShellLayout,
} from "./PageShell";
export { PageMain, PageShell } from "./PageShell";
export { QueryBoundary } from "./QueryBoundary";
export { Section } from "./Section";
export type { SegmentedOption, SegmentedTone } from "./SegmentedControl";
export { SegmentedControl } from "./SegmentedControl";
export { Select, type SelectSize } from "./Select";
export { SelectableCard, type SelectableCardPadding } from "./SelectableCard";
export { Spinner } from "./Spinner";
export { Stack, type StackGap } from "./Stack";
export {
  Surface,
  type SurfacePadding,
  type SurfaceRadius,
  type SurfaceVariant,
} from "./Surface";
export { Textarea } from "./Textarea";
export {
  type CoreTone,
  TONE_ACTIVE,
  TONE_BUBBLE,
  TONE_GLOW,
  TONE_RING,
  TONE_TEXT,
  type Tone,
} from "./tones";
export { type ConfirmOptions, useConfirm } from "./useConfirm";
