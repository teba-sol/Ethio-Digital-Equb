import { z } from "zod";

export const FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const SETTLEMENT_TYPES = ["FULL_REFUND", "HALF_REFUND", "NO_REFUND"] as const;
export type SettlementType = (typeof SETTLEMENT_TYPES)[number];

export const SETTLEMENT_LABELS: Record<SettlementType, string> = {
  FULL_REFUND: "Full refund",
  HALF_REFUND: "Half refund",
  NO_REFUND: "No refund",
};

export const CONTRIBUTION_STATUSES = ["paid", "covered", "missed", "defaulted"] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

const envelopeFields = {
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  cycleId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime(),
  recordedBy: z.string(),
  deviceId: z.string(),
} as const;

// ─── Setup events (L1–L3) ────────────────────────────────────────────

export const GroupCreatedEvent = z.object({
  ...envelopeFields,
  type: z.literal("group_created"),
  name: z.string().min(1).max(100),
  defaultAmount: z.number().int().positive(),
  frequency: z.enum(FREQUENCIES),
});

export const MemberAddedEvent = z.object({
  ...envelopeFields,
  type: z.literal("member_added"),
  memberId: z.string().uuid(),
  name: z.string().min(1).max(100),
  phone: z.string().max(20).nullable(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const CycleCreatedEvent = z.object({
  ...envelopeFields,
  type: z.literal("cycle_created"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaultAmount: z.number().int().positive(),
  frequency: z.enum(FREQUENCIES),
  memberIds: z.array(z.string().uuid()).min(2),
});

// ─── Ledger event payloads (type-specific fields, no envelope) ───────

export const ContributionPayload = z.object({
  type: z.literal("contribution"),
  memberId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  amount: z.number().int().positive(),
  status: z.enum(CONTRIBUTION_STATUSES),
});

export const CoverPayload = z.object({
  type: z.literal("cover"),
  coveredMemberId: z.string().uuid(),
  coveringMemberId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  amount: z.number().int().positive(),
});

export const DeductionLine = z.object({
  kind: z.enum(["debt", "refund", "bad_debt"]),
  toMemberId: z.string().uuid().nullable(),
  fromMemberId: z.string().uuid().nullable(),
  amount: z.number().int().nonnegative(),
  note: z.string().max(200).nullable(),
});

export const PayoutPayload = z.object({
  type: z.literal("payout"),
  memberId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  grossPot: z.number().int().nonnegative(),
  deductions: z.array(DeductionLine),
  netAmount: z.number().int().nonnegative(),
});

export const ExitRefundPayload = z.object({
  type: z.literal("exit_refund"),
  memberId: z.string().uuid(),
  settlementType: z.enum(SETTLEMENT_TYPES),
  totalContributed: z.number().int().nonnegative(),
  uncappedRefund: z.number().int().nonnegative(),
  refundAmount: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500),
  consentNote: z.string().max(500).nullable(),
});

export const ForfeitRedistributionPayload = z.object({
  type: z.literal("forfeit_redistribution"),
  exitingMemberId: z.string().uuid(),
  redistributedAmount: z.number().int().nonnegative(),
  recipients: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        amount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const DefaultEventPayload = z.object({
  type: z.literal("default_event"),
  memberId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  amount: z.number().int().positive(),
  reason: z.string().max(500).nullable(),
});

export const BadDebtEventPayload = z.object({
  type: z.literal("bad_debt_event"),
  lenderMemberId: z.string().uuid(),
  debtorMemberId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  amount: z.number().int().positive(),
  reason: z.string().max(500).nullable(),
});

export const LedgerEventPayload = z.discriminatedUnion("type", [
  ContributionPayload,
  CoverPayload,
  PayoutPayload,
  ExitRefundPayload,
  ForfeitRedistributionPayload,
  DefaultEventPayload,
  BadDebtEventPayload,
]);

export type LedgerEventPayload = z.infer<typeof LedgerEventPayload>;

// ─── Full ledger events (envelope + payload) ─────────────────────────

export const ContributionEvent = z.object({
  ...envelopeFields,
  ...ContributionPayload.shape,
});

export const CoverEvent = z.object({
  ...envelopeFields,
  ...CoverPayload.shape,
});

export const PayoutEvent = z.object({
  ...envelopeFields,
  ...PayoutPayload.shape,
});

export const ExitRefundEvent = z.object({
  ...envelopeFields,
  ...ExitRefundPayload.shape,
});

export const ForfeitRedistributionEvent = z.object({
  ...envelopeFields,
  ...ForfeitRedistributionPayload.shape,
});

export const DefaultEvent = z.object({
  ...envelopeFields,
  ...DefaultEventPayload.shape,
});

export const BadDebtEvent = z.object({
  ...envelopeFields,
  ...BadDebtEventPayload.shape,
});

export const CorrectionEvent = z.object({
  ...envelopeFields,
  type: z.literal("correction"),
  correctsEventId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  apply: LedgerEventPayload.optional(),
});

// ─── The full event union ────────────────────────────────────────────

export const EkubEvent = z.discriminatedUnion("type", [
  GroupCreatedEvent,
  MemberAddedEvent,
  CycleCreatedEvent,
  ContributionEvent,
  CoverEvent,
  PayoutEvent,
  ExitRefundEvent,
  ForfeitRedistributionEvent,
  DefaultEvent,
  BadDebtEvent,
  CorrectionEvent,
]);

export type EkubEvent = z.infer<typeof EkubEvent>;
export type GroupCreated = z.infer<typeof GroupCreatedEvent>;
export type MemberAdded = z.infer<typeof MemberAddedEvent>;
export type CycleCreated = z.infer<typeof CycleCreatedEvent>;
export type Contribution = z.infer<typeof ContributionEvent>;
export type Cover = z.infer<typeof CoverEvent>;
export type Payout = z.infer<typeof PayoutEvent>;
export type ExitRefund = z.infer<typeof ExitRefundEvent>;
export type ForfeitRedistribution = z.infer<typeof ForfeitRedistributionEvent>;
export type DefaultEvent = z.infer<typeof DefaultEvent>;
export type BadDebtEvent = z.infer<typeof BadDebtEvent>;
export type Correction = z.infer<typeof CorrectionEvent>;
export type Deduction = z.infer<typeof DeductionLine>;

export const LEDGER_EVENT_TYPES = [
  "contribution",
  "cover",
  "payout",
  "exit_refund",
  "forfeit_redistribution",
  "default_event",
  "bad_debt_event",
  "correction",
] as const;

export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export const ALL_EVENT_TYPES = [
  "group_created",
  "member_added",
  "cycle_created",
  ...LEDGER_EVENT_TYPES,
] as const;
