import type { EkubEvent } from "@/lib/ledger/events";
import { db } from "@/db/client";
import { getSyncCursor } from "./outbox";

export interface PullResult {
  events: EkubEvent[];
  newCount: number;
}

/**
 * Pull events from the server that this device hasn't seen yet.
 * Uses the sync cursor (newest event id) to ask for newer events.
 * Merges by id — unique key prevents duplicates.
 */
export async function pullEvents(
  apiBase: string,
  secret: string,
  groupId: string,
): Promise<PullResult> {
  const cursor = await getSyncCursor();

  try {
    const params = new URLSearchParams({ groupId });
    if (cursor) params.set("since", cursor);

    const response = await fetch(`${apiBase}/api/sync?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-Ekub-Secret": secret,
      },
    });

    if (!response.ok) {
      return { events: [], newCount: 0 };
    }

    const result = (await response.json()) as { events: EkubEvent[] };

    // Merge by id — only insert events we don't already have
    const existingIds = new Set(
      (await db.events.toArray()).map((e) => e.id),
    );

    const newEvents = result.events.filter((e) => !existingIds.has(e.id));

    for (const event of newEvents) {
      try {
        await db.events.add(event);
      } catch {
        // Duplicate — ignore
      }
    }

    return { events: newEvents, newCount: newEvents.length };
  } catch {
    return { events: [], newCount: 0 };
  }
}
