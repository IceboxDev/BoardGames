import type { GeoCatalog, Lang } from "@boardgames/core/trainers/geography/catalog";
import type { OpenGroup } from "@boardgames/core/trainers/geography/session";
import { Badge, Modal, ModalBody, SelectableCard } from "../../components/ui";
import { groupLabel } from "./labels";

// What to study next — the learner's call. Places already climbing their
// stages and due reviews come along in every sitting; on top of that, one
// new group: the breadth-first suggestion is marked, any open group can be
// picked, or none at all.

type Props = {
  catalog: GeoCatalog;
  groups: readonly OpenGroup[];
  /** Places mid-ladder plus due reviews. */
  continuing: number;
  lang: Lang;
  onPick: (group: string | null) => void;
  onClose: () => void;
};

export function StudyPicker({ catalog, groups, continuing, lang, onPick, onClose }: Props) {
  return (
    <Modal
      onClose={onClose}
      size="sm"
      eyebrow="Study"
      title="What next?"
      subheader={
        <p className="text-xs text-fg-muted">
          {continuing > 0
            ? `${continuing} place${continuing === 1 ? "" : "s"} to continue or review come along either way.`
            : "Pick a group to start — all of it, four stages each."}
        </p>
      }
    >
      <ModalBody className="flex flex-col gap-2">
        {continuing > 0 && (
          <SelectableCard
            variant="row"
            orientation="horizontal"
            title="Just continue & review"
            description="No new places this time."
            trailing={<Badge size="xs">{continuing}</Badge>}
            onClick={() => onPick(null)}
          />
        )}
        {groups.map((g, i) => (
          <SelectableCard
            key={g.id}
            variant="row"
            orientation="horizontal"
            title={groupLabel(catalog, g, lang)}
            trailing={
              <span className="flex items-center gap-2">
                {i === 0 && (
                  <Badge tone="accent" size="xs">
                    suggested
                  </Badge>
                )}
                <Badge size="xs">{g.places.length} new</Badge>
              </span>
            }
            onClick={() => onPick(g.id)}
          />
        ))}
      </ModalBody>
    </Modal>
  );
}
