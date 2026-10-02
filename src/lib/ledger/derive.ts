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
} from "./events";
import type {
  CorrectionChainEntry,
  CycleState,
  DebtEntry,
  HistoryEntry,
  LedgerView,
  LossPosition,
  MemberBalance,
  PeriodSnapshot,
} from "./types";
import {
  computeActiveOrder,
  computeNextPayout,
  computeTotalPeriods,
} from "./rules";

function sortEvents(events: EkubEvent[]): EkubEvent[] {
  return [...events].sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? a.id.localeCompare(b.id)
      : a.occurredAt.localeCompare(b.occurredAt),
  );
}

interface RawState {
  contributed: Map<string, number>;
  coveredForThem: Map<string, number>;
  paidForOthers: Map<string, number>;
  received: Map<string, number>;
  refunded: Map<string, number>;
  defaulted: Map<string, number>;
  badDebtByLender: Map<string, number>;
  debts: DebtEntry[];
  exited: Set<string>;
  exitRefunds: Map<string, ExitRefund>;
  forfeits: ForfeitRedistribution[];
  payouts: Payout[];
  completedPayoutPeriods: Set<number>;
  statuses: Map<number, Map<string, ContributionStatus>>;
  totalContributions: number;
  totalCovers: number;
  totalPayoutsGross: number;
  totalPayoutsNet: number;
  totalRefunds: number;
  totalBadDebts: number;
  totalDefaults: number;
  totalRedistributed: number;
}

function freshState(): RawState {
  return {
    contributed: new Map(),
    coveredForThem: new Map(),
    paidForOthers: new Map(),
    received: new Map(),
    refunded: new Map(),
    defaulted: new Map(),
    badDebtByLender: new Map(),
    debts: [],
    exited: new Set(),
    exitRefunds: new Map(),
    forfeits: [],
    payouts: [],
    completedPayoutPeriods: new Set(),
    statuses: new Map(),
    totalContributions: 0,
    totalCovers: 0,
    totalPayoutsGross: 0,
    totalPayoutsNet: 0,
    totalRefunds: 0,
    totalBadDebts: 0,
    totalDefaults: 0,
    totalRedistributed: 0,
  };
}

function bump(map: Map<string, number>, key: string, delta: number): void {
  const next = (map.get(key) ?? 0) + delta;
  map.set(key, Math.max(0, next));
}

function ensurePeriod(s: RawState, periodNumber: number): Map<string, ContributionStatus> {
  let m = s.statuses.get(periodNumber);
  if (!m) {
    m = new Map();
    s.statuses.set(periodNumber, m);
  }
  return m;
}

function applyContribution(s: RawState, e: Contribution): void {
  // Only "paid" contributions count as the member's own money into the pot.
  // "covered" contributions still go into the pot, but the money came from
  // the covering member — that flow is recorded by the cover event instead.
  if (e.status === "paid") {
    bump(s.contributed, e.memberId, e.amount);
  }
  s.totalContributions += e.amount;
  ensurePeriod(s, e.periodNumber).set(e.memberId, e.status);
}

function reverseContribution(s: RawState, e: Contribution): void {
  if (e.status === "paid") {
    bump(s.contributed, e.memberId, -e.amount);
  }
  s.totalContributions = Math.max(0, s.totalContributions - e.amount);
  ensurePeriod(s, e.periodNumber).delete(e.memberId);
}

function applyCover(s: RawState, e: Cover, memberNames: Map<string, string>): void {
  bump(s.coveredForThem, e.coveredMemberId, e.amount);
  bump(s.paidForOthers, e.coveringMemberId, e.amount);
  s.totalCovers += e.amount;
  ensurePeriod(s, e.periodNumber).set(e.coveredMemberId, "covered");

  s.debts.push({
    id: crypto.randomUUID(),
    fromMemberId: e.coveredMemberId,
    fromMemberName: memberNames.get(e.coveredMemberId) ?? "Unknown",
    toMemberId: e.coveringMemberId,
    toMemberName: memberNames.get(e.coveringMemberId) ?? "Unknown",
    amount: e.amount,
    periodNumber: e.periodNumber,
    createdAt: e.occurredAt,
    settledByPayoutId: null,
    settledAt: null,
    writtenOff: false,
  });
}

