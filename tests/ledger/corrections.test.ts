import { describe, expect, it } from "vitest";
import { derive } from "@/lib/ledger/derive";
import { checkInvariants } from "@/lib/ledger/invariants";
import type { EkubEvent } from "@/lib/ledger/events";
import {
  buildEightMemberCycle,
  MEMBER_IDS,
} from "../fixtures/eight-member-cycle";

const GROUP_ID = "01900000-0000-7000-8000-000000000001";
const CYCLE_ID = "01900000-0000-7000-8000-000000000002";
const DEVICE = "test-device";
const LEADER = "leader";

function correctionEvent(input: {
  id: string;
  correctsEventId: string;
  reason: string;
  apply?: EkubEvent extends never ? never : Record<string, unknown>;
  occurredAt?: string;
}): EkubEvent {
  return {
    id: input.id,
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: input.occurredAt ?? new Date("2026-02-01T10:00:00.000Z").toISOString(),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "correction",
    correctsEventId: input.correctsEventId,
    reason: input.reason,
    apply: input.apply as never,
  } as EkubEvent;
}

describe("corrections (L16 / DOMAIN.md §5)", () => {
  it("correcting a contribution reverses its effect", () => {
    const base = buildEightMemberCycle();

    // Find a contribution event to correct (Abebe's period 1 contribution)
    const target = base.find(
      (e) =>
        e.type === "contribution" &&
        e.memberId === MEMBER_IDS[0] &&
        e.periodNumber === 1,
    );
    expect(target).toBeDefined();
    if (!target) return;

    const before = derive(base);
    const beforeContributed = before.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[0],
    )?.totalContributed;

    // Add a correction that reverses the contribution (no replacement)
    const correction = correctionEvent({
      id: "01900000-0000-7000-8000-000000000900",
      correctsEventId: target.id,
      reason: "Recorded against wrong member",
    });

    const after = derive([...base, correction]);
    const afterContributed = after.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[0],
    )?.totalContributed;

    // Contribution should be reversed
    expect(afterContributed).toBe((beforeContributed ?? 0) - 50000);
  });

  it("correction with replacement applies the new event", () => {
    const base = buildEightMemberCycle();

    // Correct Abebe's contribution, replace with a contribution for a different member
    const target = base.find(
      (e) =>
        e.type === "contribution" &&
        e.memberId === MEMBER_IDS[0] &&
        e.periodNumber === 1,
    );
    expect(target).toBeDefined();
    if (!target) return;

    const before = derive(base);
    const abebeBefore = before.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[0],
    )?.totalContributed;
    const hanaBefore = before.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[7],
    )?.totalContributed;

    const correction = correctionEvent({
      id: "01900000-0000-7000-8000-000000000901",
      correctsEventId: target.id,
      reason: "Wrong member recorded",
      apply: {
        type: "contribution",
        memberId: MEMBER_IDS[7], // Hana instead of Abebe
        periodNumber: 1,
        amount: 50000,
        status: "paid",
      },
    });

    const after = derive([...base, correction]);
    const abebeAfter = after.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[0],
    )?.totalContributed;
    const hanaAfter = after.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[7],
    )?.totalContributed;

    // Abebe loses the contribution, Hana gains it
    expect(abebeAfter).toBe((abebeBefore ?? 0) - 50000);
    expect(hanaAfter).toBe((hanaBefore ?? 0) + 50000);
  });

  it("ledger still balances after a correction", () => {
    const base = buildEightMemberCycle();
    const target = base.find(
      (e) =>
        e.type === "contribution" &&
        e.memberId === MEMBER_IDS[0] &&
        e.periodNumber === 1,
    );
    expect(target).toBeDefined();
    if (!target) return;

    const correction = correctionEvent({
      id: "01900000-0000-7000-8000-000000000902",
      correctsEventId: target.id,
      reason: "Wrong member",
      apply: {
        type: "contribution",
        memberId: MEMBER_IDS[7],
        periodNumber: 1,
        amount: 50000,
        status: "paid",
      },
    });

    const result = checkInvariants([...base, correction]);
    expect(result.ok).toBe(true);
  });

  it("correction-of-correction restores original state", () => {
    const base = buildEightMemberCycle();

    const target = base.find(
      (e) =>
        e.type === "contribution" &&
        e.memberId === MEMBER_IDS[0] &&
        e.periodNumber === 1,
    );
    expect(target).toBeDefined();
    if (!target) return;

    const before = derive(base);
    const abebeBefore = before.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[0],
    )?.totalContributed;

    // First correction: wrong replacement
    const correction1 = correctionEvent({
      id: "01900000-0000-7000-8000-000000000910",
      correctsEventId: target.id,
      reason: "Wrong member recorded",
      apply: {
        type: "contribution",
        memberId: MEMBER_IDS[7],
        periodNumber: 1,
        amount: 50000,
        status: "paid",
      },
      occurredAt: new Date("2026-02-01T10:00:00.000Z").toISOString(),
    });

    // Correction-of-correction: fix the correction, restore original
    const correction2 = correctionEvent({
      id: "01900000-0000-7000-8000-000000000911",
      correctsEventId: correction1.id,
      reason: "Correction was wrong, original was correct",
      apply: {
        type: "contribution",
        memberId: MEMBER_IDS[0], // back to Abebe
        periodNumber: 1,
        amount: 50000,
        status: "paid",
      },
      occurredAt: new Date("2026-02-01T11:00:00.000Z").toISOString(),
    });

    const after = derive([...base, correction1, correction2]);
    const abebeAfter = after.memberBalances.find(
      (mb) => mb.memberId === MEMBER_IDS[0],
    )?.totalContributed;

    // Should be back to original
    expect(abebeAfter).toBe(abebeBefore);
  });

  it("marked as corrected in history", () => {
    const base = buildEightMemberCycle();
    const target = base.find(
      (e) =>
        e.type === "contribution" &&
        e.memberId === MEMBER_IDS[0] &&
        e.periodNumber === 1,
    );
    expect(target).toBeDefined();
    if (!target) return;

    const correction = correctionEvent({
      id: "01900000-0000-7000-8000-000000000903",
      correctsEventId: target.id,
      reason: "Test correction",
    });

    const view = derive([...base, correction]);
    const historyEntry = view.history.find((h) => h.event.id === target.id);
    expect(historyEntry?.isReversed).toBe(true);
    expect(historyEntry?.correctedBy?.reason).toBe("Test correction");
  });
});
