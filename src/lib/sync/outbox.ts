import { db } from "@/db/client";

export interface OutboxEntry {
  id: string;
  eventId: string;
  status: "pending" | "synced" | "rejected";
  reason?: string;
  createdAt: string;
  syncedAt?: string;
}

/**
 * Get all events that haven't been synced yet.
 */
export async function getPendingEvents() {
  const pending = await db.outbox
    .filter((o) => o.status === "pending")
    .toArray();

  const eventIds = pending.map((o) => o.eventId);
  const events = await db.events.where("id").anyOf(eventIds).toArray();

  return events;
}

/**
 * Mark an event as synced.
 */
export async function markSynced(eventId: string): Promise<void> {
  await db.outbox
    .filter((o) => o.eventId === eventId)
    .modify({ status: "synced", syncedAt: new Date().toISOString() });
}

/**
 * Mark an event as rejected by the server.
 */
export async function markRejected(
  eventId: string,
  reason: string,
): Promise<void> {
  await db.outbox
    .filter((o) => o.eventId === eventId)
    .modify({ status: "rejected", reason });
}

/**
 * Get the current sync cursor (newest event id).
 */
export async function getSyncCursor(): Promise<string | null> {
  const last = await db.events
    .orderBy("id")
    .reverse()
    .first();
  return last?.id ?? null;
}

/**
 * Count pending (unsynced) events.
 */
export async function getPendingCount(): Promise<number> {
  return db.outbox.filter((o) => o.status === "pending").count();
}
