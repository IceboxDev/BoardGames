import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { ChevronRightIcon } from "../icons";

// ── TreeView ─────────────────────────────────────────────────────────────
//
// A folder-style tree (the chess trainer's library): branches open and close,
// one row is selected, and the whole tree is one tab stop with the WAI-ARIA
// tree keys — ↑/↓ move, → opens (or steps into) a branch, ← closes it (or
// steps out to the parent), Home/End jump, Enter/Space select. Expansion and
// selection are the caller's state, so a route or a saved preference can
// drive them.
//
// A node with `children` (even empty) is a branch. `trailing` sits at the
// row's end (a count, a dot); `actions` appear on hover/focus (a row menu).

export interface TreeViewNode {
  readonly id: string;
  readonly label: ReactNode;
  /** A tooltip for the row. */
  readonly title?: string;
  readonly icon?: ReactNode;
  /** The icon while a branch is open (an open folder), else `icon`. */
  readonly openIcon?: ReactNode;
  /** Dimmed (e.g. an empty folder). */
  readonly muted?: boolean;
  readonly trailing?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: readonly TreeViewNode[];
}

type TreeViewProps = {
  nodes: readonly TreeViewNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  expanded: ReadonlySet<string>;
  onToggle: (id: string, open: boolean) => void;
  "aria-label": string;
  className?: string;
};

interface Row {
  readonly node: TreeViewNode;
  readonly depth: number;
  readonly parentId: string | null;
}

function visibleRows(
  nodes: readonly TreeViewNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
  parentId: string | null = null,
): Row[] {
  return nodes.flatMap((node) => [
    { node, depth, parentId },
    ...(node.children && expanded.has(node.id)
      ? visibleRows(node.children, expanded, depth + 1, node.id)
      : []),
  ]);
}

export function TreeView({
  nodes,
  selectedId,
  onSelect,
  expanded,
  onToggle,
  "aria-label": ariaLabel,
  className,
}: TreeViewProps) {
  const rows = useMemo(() => visibleRows(nodes, expanded), [nodes, expanded]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  // The tab stop: the focused row if still visible, else the selection, else the first row.
  const tabId =
    rows.find((r) => r.node.id === focusId)?.node.id ??
    rows.find((r) => r.node.id === selectedId)?.node.id ??
    rows[0]?.node.id;

  const focus = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    refs.current.get(id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const row = rows[i];
    if (!row) return;
    const branch = row.node.children !== undefined;
    const open = expanded.has(row.node.id);
    let target: string | undefined | null = null;
    switch (e.key) {
      case "ArrowDown":
        target = rows[i + 1]?.node.id;
        break;
      case "ArrowUp":
        target = rows[i - 1]?.node.id;
        break;
      case "Home":
        target = rows[0]?.node.id;
        break;
      case "End":
        target = rows.at(-1)?.node.id;
        break;
      case "ArrowRight":
        if (branch && !open) onToggle(row.node.id, true);
        else if (branch && rows[i + 1]?.depth === row.depth + 1) target = rows[i + 1]?.node.id;
        break;
      case "ArrowLeft":
        if (branch && open) onToggle(row.node.id, false);
        else target = row.parentId;
        break;
      case "Enter":
      case " ":
        onSelect(row.node.id);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (target) focus(target);
  };

  return (
    <div role="tree" aria-label={ariaLabel} className={cn("flex flex-col gap-px", className)}>
      {rows.map((row, i) => {
        const { node, depth } = row;
        const branch = node.children !== undefined;
        const open = expanded.has(node.id);
        const selected = node.id === selectedId;
        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) refs.current.set(node.id, el);
              else refs.current.delete(node.id);
            }}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={selected}
            aria-expanded={branch ? open : undefined}
            title={node.title}
            tabIndex={node.id === tabId ? 0 : -1}
            onFocus={() => setFocusId(node.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onSelect(node.id)}
            className={cn(
              "group flex min-h-8 cursor-pointer items-center gap-1.5 rounded-ui-md pr-1.5 text-sm outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent-400/60",
              selected
                ? "bg-accent-500/15 text-fg-strong"
                : "text-fg-secondary hover:bg-fill-soft hover:text-fg-primary",
              node.muted && !selected && "opacity-45",
            )}
            style={{ paddingLeft: `${0.25 + depth * 0.875}rem` }}
          >
            {branch ? (
              // biome-ignore lint/correctness/noRestrictedElements: the tree's disclosure chevron — out of the tab order (the tree's arrow keys open and close), so a focusable Button would be wrong
              <button
                type="button"
                tabIndex={-1}
                aria-label={open ? "Close folder" : "Open folder"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id, !open);
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded-ui-md text-fg-muted hover:text-fg-primary"
              >
                <ChevronRightIcon className={cn("size-3.5 transition", open && "rotate-90")} />
              </button>
            ) : (
              <span className="size-5 shrink-0" />
            )}
            {(node.icon || node.openIcon) && (
              <span className={cn("flex shrink-0", selected ? "text-accent-300" : "text-fg-muted")}>
                {open && node.openIcon ? node.openIcon : node.icon}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {node.trailing && <span className="flex shrink-0 items-center">{node.trailing}</span>}
            {node.actions && (
              // biome-ignore lint/a11y/noStaticElementInteractions: stops the row's select on a menu click; the controls inside are buttons
              // biome-ignore lint/a11y/useKeyWithClickEvents: as above — keyboard reaches the buttons themselves
              <span
                className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                {node.actions}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