function reverseCover(s: RawState, e: Cover): void {
  bump(s.coveredForThem, e.coveredMemberId, -e.amount);
  bump(s.paidForOthers, e.coveringMemberId, -e.amount);
  s.totalCovers = Math.max(0, s.totalCovers - e.amount);
  ensurePeriod(s, e.periodNumber).delete(e.coveredMemberId);

  const idx = s.debts.findIndex(
    (d) =>
      d.fromMemberId === e.coveredMemberId &&
      d.toMemberId === e.coveringMemberId &&
      d.periodNumber === e.periodNumber &&
      d.amount === e.amount &&
      d.settledByPayoutId === null,
  );
  if (idx >= 0) s.debts.splice(idx, 1);
}

function applyPayout(s: RawState, e: Payout): void {
  bump(s.received, e.memberId, e.netAmount);
  s.payouts.push(e);
  s.completedPayoutPeriods.add(e.periodNumber);
  s.totalPayoutsGross += e.grossPot;
  s.totalPayoutsNet += e.netAmount;

  for (const d of e.deductions) {
    if (d.kind === "debt" && d.fromMemberId && d.toMemberId) {
      const debt = s.debts.find(
        (debt) =>
          debt.fromMemberId === d.fromMemberId &&
          debt.toMemberId === d.toMemberId &&
          debt.settledByPayoutId === null &&
          !debt.writtenOff,
      );
      if (debt) {
        debt.settledByPayoutId = e.id;
        debt.settledAt = e.occurredAt;
        if (d.amount < debt.amount) {
          const remainder = debt.amount - d.amount;
          debt.amount = d.amount;
          s.debts.push({
            ...debt,
            id: crypto.randomUUID(),
            amount: remainder,
          });
        }
      }
    } else if (d.kind === "refund" && d.toMemberId) {
      bump(s.refunded, d.toMemberId, d.amount);
      s.totalRefunds += d.amount;
    } else if (d.kind === "bad_debt" && d.fromMemberId) {
      bump(s.badDebtByLender, d.fromMemberId, d.amount);
      s.totalBadDebts += d.amount;
      const debt = s.debts.find(
        (debt) => debt.fromMemberId === d.fromMemberId && debt.settledByPayoutId === null && !debt.writtenOff,
      );
      if (debt) {
        debt.writtenOff = true;
        debt.settledByPayoutId = e.id;
        debt.settledAt = e.occurredAt;
      }
    }
  }
}

function reversePayout(s: RawState, e: Payout): void {
  bump(s.received, e.memberId, -e.netAmount);
  s.completedPayoutPeriods.delete(e.periodNumber);
  s.totalPayoutsGross = Math.max(0, s.totalPayoutsGross - e.grossPot);
  s.totalPayoutsNet = Math.max(0, s.totalPayoutsNet - e.netAmount);

  const idx = s.payouts.findIndex((p) => p.id === e.id);
  if (idx >= 0) s.payouts.splice(idx, 1);

  for (const d of e.deductions) {
    if (d.kind === "debt") {
      const debt = s.debts.find((debt) => debt.settledByPayoutId === e.id && !debt.writtenOff);
      if (debt) {
        debt.settledByPayoutId = null;
        debt.settledAt = null;
      }
      const wd = s.debts.find((debt) => debt.settledByPayoutId === e.id && debt.writtenOff);
      if (wd) {
        wd.settledByPayoutId = null;
        wd.settledAt = null;
        wd.writtenOff = false;
      }
    } else if (d.kind === "refund" && d.toMemberId) {
      bump(s.refunded, d.toMemberId, -d.amount);
      s.totalRefunds = Math.max(0, s.totalRefunds - d.amount);
    } else if (d.kind === "bad_debt" && d.fromMemberId) {
      bump(s.badDebtByLender, d.fromMemberId, -d.amount);
      s.totalBadDebts = Math.max(0, s.totalBadDebts - d.amount);
    }
  }
}

function applyExitRefund(s: RawState, e: ExitRefund): void {
  s.exited.add(e.memberId);
  s.exitRefunds.set(e.memberId, e);
  if (e.refundAmount > 0) {
    bump(s.refunded, e.memberId, e.refundAmount);
    s.totalRefunds += e.refundAmount;
  }
}

function reverseExitRefund(s: RawState, e: ExitRefund): void {
  s.exited.delete(e.memberId);
  s.exitRefunds.delete(e.memberId);
  if (e.refundAmount > 0) {
    bump(s.refunded, e.memberId, -e.refundAmount);
    s.totalRefunds = Math.max(0, s.totalRefunds - e.refundAmount);
  }
}

function applyForfeit(s: RawState, e: ForfeitRedistribution): void {
  s.forfeits.push(e);
  s.totalRedistributed += e.redistributedAmount;
}

