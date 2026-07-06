// Combat persistence: one row per fight, combatant state as JSON that the
// referee model rewrites turn by turn. One active combat per party at a
// time; ending a combat is terminal.

import { randomUUID } from "node:crypto";
import type { Combatant, DndCombat } from "@boardgames/core/protocol";
import { CombatantSchema, CombatStatusSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow } from "./db-rows.ts";

const CombatRowSchema = z.object({
  id: z.string(),
  party_id: z.string(),
  node_id: z.string(),
  status: CombatStatusSchema,
  round: z.number().int().min(1),
  turn_index: z.number().int().min(0),
  combatants_json: jsonColumn(z.array(CombatantSchema)),
  created_at: z.string(),
});

function rowToCombat(row: z.infer<typeof CombatRowSchema>): DndCombat {
  return {
    id: row.id,
    partyId: row.party_id,
    nodeId: row.node_id,
    status: row.status,
    round: row.round,
    turnIndex: row.turn_index,
    combatants: row.combatants_json,
    createdAt: row.created_at,
  };
}

const SELECT = "id, party_id, node_id, status, round, turn_index, combatants_json, created_at";

export async function insertCombat(args: {
  campaignId: string;
  partyId: string;
  userId: string;
  nodeId: string;
  combatants: Combatant[];
}): Promise<DndCombat> {
  const id = randomUUID();
  const result = await getDb().execute({
    sql: `INSERT INTO dnd_combats (id, campaign_id, party_id, user_id, node_id, combatants_json)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING ${SELECT}`,
    args: [
      id,
      args.campaignId,
      args.partyId,
      args.userId,
      args.nodeId,
      JSON.stringify(args.combatants),
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error("dnd_combats insert returned no row");
  return rowToCombat(parseRow(CombatRowSchema, row, "dnd_combats"));
}

export async function getActiveCombat(partyId: string, userId: string): Promise<DndCombat | null> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT} FROM dnd_combats
          WHERE party_id = ? AND user_id = ? AND status = 'active'
          ORDER BY rowid DESC LIMIT 1`,
    args: [partyId, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToCombat(parseRow(CombatRowSchema, row, "dnd_combats"));
}

export async function getCombat(id: string, userId: string): Promise<DndCombat | null> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT} FROM dnd_combats WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToCombat(parseRow(CombatRowSchema, row, "dnd_combats"));
}

export async function updateCombat(
  id: string,
  userId: string,
  patch: {
    combatants?: Combatant[];
    round?: number;
    turnIndex?: number;
    status?: "active" | "ended";
  },
): Promise<DndCombat | null> {
  const current = await getCombat(id, userId);
  if (!current) return null;
  await getDb().execute({
    sql: `UPDATE dnd_combats
          SET combatants_json = ?, round = ?, turn_index = ?, status = ?
          WHERE id = ? AND user_id = ?`,
    args: [
      JSON.stringify(patch.combatants ?? current.combatants),
      patch.round ?? current.round,
      patch.turnIndex ?? current.turnIndex,
      patch.status ?? current.status,
      id,
      userId,
    ],
  });
  return getCombat(id, userId);
}
