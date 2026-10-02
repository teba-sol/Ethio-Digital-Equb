import type {
  Contribution,
  Cover,
  CycleCreated,
  ExitRefund,
  MemberAdded,
  Payout,
  SettlementType,
} from "./events";
import type { DebtEntry } from "./types";

/**
 * Rule 1 — When member A misses a contribution, member B covers it.
 * The pot stays full. A owes B the covered amount.
 * Multiple covers allowed (split covers).
 */
export function computeCoverDebt(
  coveredMemberId: string,
  coveringMemberId: string,
  amount: number,
  periodNumber: number,
): Omit<DebtEntry, "fromMemberName" | "toMemberName"> {
  if (amount <= 0) throw new Error("Cover amount must be positive");
  if (coveredMemberId === coveringMemberId) {
    throw new Error("A member cannot cover their own contribution");
  }
  return {
    id: crypto.randomUUID(),
    fromMemberId: coveredMemberId,
    toMemberId: coveringMemberId,
    amount,
    periodNumber,
    createdAt: new Date().toISOString(),
    settledByPayoutId: null,
    settledAt: null,
    writtenOff: false,
  };
}

/**
 * Rule 2 — Exit is only permitted before payout.
 * Returns an error string if the exit is invalid, null if allowed.
 */
export function validateExit(
  member: { memberId: string; hasReceivedPayout: boolean },
  exit: { memberId: string },
): string | null {
  if (member.memberId !== exit.memberId) {
    return "Exit member mismatch";
  }
  if (member.hasReceivedPayout) {
    return "Exit is not permitted after a member has received their payout (Rule 2)";
  }
  return null;
}

/**
 * Rule 2 + Rule 5 — Compute the refund for an exiting member.
 * - FULL_REFUND: all contributions returned
 * - HALF_REFUND: 50% returned
 * - NO_REFUND: nothing returned
 * Refund is capped to available pot (Rule 5).
 * Cover debts are settled first from the refund (Rule 2 / DOMAIN §8.3).
 */
export function computeExitRefund(input: {
  settlementType: SettlementType;
  totalContributed: number;
  availablePot: number;
  outstandingDebtsOwed: number;
}): {
  uncappedRefund: number;
  refundAmount: number;
  debtsSettledFromRefund: number;
  remainingRefund: number;
  capped: boolean;
} {
  const { settlementType, totalContributed, availablePot, outstandingDebtsOwed } = input;

  let uncappedRefund = 0;
  switch (settlementType) {
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

  // Rule 2: debts settled first from the refund
  const debtsSettledFromRefund = Math.min(outstandingDebtsOwed, uncappedRefund);
  const afterDebts = uncappedRefund - debtsSettledFromRefund;

  // Rule 5: refund capped to available pot
  const refundAmount = Math.min(afterDebts, Math.max(0, availablePot));
  const capped = refundAmount < afterDebts;

  return {
    uncappedRefund,
    refundAmount,
    debtsSettledFromRefund,
    remainingRefund: refundAmount,
    capped,
  };
}

/**
 * Rule 4 — All debts settle at payout time.
 * Deductions are itemized: debts first, then refunds, remainder to receiver.
 * If debt exceeds pot, remainder is written off as bad_debt.
 */
export function computePayoutDeductions(input: {
  memberId: string;
  grossPot: number;
  debtsOwedToOthers: { debtId: string; toMemberId: string; amount: number }[];
  refundsDue: number;
}): {
  debtDeductions: { debtId: string; toMemberId: string; amount: number }[];
  refundDeduction: number;
  badDebtWrittenOff: number;
  netAmount: number;
} {
  const { grossPot, debtsOwedToOthers, refundsDue } = input;

  let remaining = grossPot;

  // Settle debts first (Rule 4)
  const debtDeductions: { debtId: string; toMemberId: string; amount: number }[] = [];
  let totalDebt = 0;
  for (const debt of debtsOwedToOthers) {
    if (remaining <= 0) break;
    const deducted = Math.min(debt.amount, remaining);
    debtDeductions.push({ debtId: debt.debtId, toMemberId: debt.toMemberId, amount: deducted });
    remaining -= deducted;
    totalDebt += deducted;
  }

  // Bad debt: unpaid remainder of debts
  const totalDebtOwed = debtsOwedToOthers.reduce((s, d) => s + d.amount, 0);
  const badDebtWrittenOff = totalDebtOwed - totalDebt;

  // Refunds next
  const refundDeduction = Math.min(refundsDue, remaining);
  remaining -= refundDeduction;

  return {
    debtDeductions,
    refundDeduction,
    badDebtWrittenOff,
    netAmount: remaining,
  };
}

/**
 * Rule 6 — Cycle ends one period early after exits.
 * Total periods = original member count - number of exits before payout.
 */
export function computeTotalPeriods(
  originalMemberCount: number,
  exitCount: number,
): number {
  return Math.max(1, originalMemberCount - exitCount);
}

/**
 * Rule 3 — Payout order is locked at cycle start.
 * When a member exits, their slot is removed; subsequent positions shift up.
 */
export function computeActiveOrder(
  originalOrder: string[],
  exitedMemberIds: Set<string>,
): string[] {
  return originalOrder.filter((id) => !exitedMemberIds.has(id));
}

/**
 * Given the active order and how many payouts have been completed,
 * return whose turn is next.
 */
export function computeNextPayout(
  activeOrder: string[],
  completedPayoutCount: number,
  memberNames: Map<string, string>,
): { memberId: string; name: string; periodNumber: number } | null {
  if (completedPayoutCount >= activeOrder.length) return null;
  const memberId = activeOrder[completedPayoutCount];
  return {
    memberId,
    name: memberNames.get(memberId) ?? "Unknown",
    periodNumber: completedPayoutCount + 1,
  };
}

/**
 * Compute the gross pot for a period: sum of all paid + covered contributions.
 */
export function computePeriodPot(
  contributions: Pick<Contribution, "memberId" | "amount" | "status">[],
  covers: Pick<Cover, "coveredMemberId" | "amount">[],
  cycleAmount: number,
  activeMemberCount: number,
): number {
  const paidSum = contributions
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + c.amount, 0);
  const coverSum = covers.reduce((s, c) => s + c.amount, 0);
  // Pot is full when everyone is accounted for (paid or covered)
  // In practice: paid + covered should equal cycleAmount * activeMemberCount
  // but we compute what was actually collected
  return paidSum + coverSum;
}

/**
 * Check if a contribution can be recorded.
 * Guards: member must be in cycle, period must be valid, no double-record.
 */
export function validateContribution(input: {
  memberIds: string[];
  memberId: string;
  periodNumber: number;
  totalPeriods: number;
  existingStatuses: Record<string, "paid" | "covered" | "missed" | "defaulted">;
}): string | null {
  const { memberIds, memberId, periodNumber, totalPeriods, existingStatuses } = input;

  if (!memberIds.includes(memberId)) {
    return "Member is not part of this cycle";
  }
  if (periodNumber < 1 || periodNumber > totalPeriods) {
    return `Period must be between 1 and ${totalPeriods}`;
  }
  if (existingStatuses[memberId] === "paid") {
    return "A contribution is already recorded as paid for this member in this period";
  }
  if (existingStatuses[memberId] === "covered") {
    return "This contribution is already covered by another member";
  }
  return null;
}