function reverseForfeit(s: RawState, e: ForfeitRedistribution): void {
  const idx = s.forfeits.findIndex((f) => f.id === e.id);
  if (idx >= 0) s.forfeits.splice(idx, 1);
  s.totalRedistributed = Math.max(0, s.totalRedistributed - e.redistributedAmount);
}

function applyDefault(s: RawState, e: DefaultEvent): void {
  bump(s.defaulted, e.memberId, e.amount);
  s.totalDefaults += e.amount;
  ensurePeriod(s, e.periodNumber).set(e.memberId, "defaulted");
}

function reverseDefault(s: RawState, e: DefaultEvent): void {
  bump(s.defaulted, e.memberId, -e.amount);
  s.totalDefaults = Math.max(0, s.totalDefaults - e.amount);
  ensurePeriod(s, e.periodNumber).delete(e.memberId);
}

function applyBadDebt(s: RawState, e: BadDebtEvent): void {
  bump(s.badDebtByLender, e.lenderMemberId, e.amount);
  s.totalBadDebts += e.amount;
}

function reverseBadDebt(s: RawState, e: BadDebtEvent): void {
  bump(s.badDebtByLender, e.lenderMemberId, -e.amount);
  s.totalBadDebts = Math.max(0, s.totalBadDebts - e.amount);
}

function applyEffect(s: RawState, e: EkubEvent, memberNames: Map<string, string>): void {
  switch (e.type) {
    case "contribution":
      applyContribution(s, e);
      break;
    case "cover":
      applyCover(s, e, memberNames);
      break;
    case "payout":
      applyPayout(s, e);
      break;
    case "exit_refund":
      applyExitRefund(s, e);
      break;
    case "forfeit_redistribution":
      applyForfeit(s, e);
      break;
    case "default_event":
      applyDefault(s, e);
      break;
    case "bad_debt_event":
      applyBadDebt(s, e);
      break;
    default:
      break;
  }
}

function reverseEffect(s: RawState, e: EkubEvent): void {
  switch (e.type) {
    case "contribution":
      reverseContribution(s, e);
      break;
    case "cover":
      reverseCover(s, e);
      break;
    case "payout":
      reversePayout(s, e);
      break;
    case "exit_refund":
      reverseExitRefund(s, e);
      break;
    case "forfeit_redistribution":
      reverseForfeit(s, e);
      break;
    case "default_event":
      reverseDefault(s, e);
      break;
    case "bad_debt_event":
      reverseBadDebt(s, e);
      break;
    default:
      break;
  }
}

function toPseudoEvent(correction: Correction): EkubEvent | null {
  if (!correction.apply) return null;
  return { ...correction, ...correction.apply, type: correction.apply.type } as EkubEvent;
}

function describeEvent(e: EkubEvent, names: Map<string, string>): string {
  switch (e.type) {
    case "group_created":
      return `Group "${e.name}" created`;
    case "member_added":
      return `${e.name} added to the group`;
    case "cycle_created":
      return `Cycle created with ${e.memberIds.length} members, starting ${e.startDate}`;
    case "contribution": {
      const name = names.get(e.memberId) ?? "Member";
      return `${name}: contribution for period ${e.periodNumber} (${e.status})`;
    }
    case "cover": {
      const covered = names.get(e.coveredMemberId) ?? "Member";
      const covering = names.get(e.coveringMemberId) ?? "Member";
      return `${covering} covered ${covered}'s contribution for period ${e.periodNumber}`;
    }
    case "payout": {
      const name = names.get(e.memberId) ?? "Member";
      return `${name} received payout for period ${e.periodNumber}`;
    }
    case "exit_refund": {
      const name = names.get(e.memberId) ?? "Member";
      return `${name} exited (${e.settlementType})`;
    }
    case "forfeit_redistribution": {
      const name = names.get(e.exitingMemberId) ?? "Member";
      return `Forfeit redistribution from ${name}`;
    }
    case "default_event": {
      const name = names.get(e.memberId) ?? "Member";
      return `${name} defaulted for period ${e.periodNumber}`;
    }
    case "bad_debt_event": {
      const lender = names.get(e.lenderMemberId) ?? "Lender";
      const debtor = names.get(e.debtorMemberId) ?? "Debtor";
      return `Bad debt: ${lender} lent ${debtor} (written off)`;
    }
    case "correction":
      return `Correction: ${e.reason}`;
    default:
      return "Event";
  }
}

