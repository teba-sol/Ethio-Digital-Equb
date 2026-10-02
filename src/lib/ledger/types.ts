import type {
  Contribution,
  ContributionStatus,
  Correction,
  Cover,
  CycleCreated,
  DefaultEvent,
  BadDebtEvent,
  EkubEvent,
  ExitRefund,
  ForfeitRedistribution,
  GroupCreated,
  MemberAdded,
  Payout,
  SettlementType,
} from "./events";

export type EventById = ReadonlyMap<string, EkubEvent>;

export interface MemberBalance {
  memberId: string;
  name: string;
  /** Total this member has paid into the pot (their own contributions). */
  totalContributed: number;
  /** Total others have paid on this member's behalf (covers received). */
  totalCoveredForThem: number;
  /** Total this member has paid on others' behalf. */
  totalPaidForOthers: number;
  /** Total this member has received as payouts. */
  totalReceived: number;
  /** Total refunded on exit. */
  totalRefunded: number;
  /** Outstanding cover debts this member owes to others. */
  totalOwed: number;
  /** Outstanding cover debts others owe to this member. */
  totalOwedToThem: number;
  /** Amount written off as bad debt (lent but uncollectible). */
  totalBadDebt: number;
  /** Amount lost via defaults (post-payout non-payment). */
  totalDefaulted: number;
  /** Net position: positive = ahead, negative = behind (in santim). */
  netPosition: number;
  status: "active" | "exited" | "defaulted";
  hasReceivedPayout: boolean;
  /** 1-based payout position in the original cycle order, null if exited before. */
  payoutPosition: number | null;
}

export interface DebtEntry {
  id: string;
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amount: number;
  periodNumber: number;
  createdAt: string;
  settledByPayoutId: string | null;
  settledAt: string | null;
  writtenOff: boolean;
}

export interface PeriodSnapshot {
  periodNumber: number;
  /** memberId -> contribution status for this period. */
  statuses: Record<string, ContributionStatus>;
  /** Member IDs that paid their own contribution. */
  paidMemberIds: string[];
  /** Member IDs whose contribution was covered by someone else. */
  coveredMemberIds: string[];
  /** Member IDs who missed and were not covered. */
  missedMemberIds: string[];
  /** Member IDs who received the payout this period. */
  receivedMemberId: string | null;
  /** Gross pot collected this period (sum of paid + covered contributions). */
  potCollected: number;
  /** Net amount actually paid to the receiver. */
  netPaid: number;
  /** True once the payout event for this period exists. */
  completed: boolean;
}

export interface CycleState {
  cycleId: string | null;
  startDate: string | null;
  amount: number;
  frequency: CycleCreated["frequency"] | null;
  /** Original payout order (member IDs, as agreed at cycle start). */
  originalOrder: string[];
  /** Active payout order (exited members removed, relative order kept). */
  activeOrder: string[];
  /** Members who exited before payout. */
  exitedMemberIds: string[];
  /** Total payout periods planned (N or N-1 after exits). */
  totalPeriods: number;
  /** Highest period number with any event. */
  currentPeriod: number;
  /** Period number of the next payout to record, null if cycle complete. */
  nextPayoutPeriod: number | null;
  /** Member whose turn is next for payout, null if cycle complete. */
  nextPayoutMemberId: string | null;
  nextPayoutMemberName: string | null;
  /** Per-period snapshots, keyed by period number. */
  periods: Record<number, PeriodSnapshot>;
  /** True when every active member has received exactly one payout. */
  closed: boolean;
  /** Total amounts still owed as cover debts across the cycle. */
  outstandingDebtTotal: number;
}

export interface LossPosition {
  /** Sum of all default_event amounts. */
  totalDefaults: number;
  /** Sum of all bad_debt_event amounts. */
  totalBadDebts: number;
  /** Combined loss the group absorbed. */
  totalLoss: number;
  /** Per-member defaults. */
  defaultsByMember: { memberId: string; name: string; amount: number }[];
  /** Per-lender bad debts. */
  badDebtsByLender: { memberId: string; name: string; amount: number }[];
}

export interface CorrectionChainEntry {
  correctionId: string;
  correctsEventId: string;
  reason: string;
  occurredAt: string;
  hasReplacement: boolean;
}

export interface HistoryEntry {
  event: EkubEvent;
  memberName: string | null;
  counterpartName: string | null;
  description: string;
  correction: CorrectionChainEntry | null;
  correctedBy: CorrectionChainEntry | null;
  isReversed: boolean;
}

export interface LedgerView {
  group: GroupCreated | null;
  members: MemberAdded[];
  cycle: CycleCreated | null;
  memberBalances: MemberBalance[];
  debtLedger: DebtEntry[];
  cycleState: CycleState;
  lossPosition: LossPosition;
  history: HistoryEntry[];
  /** System-level check: SUM debits == SUM credits (always true if events are balanced). */
  totalContributions: number;
  totalPayouts: number;
  totalRefunds: number;
  totalCovers: number;
  totalBadDebts: number;
  totalDefaults: number;
  totalRedistributed: number;
}

export type {
  Contribution,
  ContributionStatus,
  Correction,
  Cover,
  CycleCreated,
  DefaultEvent,
  BadDebtEvent,
  EkubEvent,
  ExitRefund,
  ForfeitRedistribution,
  GroupCreated,
  MemberAdded,
  Payout,
  SettlementType,
};
