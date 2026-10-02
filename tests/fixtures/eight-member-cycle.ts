import type { EkubEvent } from "@/lib/ledger/events";
import { derive } from "@/lib/ledger/derive";
import { checkInvariants } from "@/lib/ledger/invariants";

const GROUP_ID = "01900000-0000-7000-8000-000000000001";
const CYCLE_ID = "01900000-0000-7000-8000-000000000002";
const DEVICE = "test-device";
const LEADER = "leader";

function ts(minuteOffset: number): string {
  const base = new Date("2026-01-01T10:00:00.000Z").getTime();
  return new Date(base + minuteOffset * 60_000).toISOString();
}

function uuid(n: number): string {
  return `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

export const MEMBER_IDS = [
  uuid(101),
  uuid(102),
  uuid(103),
  uuid(104),
  uuid(105),
  uuid(106),
  uuid(107),
  uuid(108),
];

export const MEMBER_NAMES = [
  "Abebe",
  "Belaynesh",
  "Chaltu",
  "Dawit",
  "Eden",
  "Fikir",
  "Girma",
  "Hana",
];

const AMOUNT = 500_00; // 500 ETB in santim

/**
 * A full 8-member cycle:
 * - 8 members, 500 ETB weekly
 * - Period 1: everyone pays, Abebe receives the pot (8 × 500 = 4000 ETB)
 * - Period 2: Chaltu misses, Belaynesh covers; Belaynesh receives
 * - Period 3: everyone pays, Chaltu receives (debts settle)
 * - Period 4–8: clean cycles
 * - Final: ledger balances
 */
export function buildEightMemberCycle(): EkubEvent[] {
  const events: EkubEvent[] = [];
  let t = 0;

  const push = (e: EkubEvent) => {
    events.push(e);
    t += 1;
  };

  // Setup
  push({
    id: uuid(1),
    groupId: GROUP_ID,
    cycleId: null,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "group_created",
    name: "Meseret Ekub",
    defaultAmount: AMOUNT,
    frequency: "weekly",
  });

  MEMBER_IDS.forEach((id, i) => {
    push({
      id: uuid(10 + i),
      groupId: GROUP_ID,
      cycleId: null,
      occurredAt: ts(t),
      recordedBy: LEADER,
      deviceId: DEVICE,
      type: "member_added",
      memberId: id,
      name: MEMBER_NAMES[i],
      phone: null,
      joinedAt: "2026-01-01",
    });
  });

  push({
    id: uuid(20),
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "cycle_created",
    startDate: "2026-01-05",
    defaultAmount: AMOUNT,
    frequency: "weekly",
    memberIds: [...MEMBER_IDS],
  });

  // ── Period 1: everyone pays, Abebe (index 0) receives ──────────
  MEMBER_IDS.forEach((id, i) => {
    push({
      id: uuid(100 + i),
      groupId: GROUP_ID,
      cycleId: CYCLE_ID,
      occurredAt: ts(t),
      recordedBy: LEADER,
      deviceId: DEVICE,
      type: "contribution",
      memberId: id,
      periodNumber: 1,
      amount: AMOUNT,
      status: "paid",
    });
  });

  push({
    id: uuid(200),
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "payout",
    memberId: MEMBER_IDS[0], // Abebe
    periodNumber: 1,
    grossPot: AMOUNT * 8,
    deductions: [],
    netAmount: AMOUNT * 8,
  });

  // ── Period 2: Chaltu (index 2) misses, Belaynesh (index 1) covers ──
  // Everyone except Chaltu pays
  [0, 1, 3, 4, 5, 6, 7].forEach((i) => {
    push({
      id: uuid(300 + i),
      groupId: GROUP_ID,
      cycleId: CYCLE_ID,
      occurredAt: ts(t),
      recordedBy: LEADER,
      deviceId: DEVICE,
      type: "contribution",
      memberId: MEMBER_IDS[i],
      periodNumber: 2,
      amount: AMOUNT,
      status: "paid",
    });
  });

  // Chaltu's contribution is marked covered
  push({
    id: uuid(310),
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "contribution",
    memberId: MEMBER_IDS[2],
    periodNumber: 2,
    amount: AMOUNT,
    status: "covered",
  });

  // Belaynesh covers Chaltu
  push({
    id: uuid(320),
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "cover",
    coveredMemberId: MEMBER_IDS[2],
    coveringMemberId: MEMBER_IDS[1],
    periodNumber: 2,
    amount: AMOUNT,
  });

  // Belaynesh receives the pot (Rule 4: debts settle at payout)
  // Belaynesh has no outstanding debts, so full pot goes to them
  push({
    id: uuid(400),
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "payout",
    memberId: MEMBER_IDS[1], // Belaynesh
    periodNumber: 2,
    grossPot: AMOUNT * 8,
    deductions: [],
    netAmount: AMOUNT * 8,
  });

  // ── Period 3: everyone pays, Chaltu (index 2) receives ─────────
  // Chaltu now owes Belaynesh 500 ETB — settled at Chaltu's payout
  MEMBER_IDS.forEach((id, i) => {
    push({
      id: uuid(500 + i),
      groupId: GROUP_ID,
      cycleId: CYCLE_ID,
      occurredAt: ts(t),
      recordedBy: LEADER,
      deviceId: DEVICE,
      type: "contribution",
      memberId: id,
      periodNumber: 3,
      amount: AMOUNT,
      status: "paid",
    });
  });

  // Chaltu receives payout with debt deduction to Belaynesh
  push({
    id: uuid(600),
    groupId: GROUP_ID,
    cycleId: CYCLE_ID,
    occurredAt: ts(t),
    recordedBy: LEADER,
    deviceId: DEVICE,
    type: "payout",
    memberId: MEMBER_IDS[2], // Chaltu
    periodNumber: 3,
    grossPot: AMOUNT * 8,
    deductions: [
      {
        kind: "debt",
        toMemberId: MEMBER_IDS[1], // Belaynesh
        fromMemberId: MEMBER_IDS[2], // Chaltu
        amount: AMOUNT,
        note: "Cover settlement for period 2",
      },
    ],
    netAmount: AMOUNT * 8 - AMOUNT,
  });

  // ── Periods 4–8: clean cycles ──────────────────────────────────
  const remainingReceivers = [3, 4, 5, 6, 7]; // Dawit through Hana
  remainingReceivers.forEach((receiverIdx, periodOffset) => {
    const periodNumber = 4 + periodOffset;
    MEMBER_IDS.forEach((id, i) => {
      push({
        id: uuid(700 + periodOffset * 10 + i),
        groupId: GROUP_ID,
        cycleId: CYCLE_ID,
        occurredAt: ts(t),
        recordedBy: LEADER,
        deviceId: DEVICE,
        type: "contribution",
        memberId: id,
        periodNumber,
        amount: AMOUNT,
        status: "paid",
      });
    });
    push({
      id: uuid(790 + periodOffset),
      groupId: GROUP_ID,
      cycleId: CYCLE_ID,
      occurredAt: ts(t),
      recordedBy: LEADER,
      deviceId: DEVICE,
      type: "payout",
      memberId: MEMBER_IDS[receiverIdx],
      periodNumber,
      grossPot: AMOUNT * 8,
      deductions: [],
      netAmount: AMOUNT * 8,
    });
  });

  return events;
}

/**
 * Quick sanity check that the fixture derives correctly.
 * Useful as a smoke test during development.
 */
export function verifyFixture(): {
  ok: boolean;
  totalContributions: number;
  totalPayouts: number;
  outstandingDebt: number;
  closed: boolean;
  invariantOk: boolean;
} {
  const events = buildEightMemberCycle();
  const view = derive(events);
  const invariants = checkInvariants(events);

  return {
    ok: invariants.ok && view.cycleState.closed,
    totalContributions: view.totalContributions,
    totalPayouts: view.totalPayouts,
    outstandingDebt: view.cycleState.outstandingDebtTotal,
    closed: view.cycleState.closed,
    invariantOk: invariants.ok,
  };
}