function memberNameOf(e: EkubEvent, names: Map<string, string>): string | null {
  switch (e.type) {
    case "contribution":
    case "default_event":
    case "exit_refund":
      return names.get(e.memberId) ?? null;
    case "cover":
      return names.get(e.coveredMemberId) ?? null;
    case "payout":
      return names.get(e.memberId) ?? null;
    case "forfeit_redistribution":
      return names.get(e.exitingMemberId) ?? null;
    case "bad_debt_event":
      return names.get(e.debtorMemberId) ?? null;
    case "member_added":
      return e.name;
    default:
      return null;
  }
}

function counterpartNameOf(e: EkubEvent, names: Map<string, string>): string | null {
  switch (e.type) {
    case "cover":
      return names.get(e.coveringMemberId) ?? null;
    case "bad_debt_event":
      return names.get(e.lenderMemberId) ?? null;
    case "forfeit_redistribution":
      return e.recipients.map((r) => names.get(r.memberId) ?? "Unknown").join(", ");
    default:
      return null;
  }
}

/**
 * The single place balances are computed (ARCHITECTURE §7).
 * Pure: same events in, same view out. No I/O.
 *
 * Corrections compose for free: a correction is itself an event whose
 * effect is the mirror of the original. We apply every event in order;
 * when we hit a correction we reverse the corrected event's effect and
 * optionally apply the replacement. Correction chains work because each
 * correction references the event it corrects — including a prior correction.
 */
