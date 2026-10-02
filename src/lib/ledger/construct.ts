import { v7 as uuidv7 } from "uuid";
import { parseMoney } from "@/lib/money";
import {
  BadDebtEvent,
  ContributionEvent,
  CorrectionEvent,
  CoverEvent,
  CycleCreatedEvent,
  DefaultEvent,
  ExitRefundEvent,
  ForfeitRedistributionEvent,
  GroupCreatedEvent,
  MemberAddedEvent,
  PayoutEvent,
  type BadDebtEvent as BadDebtEventT,
  type Contribution as ContributionT,
  type Correction as CorrectionT,
  type Cover as CoverT,
  type CycleCreated,
  type DefaultEvent as DefaultEventT,
  type ExitRefund as ExitRefundT,
  type ForfeitRedistribution as ForfeitRedistributionT,
  type Frequency,
  type GroupCreated,
  type MemberAdded,
  type Payout as PayoutT,
  type Deduction,
  type LedgerEventPayload,
  type SettlementType,
} from "./events";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

// ─── Setup builders (L1–L3) ─────────────────────────────────────────

export interface GroupInput {
  name: string;
  amount: string;
  frequency: "daily" | "weekly" | "monthly";
  recordedBy: string;
  deviceId: string;
}

export function constructGroupCreated(input: GroupInput): GroupCreated {
  const amount = parseMoney(input.amount);
  if (amount === null) {
    throw new Error("Invalid amount: must be birr with up to two decimals");
  }

  const event = {
    id: uuidv7(),
    groupId: uuidv7(),
    cycleId: null,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "group_created" as const,
    name: input.name.trim(),
    defaultAmount: amount,
    frequency: input.frequency,
  };

  const parsed = GroupCreatedEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid group_created event");
  }
  return parsed.data;
}

export interface MemberInput {
  groupId: string;
  name: string;
  phone: string;
  joinedAt?: string;
  recordedBy: string;
  deviceId: string;
}

export function constructMemberAdded(input: MemberInput): MemberAdded {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error("Member name cannot be empty");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: null,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "member_added" as const,
    memberId: uuidv7(),
    name: trimmedName,
    phone: input.phone.trim() || null,
    joinedAt: input.joinedAt ?? today(),
  };

  const parsed = MemberAddedEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid member_added event");
  }
  return parsed.data;
}

export interface CycleInput {
  groupId: string;
  startDate: string;
  amount: string;
  frequency: Frequency;
  memberIds: string[];
  recordedBy: string;
  deviceId: string;
}

export function constructCycleCreated(input: CycleInput): CycleCreated {
  const amount = parseMoney(input.amount);
  if (amount === null) {
    throw new Error("Invalid amount: must be birr with up to two decimals");
  }

  const uniqueMemberIds = Array.from(new Set(input.memberIds));
  if (uniqueMemberIds.length < 2) {
    throw new Error("A cycle needs at least two members");
  }

  const cycleId = uuidv7();
  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "cycle_created" as const,
    startDate: input.startDate,
    defaultAmount: amount,
    frequency: input.frequency,
    memberIds: uniqueMemberIds,
  };

  const parsed = CycleCreatedEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid cycle_created event");
  }
  return parsed.data;
}

// ─── Ledger builders (L4–L9, L16) ──────────────────────────────────

interface LedgerEnvelope {
  groupId: string;
  cycleId: string;
  recordedBy: string;
  deviceId: string;
}

export interface ContributionInput extends LedgerEnvelope {
  memberId: string;
  periodNumber: number;
  amount: string;
  status: "paid" | "covered" | "missed" | "defaulted";
}

export function constructContribution(input: ContributionInput): ContributionT {
  const amount = parseMoney(input.amount);
  if (amount === null) {
    throw new Error("Invalid amount: must be birr with up to two decimals");
  }
  if (amount <= 0 && input.status !== "missed" && input.status !== "defaulted") {
    throw new Error("Contribution amount must be positive");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "contribution" as const,
    memberId: input.memberId,
    periodNumber: input.periodNumber,
    amount,
    status: input.status,
  };

  const parsed = ContributionEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid contribution event");
  }
  return parsed.data;
}

export interface CoverInput extends LedgerEnvelope {
  coveredMemberId: string;
  coveringMemberId: string;
  periodNumber: number;
  amount: string;
}

export function constructCover(input: CoverInput): CoverT {
  const amount = parseMoney(input.amount);
  if (amount === null || amount <= 0) {
    throw new Error("Cover amount must be a positive birr amount");
  }
  if (input.coveredMemberId === input.coveringMemberId) {
    throw new Error("A member cannot cover their own contribution");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "cover" as const,
    coveredMemberId: input.coveredMemberId,
    coveringMemberId: input.coveringMemberId,
    periodNumber: input.periodNumber,
    amount,
  };

  const parsed = CoverEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid cover event");
  }
  return parsed.data;
}

export interface PayoutInput extends LedgerEnvelope {
  memberId: string;
  periodNumber: number;
  grossPot: string;
  deductions: {
    kind: "debt" | "refund" | "bad_debt";
    toMemberId?: string | null;
    fromMemberId?: string | null;
    amount: string;
    note?: string | null;
  }[];
}

