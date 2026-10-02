import { z } from "zod";
import { EkubEvent } from "@/lib/ledger/events";

/**
 * POST /api/sync — push events from device to server.
 * GET  /api/sync — pull events from server to device.
 *
 * Auth: X-Ekub-Secret header required on every request.
 * Push is idempotent: unique-key violation on event id = already present = success.
 */

const PushBody = z.object({
  deviceId: z.string().min(1),
  events: z.array(EkubEvent).min(1).max(500),
});

// In-memory store for demo/development.
// Replace with Prisma + Postgres for production (see prisma/schema.prisma).
interface StoredEvent {
  id: string;
  groupId: string;
  cycleId: string | null;
  type: string;
  payload: unknown;
  occurredAt: string;
  recordedBy: string;
  correctsEventId: string | null;
  deviceId: string;
  syncedAt: string;
}

// Use globalThis to survive dev hot-reload
const globalStore = globalThis as unknown as {
  __ekubEvents?: Map<string, StoredEvent>;
};

function getStore(): Map<string, StoredEvent> {
  if (!globalStore.__ekubEvents) {
    globalStore.__ekubEvents = new Map();
  }
  return globalStore.__ekubEvents;
}

function checkAuth(request: Request): boolean {
  const secret = process.env.EKUB_SYNC_SECRET;
  if (!secret) {
    // If no secret is configured, reject all requests (fail closed)
    return false;
  }
  const provided = request.headers.get("X-Ekub-Secret");
  return provided === secret;
}

function toStored(event: z.infer<typeof EkubEvent>, deviceId: string): StoredEvent {
  const { id, groupId, cycleId, type, occurredAt, recordedBy, ...rest } = event;
  return {
    id,
    groupId,
    cycleId,
    type,
    payload: rest,
    occurredAt,
    recordedBy,
    correctsEventId: "correctsEventId" in rest ? (rest.correctsEventId as string) : null,
    deviceId,
    syncedAt: new Date().toISOString(),
  };
}

function fromStored(stored: StoredEvent): z.infer<typeof EkubEvent> {
  return {
    id: stored.id,
    groupId: stored.groupId,
    cycleId: stored.cycleId,
    occurredAt: stored.occurredAt,
    recordedBy: stored.recordedBy,
    deviceId: stored.deviceId,
    ...(stored.payload as Record<string, unknown>),
  } as z.infer<typeof EkubEvent>;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PushBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { deviceId, events } = parsed.data;
  const store = getStore();

  const accepted: string[] = [];
  const rejected: { id: string; reason: string }[] = [];

  for (const event of events) {
    // Idempotent: unique key = event id
    if (store.has(event.id)) {
      // Already present — treat as success (idempotent push)
      accepted.push(event.id);
    } else {
      store.set(event.id, toStored(event, deviceId));
      accepted.push(event.id);
    }
  }

  return Response.json({ accepted, rejected });
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const groupId = url.searchParams.get("groupId");

  const store = getStore();
  let events = [...store.values()];

  if (groupId) {
    events = events.filter((e) => e.groupId === groupId);
  }

  if (since) {
    // Return events with id > since (UUID v7 is time-sortable)
    events = events.filter((e) => e.id > since);
  }

  // Sort by id (roughly chronological for UUID v7)
  events.sort((a, b) => a.id.localeCompare(b.id));

  return Response.json({
    events: events.map(fromStored),
  });
}