export function derive(events: EkubEvent[]): LedgerView {
  const sorted = sortEvents(events);
  const eventsById = new Map<string, EkubEvent>(sorted.map((e) => [e.id, e]));

  let group: GroupCreated | null = null;
  const members: MemberAdded[] = [];
  let cycle: CycleCreated | null = null;

  for (const e of sorted) {
    if (e.type === "group_created") group = e;
    else if (e.type === "member_added") members.push(e);
    else if (e.type === "cycle_created") cycle = e;
  }

  const memberNames = new Map(members.map((m) => [m.memberId, m.name]));

  // Build map: eventId -> correction that corrects it
  const correctionsByTarget = new Map<string, Correction>();
  for (const e of sorted) {
    if (e.type === "correction") {
      correctionsByTarget.set(e.correctsEventId, e);
    }
  }

  // Walk events in order, applying effects and handling corrections
  const s = freshState();
  for (const e of sorted) {
    if (e.type === "correction") {
      // Reverse the event being corrected
      const original = eventsById.get(e.correctsEventId);
      if (original) {
        if (original.type === "correction") {
          // Correction-of-correction: reverse the apply pseudo-event of the first correction
          const pseudo = toPseudoEvent(original);
          if (pseudo) reverseEffect(s, pseudo);
        } else {
          reverseEffect(s, original);
        }
      }
      // Apply the replacement if present
      const pseudoApply = toPseudoEvent(e);
      if (pseudoApply) applyEffect(s, pseudoApply, memberNames);
    } else {
      applyEffect(s, e, memberNames);
    }
  }

  // ── Derived views ─────────────────────────────────────────────────

  const memberBalances: MemberBalance[] = members.map((m) => {
    const id = m.memberId;
    const totalContributed = s.contributed.get(id) ?? 0;
    const totalCoveredForThem = s.coveredForThem.get(id) ?? 0;
    const totalPaidForOthers = s.paidForOthers.get(id) ?? 0;
    const totalReceived = s.received.get(id) ?? 0;
    const totalRefunded = s.refunded.get(id) ?? 0;
    const totalDefaulted = s.defaulted.get(id) ?? 0;
    const totalBadDebt = s.badDebtByLender.get(id) ?? 0;

    let totalOwed = 0;
    let totalOwedToThem = 0;
    for (const d of s.debts) {
      if (d.settledByPayoutId === null && !d.writtenOff) {
        if (d.fromMemberId === id) totalOwed += d.amount;
        if (d.toMemberId === id) totalOwedToThem += d.amount;
      }
    }

    const hasReceivedPayout = s.payouts.some((p) => p.memberId === id);
    const isExited = s.exited.has(id);
    const isDefaulted = totalDefaulted > 0;
    const payoutPosition = cycle ? cycle.memberIds.indexOf(id) + 1 : null;

    const netPosition =
      totalContributed + totalCoveredForThem - totalPaidForOthers - totalReceived - totalRefunded;

    let status: MemberBalance["status"] = "active";
    if (isExited) status = "exited";
    else if (isDefaulted) status = "defaulted";

    return {
      memberId: id,
      name: m.name,
      totalContributed,
      totalCoveredForThem,
      totalPaidForOthers,
      totalReceived,
      totalRefunded,
      totalOwed,
      totalOwedToThem,
      totalBadDebt,
      totalDefaulted,
      netPosition,
      status,
      hasReceivedPayout,
      payoutPosition,
    };
  });

  const originalOrder = cycle ? cycle.memberIds : [];
  const activeOrder = computeActiveOrder(originalOrder, s.exited);
  const totalPeriods = computeTotalPeriods(originalOrder.length, s.exited.size);
  const completedCount = s.completedPayoutPeriods.size;
  const nextPayout = computeNextPayout(activeOrder, completedCount, memberNames);

  const periods: Record<number, PeriodSnapshot> = {};
  const allPeriodNumbers = new Set<number>([
    ...s.statuses.keys(),
    ...s.completedPayoutPeriods,
  ]);
  for (const pn of allPeriodNumbers) {
    const statusMap = s.statuses.get(pn) ?? new Map<string, ContributionStatus>();
    const paidMemberIds: string[] = [];
    const coveredMemberIds: string[] = [];
    const missedMemberIds: string[] = [];
    for (const [mid, status] of statusMap) {
      if (status === "paid") paidMemberIds.push(mid);
      else if (status === "covered") coveredMemberIds.push(mid);
      else if (status === "missed") missedMemberIds.push(mid);
    }
    const payout = s.payouts.find((p) => p.periodNumber === pn);
    periods[pn] = {
      periodNumber: pn,
      statuses: Object.fromEntries(statusMap),
      paidMemberIds,
      coveredMemberIds,
      missedMemberIds,
      receivedMemberId: payout?.memberId ?? null,
      potCollected:
        cycle != null
          ? (paidMemberIds.length + coveredMemberIds.length) * cycle.defaultAmount
          : 0,
      netPaid: payout?.netAmount ?? 0,
      completed: s.completedPayoutPeriods.has(pn),
    };
  }

  const cycleState: CycleState = {
    cycleId: cycle?.id ?? null,
    startDate: cycle?.startDate ?? null,
    amount: cycle?.defaultAmount ?? 0,
    frequency: cycle?.frequency ?? null,
    originalOrder,
    activeOrder,
    exitedMemberIds: [...s.exited],
    totalPeriods,
    currentPeriod: Math.max(1, ...allPeriodNumbers),
    nextPayoutPeriod: nextPayout?.periodNumber ?? null,
    nextPayoutMemberId: nextPayout?.memberId ?? null,
    nextPayoutMemberName: nextPayout?.name ?? null,
    periods,
    closed: completedCount >= totalPeriods && totalPeriods > 0,
    outstandingDebtTotal: s.debts
      .filter((d) => d.settledByPayoutId === null && !d.writtenOff)
      .reduce((sum, d) => sum + d.amount, 0),
  };

  const debtLedger: DebtEntry[] = [...s.debts].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const defaultsByMember = memberBalances
    .filter((mb) => mb.totalDefaulted > 0)
    .map((mb) => ({ memberId: mb.memberId, name: mb.name, amount: mb.totalDefaulted }));

  const badDebtsByLender = memberBalances
    .filter((mb) => mb.totalBadDebt > 0)
    .map((mb) => ({ memberId: mb.memberId, name: mb.name, amount: mb.totalBadDebt }));

  const lossPosition: LossPosition = {
    totalDefaults: s.totalDefaults,
    totalBadDebts: s.totalBadDebts,
    totalLoss: s.totalDefaults + s.totalBadDebts,
    defaultsByMember,
    badDebtsByLender,
  };

  const history: HistoryEntry[] = sorted.map((e) => {
    const correctedByEntry = correctionsByTarget.get(e.id);
    const correctedBy: CorrectionChainEntry | null = correctedByEntry
      ? {
          correctionId: correctedByEntry.id,
          correctsEventId: correctedByEntry.correctsEventId,
          reason: correctedByEntry.reason,
          occurredAt: correctedByEntry.occurredAt,
          hasReplacement: correctedByEntry.apply != null,
        }
      : null;

    return {
      event: e,
      memberName: memberNameOf(e, memberNames),
      counterpartName: counterpartNameOf(e, memberNames),
      description: describeEvent(e, memberNames),
      correction: null,
      correctedBy,
      isReversed: correctedBy != null,
    };
  });

  return {
    group,
    members,
    cycle,
    memberBalances,
    debtLedger,
    cycleState,
    lossPosition,
    history,
    totalContributions: s.totalContributions,
    totalPayouts: s.totalPayoutsNet,
    totalRefunds: s.totalRefunds,
    totalCovers: s.totalCovers,
    totalBadDebts: s.totalBadDebts,
    totalDefaults: s.totalDefaults,
    totalRedistributed: s.totalRedistributed,
  };
}
