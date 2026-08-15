// Merge the collection payload into display rows: every stored inventory
// slug (with or without a metadata item), custom (slug-less) items, and
// played-through records whose slug has left the inventory. Pure module so
// the table, the filters, and the CSV export all agree on the row set.

import { isLegacyDestructible } from "@boardgames/core/games/legacy-games";
import type { CollectionItem, CollectionResponse, PlayStat } from "@boardgames/core/protocol";
import {
  type InventoryEntryKind,
  resolveInventoryEntry,
} from "../../lib/resolve-inventory-entry.ts";

export interface CollectionRow {
  /** Stable list key: the slug, or the item id for custom items. */
  key: string;
  slug: string | null;
  /** Metadata row, when one has been materialized. */
  item: CollectionItem | null;
  title: string;
  thumbnail: string | null;
  bggId: number | null;
  kind: InventoryEntryKind | "custom";
  /** Whether playing it to completion destroys the copy (EXIT, Medical Mysteries). */
  legacy: boolean;
  playCount: number;
  lastPlayedAt: string | null;
  /** Destroyed by playthrough — no longer counted as owned. */
  playedThrough: boolean;
}

export function buildCollectionRows(data: CollectionResponse): CollectionRow[] {
  const playBySlug = new Map<string, PlayStat>(data.playStats.map((p) => [p.slug, p]));
  const itemBySlug = new Map<string, CollectionItem>();
  for (const item of data.items) {
    if (item.slug !== null) itemBySlug.set(item.slug, item);
  }
  const owned = new Set(data.slugs);

  const rows: CollectionRow[] = [];
  const slugRow = (slug: string, item: CollectionItem | null): CollectionRow => {
    const entry = resolveInventoryEntry(slug);
    const plays = playBySlug.get(slug);
    return {
      key: slug,
      slug,
      item,
      title: entry.title,
      thumbnail: entry.thumbnail,
      bggId: entry.bggId,
      kind: entry.kind,
      legacy: isLegacyDestructible(slug),
      playCount: plays?.playCount ?? 0,
      lastPlayedAt: plays?.lastPlayedAt ?? null,
      playedThrough: item?.playedThroughAt != null,
    };
  };

  for (const slug of data.slugs) rows.push(slugRow(slug, itemBySlug.get(slug) ?? null));
  for (const item of data.items) {
    if (item.slug === null) {
      // Custom (free-text-approved) item.
      rows.push({
        key: item.id,
        slug: null,
        item,
        title: item.customTitle ?? "Untitled game",
        thumbnail: null,
        bggId: null,
        kind: "custom",
        legacy: false,
        playCount: 0,
        lastPlayedAt: null,
        playedThrough: item.playedThroughAt != null,
      });
    } else if (!owned.has(item.slug)) {
      // Historical record: the slug left the inventory (played-through, or an
      // admin removal that kept the row). Rendered struck-through.
      rows.push({ ...slugRow(item.slug, item), playedThrough: true });
    }
  }
  return rows;
}

/** Row-key → display title, for resolving `containerKey` references. */
export function rowTitleByKey(rows: readonly CollectionRow[]): Map<string, string> {
  return new Map(rows.map((r) => [r.key, r.title]));
}