export function constructPayout(input: PayoutInput): PayoutT {
  const grossPot = parseMoney(input.grossPot);
  if (grossPot === null || grossPot < 0) {
    throw new Error("Gross pot must be a non-negative birr amount");
  }

  const deductions: Deduction[] = input.deductions.map((d) => {
    const amount = parseMoney(d.amount);
    if (amount === null || amount < 0) {
      throw new Error("Deduction amount must be a non-negative birr amount");
    }
    return {
      kind: d.kind,
      toMemberId: d.toMemberId ?? null,
      fromMemberId: d.fromMemberId ?? null,
      amount,
      note: d.note ?? null,
    };
  });

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netAmount = Math.max(0, grossPot - totalDeductions);

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "payout" as const,
    memberId: input.memberId,
    periodNumber: input.periodNumber,
    grossPot,
    deductions,
    netAmount,
  };

  const parsed = PayoutEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid payout event");
  }
  return parsed.data;
}

export interface ExitRefundInput extends LedgerEnvelope {
  memberId: string;
  settlementType: SettlementType;
  totalContributed: string;
  availablePot: string;
  outstandingDebtsOwed: string;
  reason: string;
  consentNote?: string | null;
}

export function constructExitRefund(input: ExitRefundInput): ExitRefundT {
  const totalContributed = parseMoney(input.totalContributed) ?? 0;
  const availablePot = parseMoney(input.availablePot) ?? 0;
  const outstandingDebtsOwed = parseMoney(input.outstandingDebtsOwed) ?? 0;

  let uncappedRefund = 0;
  switch (input.settlementType) {
    case "FULL_REFUND":
      uncappedRefund = totalContributed;
      break;
    case "HALF_REFUND":
      uncappedRefund = Math.floor(totalContributed / 2);
      break;
    case "NO_REFUND":
      uncappedRefund = 0;
      break;
  }

  const debtsSettled = Math.min(outstandingDebtsOwed, uncappedRefund);
  const afterDebts = uncappedRefund - debtsSettled;
  const refundAmount = Math.min(afterDebts, availablePot);

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "exit_refund" as const,
    memberId: input.memberId,
    settlementType: input.settlementType,
    totalContributed,
    uncappedRefund,
    refundAmount,
    reason: input.reason.trim(),
    consentNote: input.consentNote?.trim() || null,
  };

  const parsed = ExitRefundEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid exit_refund event");
  }
  return parsed.data;
}

export interface ForfeitInput extends LedgerEnvelope {
  exitingMemberId: string;
  redistributedAmount: string;
  recipients: { memberId: string; amount: string }[];
}

export function constructForfeitRedistribution(input: ForfeitInput): ForfeitRedistributionT {
  const redistributedAmount = parseMoney(input.redistributedAmount) ?? 0;
  if (redistributedAmount <= 0) {
    throw new Error("Redistributed amount must be positive");
  }
  if (input.recipients.length === 0) {
    throw new Error("Forfeit redistribution needs at least one recipient");
  }

  const recipients = input.recipients.map((r) => ({
    memberId: r.memberId,
    amount: parseMoney(r.amount) ?? 0,
  }));

  const recipientsSum = recipients.reduce((s, r) => s + r.amount, 0);
  if (recipientsSum !== redistributedAmount) {
    throw new Error("Recipient amounts must sum to the redistributed amount");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "forfeit_redistribution" as const,
    exitingMemberId: input.exitingMemberId,
    redistributedAmount,
    recipients,
  };

  const parsed = ForfeitRedistributionEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid forfeit_redistribution event");
  }
  return parsed.data;
}

export interface DefaultInput extends LedgerEnvelope {
  memberId: string;
  periodNumber: number;
  amount: string;
  reason?: string | null;
}

export function constructDefaultEvent(input: DefaultInput): DefaultEventT {
  const amount = parseMoney(input.amount);
  if (amount === null || amount <= 0) {
    throw new Error("Default amount must be positive");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "default_event" as const,
    memberId: input.memberId,
    periodNumber: input.periodNumber,
    amount,
    reason: input.reason?.trim() || null,
  };

  const parsed = DefaultEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid default_event");
  }
  return parsed.data;
}

export interface BadDebtInput extends LedgerEnvelope {
  lenderMemberId: string;
  debtorMemberId: string;
  periodNumber: number;
  amount: string;
  reason?: string | null;
}

export function constructBadDebtEvent(input: BadDebtInput): BadDebtEventT {
  const amount = parseMoney(input.amount);
  if (amount === null || amount <= 0) {
    throw new Error("Bad debt amount must be positive");
  }
  if (input.lenderMemberId === input.debtorMemberId) {
    throw new Error("Lender and debtor must be different members");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "bad_debt_event" as const,
    lenderMemberId: input.lenderMemberId,
    debtorMemberId: input.debtorMemberId,
    periodNumber: input.periodNumber,
    amount,
    reason: input.reason?.trim() || null,
  };

  const parsed = BadDebtEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid bad_debt_event");
  }
  return parsed.data;
}

export interface CorrectionInput extends LedgerEnvelope {
  correctsEventId: string;
  reason: string;
  apply?: LedgerEventPayload;
}

export function constructCorrection(input: CorrectionInput): CorrectionT {
  if (!input.reason.trim()) {
    throw new Error("Correction reason cannot be empty");
  }

  const event = {
    id: uuidv7(),
    groupId: input.groupId,
    cycleId: input.cycleId,
    occurredAt: now(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    type: "correction" as const,
    correctsEventId: input.correctsEventId,
    reason: input.reason.trim(),
    apply: input.apply,
  };

  const parsed = CorrectionEvent.safeParse(event);
  if (!parsed.success) {
    throw new Error("Failed to build a valid correction event");
  }
  return parsed.data;
}
