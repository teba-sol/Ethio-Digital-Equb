import type { EkubEvent } from "@/lib/ledger/events";
import { getPendingEvents, markSynced, markRejected } from "./outbox";

export interface PushResult {
  accepted: string[];
  rejected: { id: string; reason: string }[];
}

/**
 * Push unsynced events to the server.
 * Uses the X-Ekub-Secret header for auth.
 * Never drops events on failure — they stay in the outbox.
 */
export async function pushEvents(
  apiBase: string,
  secret: string,
): Promise<PushResult> {
  const pending = await getPendingEvents();

  if (pending.length === 0) {
    return { accepted: [], rejected: [] };
  }

  try {
    const response = await fetch(`${apiBase}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ekub-Secret": secret,
      },
      body: JSON.stringify({
        deviceId: pending[0]?.deviceId ?? "unknown",
        events: pending,
      }),
    });

    if (response.status === 401) {
      // Auth failed — mark all as rejected with auth reason, keep them
      for (const event of pending) {
        await markRejected(event.id, "auth");
      }
      return {
        accepted: [],
        rejected: pending.map((e) => ({ id: e.id, reason: "auth" })),
      };
    }

    if (!response.ok) {
      // Server error — keep everything pending, don't drop
      return {
        accepted: [],
        rejected: pending.map((e) => ({ id: e.id, reason: `http_${response.status}` })),
      };
    }

    const result = (await response.json()) as PushResult;

    // Mark accepted events as synced
    for (const id of result.accepted) {
      await markSynced(id);
    }

    // Mark rejected events
    for (const rejection of result.rejected) {
      await markRejected(rejection.id, rejection.reason);
    }

    return result;
  } catch {
    // Network failure — keep everything pending
    return {
      accepted: [],
      rejected: pending.map((e) => ({ id: e.id, reason: "network" })),
    };
  }
}
