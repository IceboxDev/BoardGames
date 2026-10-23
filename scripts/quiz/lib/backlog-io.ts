// The backlog on disk: `content/backlog.jsonl` (core `quiz/backlog-types.ts`).
// Adding and closing are pure over the item list; the CLI validates the
// result against the bank before writing the file back whole.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BacklogItem,
  BacklogItemSchema,
  type BacklogKind,
  type BacklogStatus,
  parseBacklog,
  serializeBacklog,
} from "../../../packages/core/src/quiz/backlog-types.ts";
import { CONTENT_DIR, writeFileAtomic } from "./content-io.ts";

export const backlogPath = (contentDir = CONTENT_DIR) => join(contentDir, "backlog.jsonl");

export function readBacklog(contentDir = CONTENT_DIR): BacklogItem[] {
  const p = backlogPath(contentDir);
  return existsSync(p) ? parseBacklog(readFileSync(p, "utf8")) : [];
}

export function writeBacklog(items: readonly BacklogItem[], contentDir = CONTENT_DIR): void {
  writeFileAtomic(backlogPath(contentDir), serializeBacklog(items));
}

/** The next free id, `b00001` upwards. */
export function nextBacklogId(items: readonly BacklogItem[]): string {
  const n = Math.max(0, ...items.map((b) => Number(b.id.slice(1)) || 0)) + 1;
  return `b${String(n).padStart(5, "0")}`;
}

export interface BacklogInput {
  kind: BacklogKind;
  target: string;
  priority: number;
  notes: string;
  links?: string[];
  by: string;
  run?: string;
  created: string;
}

const parseItem = (raw: unknown): BacklogItem => {
  const r = BacklogItemSchema.safeParse(raw);
  if (!r.success)
    throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
};

/** A new open item with the next id. */
export function newBacklogItem(items: readonly BacklogItem[], input: BacklogInput): BacklogItem {
  return parseItem({
    id: nextBacklogId(items),
    kind: input.kind,
    target: input.target,
    priority: input.priority,
    status: "open",
    created: input.created,
    by: input.by,
    ...(input.run ? { run: input.run } : {}),
    notes: input.notes,
    links: input.links ?? [],
  });
}

/** The item closed — done by a history entry, or won't fix with a reason. */
export function closeBacklogItem(
  item: BacklogItem,
  close: { byRef?: string; wontfix?: string; at: string },
): BacklogItem {
  if (item.status === "done" || item.status === "wontfix")
    throw new Error(`${item.id} is already ${item.status}`);
  if (!!close.byRef === !!close.wontfix)
    throw new Error("close with --by-ref or --wontfix, not both");
  const { closedBy: _a, closeReason: _b, closedAt: _c, ...rest } = item;
  return parseItem({
    ...rest,
    status: close.byRef ? "done" : "wontfix",
    ...(close.byRef ? { closedBy: close.byRef } : { closeReason: close.wontfix }),
    closedAt: close.at,
  });
}

export function filterBacklog(
  items: readonly BacklogItem[],
  f: { status?: BacklogStatus; kind?: BacklogKind; target?: string },
): BacklogItem[] {
  return items.filter(
    (b) =>
      (!f.status || b.status === f.status) &&
      (!f.kind || b.kind === f.kind) &&
      (!f.target || b.target === f.target || b.target.startsWith(`${f.target}:`)),
  );
}
