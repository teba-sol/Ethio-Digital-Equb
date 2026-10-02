import { db } from "./client";
import { derive } from "@/lib/ledger/derive";
import type { EkubEvent, MemberAdded } from "@/lib/ledger/events";

export async function getAllEvents(): Promise<EkubEvent[]> {
  return db.events.toArray();
}

export async function getLedgerView() {
  const events = await getAllEvents();
  return derive(events);
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function writeEvent(event: EkubEvent): Promise<void> {
  const allEvents = await db.events.toArray();
  const group = allEvents.find((e) => e.type === "group_created");

  // ── Group guards ──────────────────────────────────────────────
  if (event.type === "group_created") {
    if (group) {
      throw new Error(
        "A group already exists. A second group_created event was refused.",
      );
    }
  } else if (!group) {
    throw new Error(
      "No group exists yet. Refusing to record an event before the group is created.",
    );
  }

  // ── Cycle guards ──────────────────────────────────────────────
  if (event.type === "cycle_created") {
    const existingCycle = allEvents.find((e) => e.type === "cycle_created");
    if (existingCycle) {
      throw new Error(
        "A cycle already exists. One active cycle at a time was refused.",
      );
    }

    const rosterIds = new Set(
      allEvents
        .filter((e): e is MemberAdded => e.type === "member_added")
        .map((m) => m.memberId),
    );
    const unknown = event.memberIds.filter((id) => !rosterIds.has(id));
    if (unknown.length > 0) {
      throw new Error("Refused cycle_created for member(s) not on the roster.");
    }
  }

  // ── Ledger event guards (require an active cycle) ─────────────
  const ledgerTypes = new Set([
    "contribution",
    "cover",
    "payout",
    "exit_refund",
    "forfeit_redistribution",
    "default_event",
    "bad_debt_event",
    "correction",
  ]);

  if (ledgerTypes.has(event.type)) {
    const cycle = allEvents.find((e) => e.type === "cycle_created");
    if (!cycle) {
      throw new Error(
        "No cycle exists. Refusing to record a ledger event before the cycle is created.",
      );
    }

    const view = derive(allEvents);
    const rosterIds = new Set(view.members.map((m) => m.memberId));

    switch (event.type) {
      case "contribution": {
        if (!rosterIds.has(event.memberId)) {
          throw new Error("Refused contribution for member not on the roster.");
        }
        // No double-record: same member + same period + same status
        const existing = allEvents.find(
          (e) =>
            e.type === "contribution" &&
            e.memberId === event.memberId &&
            e.periodNumber === event.periodNumber &&
            e.status === event.status,
        );
        if (existing) {
          throw new Error(
            "A contribution is already recorded for this member in this period.",
          );
        }
        // Can't record "paid" if already covered
        if (event.status === "paid") {
          const covered = allEvents.find(
            (e) =>
              e.type === "contribution" &&
              e.memberId === event.memberId &&
              e.periodNumber === event.periodNumber &&
              e.status === "covered",
          );
          if (covered) {
            throw new Error(
              "This contribution is already covered by another member.",
            );
          }
        }
        break;
      }

      case "cover": {
        if (!rosterIds.has(event.coveredMemberId)) {
          throw new Error("Refused cover for member not on the roster.");
        }
        if (!rosterIds.has(event.coveringMemberId)) {
          throw new Error("Refused cover for covering member not on the roster.");
        }
        if (event.coveredMemberId === event.coveringMemberId) {
          throw new Error("A member cannot cover their own contribution.");
        }
        break;
      }

      case "payout": {
        if (!rosterIds.has(event.memberId)) {
          throw new Error("Refused payout for member not on the roster.");
        }
        // One payout per period
        const existingPayout = allEvents.find(
          (e) => e.type === "payout" && e.periodNumber === event.periodNumber,
        );
        if (existingPayout) {
          throw new Error(
            "A payout is already recorded for this period.",
          );
        }
        // Member must not have exited
        if (view.cycleState.exitedMemberIds.includes(event.memberId)) {
          throw new Error(
            "This member has exited the cycle and cannot receive a payout.",
          );
        }
        break;
      }

      case "exit_refund": {
        if (!rosterIds.has(event.memberId)) {
          throw new Error("Refused exit for member not on the roster.");
        }
        // Rule 2: exit not permitted after payout
        const balance = view.memberBalances.find(
          (mb) => mb.memberId === event.memberId,
        );
        if (balance?.hasReceivedPayout) {
          throw new Error(
            "Exit is not permitted after a member has received their payout (Rule 2).",
          );
        }
        // Already exited?
        if (view.cycleState.exitedMemberIds.includes(event.memberId)) {
          throw new Error("This member has already exited the cycle.");
        }
        break;
      }

      case "correction": {
        const target = allEvents.find((e) => e.id === event.correctsEventId);
        if (!target) {
          throw new Error("Cannot correct an event that does not exist.");
        }
        // Every event is corrected at most once
        const alreadyCorrected = allEvents.find(
          (e) => e.type === "correction" && e.correctsEventId === event.correctsEventId,
        );
        if (alreadyCorrected) {
          throw new Error(
            "This event has already been corrected. Each event can be corrected at most once.",
          );
        }
        break;
      }

      default:
        break;
    }
  }

  // ── Write the event + outbox entry ────────────────────────────
  await db.events.add(event);

  // Add to outbox for sync (pending)
  await db.outbox.add({
    id: event.id,
    eventId: event.id,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  });
}
